import type { Metadata } from "next";
import { AdminEmail } from "@/features/admin/AdminScreens";

export const metadata: Metadata = { title: "Email notifications" };

export default function Page() {
  return <AdminEmail />;
}
