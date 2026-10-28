import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Feedback";
import EnquiryForm from "@/features/enquiry/EnquiryForm";

export const metadata: Metadata = { title: "Enquire for admission" };

// Reads request-time URL data, so it renders inside Suspense (Cache Components).
export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <EnquiryForm />
    </Suspense>
  );
}
