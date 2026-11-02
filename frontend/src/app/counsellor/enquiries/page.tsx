import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Feedback";
import CallbackLeads from "@/features/admin/enquiries/CallbackLeads";
import MyEnquiriesBoard from "@/features/counsellor/MyEnquiriesBoard";

export const metadata: Metadata = { title: "My enquiries" };

// Website callback requests assigned to this counsellor, then their enquiries. Filters live in the URL
// (useSearchParams), so the list renders inside Suspense.
export default function CounsellorEnquiriesPage() {
  return (
    <>
      <CallbackLeads role="counsellor" />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <MyEnquiriesBoard />
      </Suspense>
    </>
  );
}
