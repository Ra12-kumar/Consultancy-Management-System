import type { Metadata } from "next";
import { AdminAppointments } from "@/features/admin/enquiries/AdminEnquiries";

export const metadata: Metadata = { title: "Counselling appointments" };

export default function Page() {
  return <AdminAppointments />;
}
