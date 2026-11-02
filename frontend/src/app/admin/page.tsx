import type { Metadata } from "next";
import AdminWorkspaceDashboard from "@/features/admin/workspace/AdminWorkspaceDashboard";

export const metadata: Metadata = { title: "Admin dashboard" };

export default function Page() {
  return <AdminWorkspaceDashboard />;
}
