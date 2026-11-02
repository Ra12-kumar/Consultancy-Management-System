import type { Metadata } from "next";
import AdminCounsellors from "@/features/admin/AdminCounsellors";

export const metadata: Metadata = { title: "Counsellors" };

export default function CounsellorsPage() {
  return <AdminCounsellors />;
}
