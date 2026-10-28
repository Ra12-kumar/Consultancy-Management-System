import type { Metadata } from "next";
import { AdminReports } from "@/features/admin/support/AdminSupport";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return <AdminReports />;
}
