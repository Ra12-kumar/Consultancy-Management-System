import type { Metadata } from "next";
import { AdminContent } from "@/features/admin/stage7/AdminStage7";

export const metadata: Metadata = { title: "Website content" };

export default function Page() {
  return <AdminContent />;
}
