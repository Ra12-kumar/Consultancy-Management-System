"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Alert, Badge, Card, EmptyState } from "@/components/ui/Feedback";
import { FeeBreakdown } from "@/features/catalog/CatalogUi";
import { LoadState, fmtDate } from "@/features/admin/shared";
import { useApiData } from "@/hooks/useApiData";
import { FREQUENCIES, durationLabel, formatINR, paiseToRupees, rupeesToPaise } from "@/lib/format";
import { apiGet, apiPost, apiPut, fieldErrors } from "@/services/api";
import type { AdminFee, AdminOffering, FeeBreakdown as Breakdown, FeeComponentInput, FeeDiscountInput, FeeFrequency, FeeKey } from "@/types/catalog";

export const FEE_ROWS: Array<[FeeKey, string, FeeFrequency]> = [
  ["tuition", "Tuition fee", "per_year"],
  ["registration", "Registration fee", "one_time"],
  ["admission", "Admission fee", "one_time"],
  ["examination", "Examination fee", "per_semester"],
  ["laboratory", "Laboratory fee", "per_year"],
  ["other_mandatory", "Other mandatory fees", "per_year"],
  ["hostel", "Hostel (optional)", "per_year"],
  ["transport", "Transport (optional)", "per_year"],
];

type Form = {
  academicYear: string;
  intake: string;
  amounts: Record<FeeKey, string>;
  frequencies: Record<FeeKey, FeeFrequency>;
  consultancy: string;
  discountType: "" | "percent" | "fixed";
  discountValue: string;
  discountMax: string;
  discountNote: string;
  paymentSchedule: string;
  notes: string;
  effectiveFrom: string;
  lastVerifiedAt: string;
  sourceRef: string;
};

const thisYear = () => {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
};
const day = (d: string | null) => (d ? d.slice(0, 10) : "");

export function formFromFee(f?: AdminFee): Form {
  const amounts = Object.fromEntries(FEE_ROWS.map(([k]) => [k, ""])) as Record<FeeKey, string>;
  const frequencies = Object.fromEntries(FEE_ROWS.map(([k, , freq]) => [k, freq])) as Record<FeeKey, FeeFrequency>;
  for (const c of f?.components ?? []) {
    amounts[c.key] = paiseToRupees(c.amountMinor);
    frequencies[c.key] = c.frequency;
  }
  const d = f?.discount;
  return {
    academicYear: f?.academicYear ?? thisYear(),
    intake: f?.intake ?? "",
    amounts,
    frequencies,
    consultancy: paiseToRupees(f?.consultancyServiceChargeMinor ?? 0),
    discountType: d?.type ?? "",
    discountValue: d ? (d.type === "percent" ? String(d.value) : paiseToRupees(d.value)) : "",
    discountMax: d?.maxMinor != null ? paiseToRupees(d.maxMinor) : "",
    discountNote: d?.note ?? "",
    paymentSchedule: f?.paymentSchedule ?? "",
    notes: f?.notes ?? "",
    effectiveFrom: day(f?.effectiveFrom ?? null),
    lastVerifiedAt: day(f?.lastVerifiedAt ?? null),
    sourceRef: f?.sourceRef ?? "",
  };
}

// Converts the form (rupees) to the API body (integer paise). Returns errors keyed by field instead when invalid.
export function feeBody(form: Form): { body?: Record<string, unknown>; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const components: FeeComponentInput[] = [];
  for (const [key] of FEE_ROWS) {
    const raw = form.amounts[key].trim();
    if (!raw) continue;
    const minor = rupeesToPaise(raw);
    if (minor == null) errors[`amount.${key}`] = "Enter an amount in rupees (up to 2 decimals)";
    else components.push({ key, amountMinor: minor, frequency: form.frequencies[key] });
  }
  if (!components.some((c) => c.key === "tuition") && !errors["amount.tuition"]) errors["amount.tuition"] = "Enter the tuition fee";
  const consultancy = form.consultancy.trim() ? rupeesToPaise(form.consultancy) : 0;
  if (consultancy == null) errors.consultancy = "Enter an amount in rupees";
  if (!/^\d{4}-\d{2}$/.test(form.academicYear.trim())) errors.academicYear = "Use the form 2026-27";
  let discount: FeeDiscountInput = null;
  if (form.discountType === "percent") {
    const v = Number(form.discountValue);
    const max = form.discountMax.trim() ? rupeesToPaise(form.discountMax) : null;
    if (!form.discountValue.trim() || !(v >= 0 && v <= 100)) errors.discountValue = "Enter a percentage from 0 to 100";
    if (form.discountMax.trim() && max == null) errors.discountMax = "Enter an amount in rupees";
    discount = { type: "percent", value: v, maxMinor: max, note: form.discountNote.trim() };
  } else if (form.discountType === "fixed") {
    const v = rupeesToPaise(form.discountValue);
    if (v == null) errors.discountValue = "Enter an amount in rupees";
    discount = { type: "fixed", value: v ?? 0, maxMinor: null, note: form.discountNote.trim() };
  }
  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    body: {
      academicYear: form.academicYear.trim(),
      intake: form.intake.trim(),
      components,
      consultancyServiceChargeMinor: consultancy,
      discount,
      paymentSchedule: form.paymentSchedule.trim(),
      notes: form.notes.trim(),
      effectiveFrom: form.effectiveFrom || null,
      lastVerifiedAt: form.lastVerifiedAt || null,
      sourceRef: form.sourceRef.trim(),
    },
  };
}

