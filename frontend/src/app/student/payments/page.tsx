import type { Metadata } from "next";
import { StudentPayments } from "@/features/payments/StudentPayments";

export const metadata: Metadata = { title: "Payments" };

export default function Page() {
  return <StudentPayments />;
}
