import type { Metadata } from "next";
import { AdminAudit } from "@/features/admin/AdminScreens";

export const metadata: Metadata = { title: "Audit log" };

export default function Page() {
  return <AdminAudit />;
}
