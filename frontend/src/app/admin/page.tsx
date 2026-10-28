import type { Metadata } from "next";
import { AdminDashboard } from "@/features/admin/AdminScreens";

export const metadata: Metadata = { title: "Admin dashboard" };

export default function Page() {
  return <AdminDashboard />;
}
