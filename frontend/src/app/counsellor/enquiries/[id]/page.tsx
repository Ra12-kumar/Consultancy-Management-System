import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Feedback";
import { CounsellorEnquiryDetail } from "@/features/counsellor/CounsellorEnquiries";

export const metadata: Metadata = { title: "Enquiry" };

export default function CounsellorEnquiryPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <CounsellorEnquiryDetail />
    </Suspense>
  );
}
