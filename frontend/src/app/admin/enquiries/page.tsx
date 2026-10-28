import type { Metadata } from "next";
import { AdminEnquiryList } from "@/features/admin/enquiries/AdminEnquiries";

export const metadata: Metadata = { title: "Enquiries" };

export default function Page() {
  return <AdminEnquiryList />;
}
