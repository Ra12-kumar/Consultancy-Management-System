import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Feedback";
import { AdminEnquiryDetail } from "@/features/admin/enquiries/AdminEnquiries";

export const metadata: Metadata = { title: "Enquiry" };

// Reads request-time URL data, so it renders inside Suspense (Cache Components).
export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <AdminEnquiryDetail />
    </Suspense>
  );
}
