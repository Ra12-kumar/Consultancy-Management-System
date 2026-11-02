import type { Metadata } from "next";
import EnquiryReports from "@/features/admin/EnquiryReports";

export const metadata: Metadata = { title: "Enquiry reports" };

export default function EnquiryReportsPage() {
  return <EnquiryReports />;
}
