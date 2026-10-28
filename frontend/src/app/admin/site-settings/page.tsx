import type { Metadata } from "next";
import { AdminSiteSettings } from "@/features/admin/stage7/AdminStage7";

export const metadata: Metadata = { title: "Site settings" };

export default function Page() {
  return <AdminSiteSettings />;
}
