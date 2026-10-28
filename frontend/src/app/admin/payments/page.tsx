import type { Metadata } from "next";
import { AdminPayments } from "@/features/admin/stage7/AdminStage7";

export const metadata: Metadata = { title: "Payments" };

export default function Page() {
  return <AdminPayments />;
}
