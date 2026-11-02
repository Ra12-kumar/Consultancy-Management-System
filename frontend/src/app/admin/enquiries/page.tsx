import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Feedback";
import { AdminEnquiryList } from "@/features/admin/enquiries/AdminEnquiries";
import CallbackLeads from "@/features/admin/enquiries/CallbackLeads";

export const metadata: Metadata = { title: "Enquiries" };

// Website callback requests first, then student enquiries.
export default function Page() {
  return (
    <>
      <CallbackLeads role="admin" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <AdminEnquiryList />
      </Suspense>
    </>
  );
}