const STATUS_TONE = { draft: "gold", published: "success", superseded: "neutral", archived: "neutral" } as const;

function DraftForm({ offering, fee, onSaved, onCancel }: { offering: AdminOffering; fee?: AdminFee; onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<Form>(() => formFromFee(fee));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Breakdown | null>(fee?.breakdown ?? null);
  const [status, setStatus] = useState<{ busy: boolean; message?: string; tone?: "error" | "success" }>({ busy: false });
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  async function runPreview() {
    const { body, errors } = feeBody(form);
    setErrors(errors);
    if (!body) return;
    try {
      setPreview(await apiPost<Breakdown>("/admin/fees/preview", { durationMonths: offering.durationMonths, components: body.components, consultancyServiceChargeMinor: body.consultancyServiceChargeMinor, discount: body.discount }));
    } catch (e) {
      setStatus({ busy: false, tone: "error", message: (e as { message?: string }).message });
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    const { body, errors } = feeBody(form);
    setErrors(errors);
    if (!body) return;
    setStatus({ busy: true });
    try {
      const saved = fee ? await apiPut<AdminFee>(`/admin/fees/${fee.id}`, body) : await apiPost<AdminFee>(`/admin/offerings/${offering.id}/fees`, body);
      setPreview(saved.breakdown);
      setStatus({ busy: false, tone: "success", message: "Draft saved. It is not visible to students until published." });
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
      setStatus({ busy: false, tone: "error", message: (err as { message?: string }).message });
    }
  }

  return (
    <form onSubmit={save} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Academic year" required value={form.academicYear} onChange={(e) => set({ academicYear: e.target.value })} error={errors.academicYear} hint="e.g. 2026-27" />
        <TextField label="Intake" value={form.intake} onChange={(e) => set({ intake: e.target.value })} hint="e.g. July (optional)" maxLength={40} />
        <TextField label="Effective from" type="date" value={form.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} />
      </div>
      <fieldset>
        <legend className="text-sm font-semibold">Fee components (₹, leave blank if not charged)</legend>
        <p className="text-xs text-muted">Course duration: {durationLabel(offering.durationMonths)}. Totals are calculated by the server.</p>
        <div className="mt-3 grid gap-3">
          {FEE_ROWS.map(([key, label]) => (
            <div key={key} className="grid gap-2 sm:grid-cols-[1fr_12rem] sm:items-start">
              <TextField label={`${label} (₹)`} inputMode="decimal" value={form.amounts[key]} onChange={(e) => set({ amounts: { ...form.amounts, [key]: e.target.value } })} error={errors[`amount.${key}`]} />
              <SelectField label={`${label} charged`} value={form.frequencies[key]} onChange={(e) => set({ frequencies: { ...form.frequencies, [key]: e.target.value as FeeFrequency } })}>
                {Object.entries(FREQUENCIES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </SelectField>
            </div>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Udaan service charge (₹, separate from college fees)" inputMode="decimal" value={form.consultancy} onChange={(e) => set({ consultancy: e.target.value })} error={errors.consultancy} />
        <SelectField label="Discount on tuition" value={form.discountType} onChange={(e) => set({ discountType: e.target.value as Form["discountType"] })}>
          <option value="">No discount</option>
          <option value="percent">Percentage of tuition</option>
          <option value="fixed">Fixed amount</option>
        </SelectField>
        {form.discountType && (
          <>
            <TextField label={form.discountType === "percent" ? "Discount (%)" : "Discount (₹)"} inputMode="decimal" value={form.discountValue} onChange={(e) => set({ discountValue: e.target.value })} error={errors.discountValue} />
            {form.discountType === "percent" && <TextField label="Maximum discount (₹, optional)" inputMode="decimal" value={form.discountMax} onChange={(e) => set({ discountMax: e.target.value })} error={errors.discountMax} />}
            <TextField label="Discount note" value={form.discountNote} onChange={(e) => set({ discountNote: e.target.value })} maxLength={200} />
          </>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Official source (URL or document reference)" value={form.sourceRef} onChange={(e) => set({ sourceRef: e.target.value })} error={errors.sourceRef} hint="Required before publishing" maxLength={500} />
        <TextField label="Fees verified on" type="date" value={form.lastVerifiedAt} onChange={(e) => set({ lastVerifiedAt: e.target.value })} error={errors.lastVerifiedAt} hint="Required before publishing" />
        <TextAreaField label="Payment schedule (only if verified)" value={form.paymentSchedule} onChange={(e) => set({ paymentSchedule: e.target.value })} maxLength={1000} />
        <TextAreaField label="Notes for students" value={form.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={1000} />
      </div>
      {status.message && <Alert tone={status.tone ?? "info"}>{status.message}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={runPreview}>
          Preview totals
        </Button>
        <Button type="submit" disabled={status.busy}>
          {status.busy ? "Saving…" : fee ? "Save draft" : "Create draft"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Close
        </Button>
      </div>
      {preview && (
        <Card>
          <h3 className="mb-2 font-semibold">Server-calculated preview</h3>
          <FeeBreakdown breakdown={preview} />
        </Card>
      )}
    </form>
  );
}

// Fee history for one offering, with draft editing and publishing (pricing.manage).
export function OfferingFees({ offering, courseName }: { offering: AdminOffering; courseName: string }) {
  const fees = useApiData((signal) => apiGet<AdminFee[]>(`/admin/offerings/${offering.id}/fees`, { signal }), [offering.id]);
  const [editing, setEditing] = useState<AdminFee | "new" | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function act(fee: AdminFee, action: "publish" | "archive") {
    const ok = window.confirm(
      action === "publish"
        ? `Publish version ${fee.version} (${fee.academicYear})? Students will see it, and any currently published version for the same year and intake becomes history.`
        : `Archive version ${fee.version}? It will no longer be shown to students.`,
    );
    if (!ok) return;
    setMessage(null);
    try {
      await apiPost(`/admin/fees/${fee.id}/${action}`);
      setMessage({ tone: "success", text: action === "publish" ? "Published." : "Archived." });
      setEditing(null);
      fees.reload();
    } catch (e) {
      setMessage({ tone: "error", text: (e as { message?: string }).message ?? "Something went wrong" });
    }
  }

  return (
    <section aria-label={`Fees for ${courseName}`} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">
          {courseName}
          {offering.specialization && ` · ${offering.specialization}`}
        </h3>
        {editing === null && (
          <Button size="sm" onClick={() => setEditing("new")}>
            New fee draft
          </Button>
        )}
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {editing !== null && (
        <Card>
          <DraftForm key={editing === "new" ? "new" : editing.id} offering={offering} fee={editing === "new" ? undefined : editing} onSaved={fees.reload} onCancel={() => setEditing(null)} />
        </Card>
      )}
      {!fees.data ? (
        <LoadState status={fees.status} error={fees.error} reload={fees.reload} rows={2} />
      ) : fees.data.length === 0 ? (
        <EmptyState title="No fees yet">Create a draft, check the preview, then publish it.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">Fee versions</caption>
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-2">Version</th>
                <th>Year / intake</th>
                <th>Status</th>
                <th className="text-right">Official total</th>
                <th className="text-right">Service charge</th>
                <th>Updated</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {fees.data.map((f) => (
                <tr key={f.id} className="border-t border-line">
                  <td className="py-2">v{f.version}</td>
                  <td>
                    {f.academicYear}
                    {f.intake && ` · ${f.intake}`}
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[f.status]}>{f.status}</Badge>
                  </td>
                  <td className="text-right tabular-nums">{formatINR(f.breakdown.officialTotalMinor)}</td>
                  <td className="text-right tabular-nums">{formatINR(f.consultancyServiceChargeMinor)}</td>
                  <td className="text-xs text-muted">{fmtDate(f.publishedAt ?? f.updatedAt)}</td>
                  <td className="py-2">
                    <span className="flex justify-end gap-1">
                      {f.status === "draft" && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => setEditing(f)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="gold" onClick={() => act(f, "publish")}>
                            Publish
                          </Button>
                        </>
                      )}
                      {f.status !== "draft" && f.status !== "archived" && (
                        <Button size="sm" variant="secondary" onClick={() => setEditing("new")} title="Published fees cannot be edited; start a new version">
                          New version
                        </Button>
                      )}
                      {(f.status === "draft" || f.status === "published") && (
                        <Button size="sm" variant="ghost" onClick={() => act(f, "archive")}>
                          Archive
                        </Button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
