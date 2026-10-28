import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Feedback";
import { PaymentReceipt } from "@/features/payments/StudentPayments";

export const metadata: Metadata = { title: "Payment receipt" };

// Reads the URL parameter at request time, so it renders inside Suspense (Cache Components).
export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <PaymentReceipt />
    </Suspense>
  );
}
