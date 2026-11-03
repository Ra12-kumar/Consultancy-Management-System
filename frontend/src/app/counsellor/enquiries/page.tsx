import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Feedback";
import CallbackPanel from "@/features/counsellor/workspace/CallbackPanel";
import EnquiriesTable from "@/features/counsellor/workspace/EnquiriesTable";

export const metadata: Metadata = { title: "My enquiries" };

// Website callback requests assigned to this counsellor, then their enquiries, in the client design (previous
// screens: features/admin/enquiries/CallbackLeads and features/counsellor/MyEnquiriesBoard). Filters live in the
// URL (useSearchParams), so the table renders inside Suspense.
export default function CounsellorEnquiriesPage() {
  return (
    <div className="space-y-5">
      <CallbackPanel />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <EnquiriesTable />
      </Suspense>
    </div>
  );
}
