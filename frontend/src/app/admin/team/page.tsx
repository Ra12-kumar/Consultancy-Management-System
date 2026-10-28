import type { Metadata } from "next";
import { AdminTeam } from "@/features/admin/AdminScreens";

export const metadata: Metadata = { title: "Administrators" };

export default function Page() {
  return <AdminTeam />;
}
