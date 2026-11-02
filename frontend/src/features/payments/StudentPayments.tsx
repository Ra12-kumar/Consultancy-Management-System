"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Alert, Badge, EmptyState } from "@/components/ui/Feedback";
import { LoadState, PageTitle, fmtDate } from "@/features/admin/shared";
import { useApiData } from "@/hooks/useApiData";
import { formatINR } from "@/lib/format";
import { apiGet, apiPost } from "@/services/api";
import type { ApiError } from "@/types/api";

type Payment = { reference: string; id: string; description: string; amountMinor: number; status: string; receiptNumber: string | null; paidAt: string | null; razorpayPaymentId: string | null; createdAt: string };
type Order = { keyId: string; orderId: string; amount: number; currency: string; name: string; description: string; reference: string; prefill: { name: string; email: string; contact: string } };
type CheckoutResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayCtor = new (o: Record<string, unknown>) => { open(): void; on(event: string, cb: (r: { error?: { description?: string } }) => void): void };

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "neutral" | "gold" | "danger" }> = {
  requested: { label: "To pay", tone: "gold" },
  pending: { label: "Payment started", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  failed: { label: "Failed – try again", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

// Razorpay's checkout script, loaded only when a student chooses to pay.
function loadCheckout(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error("Checkout did not load")));
    s.onerror = () => reject(new Error("Could not load the payment window. Check your connection."));
    document.body.appendChild(s);
  });
}

export function StudentPayments() {
  const data = useApiData((signal) => apiGet<{ payments: Payment[]; enabled: boolean }>("/payments", { signal }), []);
  const [state, setState] = useState<{ busy: string | null; error?: string; ok?: string }>({ busy: null });

  async function pay(p: Payment) {
    setState({ busy: p.reference });
    try {
      const order = await apiPost<Order>(`/payments/${p.reference}/order`);
      const Razorpay = await loadCheckout();
      const rzp = new Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: order.name,
        description: order.description,
        prefill: order.prefill,
        theme: { color: "#0b1f44" },
        // The payment counts only after our server verifies Razorpay's signature.
        handler: async (r: CheckoutResponse) => {
          try {
            await apiPost(`/payments/${p.reference}/verify`, r);
            setState({ busy: null, ok: "Payment received. Thank you! Your receipt is below and in your email." });
          } catch (err) {
            setState({ busy: null, error: (err as ApiError).message });
          }
          data.reload();
        },
        modal: { ondismiss: () => setState({ busy: null }) },
      });
      rzp.on("payment.failed", (r) => setState({ busy: null, error: r.error?.description ?? "The payment failed. You were not charged; please try again." }));
      rzp.open();
    } catch (err) {
      setState({ busy: null, error: (err as ApiError).message ?? (err as Error).message });
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Payments" subtitle="Payment requests for Udaan’s service charge. Official college fees are paid to the college directly." />
      {state.ok && <Alert tone="success">{state.ok}</Alert>}
      {state.error && <Alert>{state.error}</Alert>}
      {!data.data ? (
        <LoadState status={data.status} error={data.error} reload={data.reload} />
      ) : data.data.payments.length === 0 ? (
        <EmptyState title="Nothing to pay">Your counsellor will send a payment request if one is needed.</EmptyState>
      ) : (
        <>
          {!data.data.enabled && data.data.payments.some((p) => ["requested", "failed"].includes(p.status)) && <Alert tone="info">Online payment is not available yet. Your counsellor will tell you how to pay.</Alert>}
          <ul className="space-y-3">
            {data.data.payments.map((p) => (
              <li key={p.reference} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold">{formatINR(p.amountMinor, true)}</span>
                  <span className="block text-muted">
                    {p.description || "Consultancy service charge"} · <span className="font-mono">{p.reference}</span> · {fmtDate(p.createdAt)}
                  </span>
                </span>
                <Badge tone={STATUS[p.status]!.tone}>{STATUS[p.status]!.label}</Badge>
                {p.status === "paid" ? (
                  <ButtonLink href={`/student/payments/${p.reference}`} size="sm" variant="secondary">
                    Receipt
                  </ButtonLink>
                ) : (
                  ["requested", "pending", "failed"].includes(p.status) &&
                  data.data!.enabled && (
                    <Button size="sm" variant="gold" disabled={state.busy !== null} onClick={() => pay(p)}>
                      {state.busy === p.reference ? "Opening…" : "Pay now"}
                    </Button>
                  )
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Payments are processed securely by Razorpay. Udaan never sees your card or bank details.</p>
        </>
      )}
    </div>
  );
}

// /student/payments/[reference]: a printable receipt.
export function PaymentReceipt() {
  const { reference } = useParams<{ reference: string }>();
  const d = useApiData((signal) => apiGet<Payment & { payer: { name: string; email: string } }>(`/payments/${encodeURIComponent(reference)}`, { signal }), [reference]);
  if (!d.data) return <LoadState status={d.status} error={d.error} reload={d.reload} />;
  const p = d.data;
  if (p.status !== "paid") return <Alert tone="info">This payment has not been completed yet.</Alert>;
  return (
    <div className="space-y-4">
      <p className="text-sm print:hidden">
        <Link href="/student/payments" className="text-muted hover:underline">
          ← Payments
        </Link>
      </p>
      <article className="mx-auto max-w-xl rounded-2xl border border-line bg-surface p-6 print:border-0">
        <p className="text-sm font-semibold tracking-widest text-accent-text uppercase">Payment receipt</p>
        <h1 className="mt-1 text-2xl font-bold">Udaan</h1>
        <dl className="mt-6 grid grid-cols-2 gap-y-3 text-sm">
          <dt className="text-muted">Receipt number</dt>
          <dd className="font-mono font-semibold">{p.receiptNumber}</dd>
          <dt className="text-muted">Date</dt>
          <dd>{fmtDate(p.paidAt)}</dd>
          <dt className="text-muted">Received from</dt>
          <dd>
            {p.payer.name}
            <span className="block text-xs text-muted">{p.payer.email}</span>
          </dd>
          <dt className="text-muted">For</dt>
          <dd>{p.description || "Consultancy service charge"}</dd>
          <dt className="text-muted">Amount</dt>
          <dd className="text-lg font-bold">{formatINR(p.amountMinor, true)}</dd>
          <dt className="text-muted">Payment reference</dt>
          <dd className="font-mono">{p.reference}</dd>
          <dt className="text-muted">Razorpay payment id</dt>
          <dd className="font-mono text-xs break-all">{p.razorpayPaymentId}</dd>
        </dl>
        <p className="mt-6 text-xs text-muted">This receipt covers Udaan’s consultancy service charge only. It is not a receipt for any college fee.</p>
      </article>
      <div className="text-center print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>
          Print or save as PDF
        </Button>
      </div>
    </div>
  );
}
