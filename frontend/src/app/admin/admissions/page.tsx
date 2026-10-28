import type { Metadata } from "next";
import { AdminApplications } from "@/features/admin/enquiries/AdminEnquiries";

export const metadata: Metadata = { title: "Admissions" };

export default function Page() {
  return <AdminApplications />;
}
