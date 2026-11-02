import type { Metadata } from "next";
import { AdminDashboard } from "@/features/admin/AdminScreens";

export const metadata: Metadata = { title: "Detailed dashboard" };

// The full dashboard with filters and every chart (the overview at /admin follows the client design).
export default function Page() {
  return <AdminDashboard />;
}
