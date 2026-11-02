import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Feedback";
import LiveCollege from "@/features/catalog/LiveCollege";

export const metadata: Metadata = { title: "College details" };

// A college from the live search (CollegeDB). The id is only known at request time, hence Suspense.
export default function LiveCollegePage() {
  return (
    <Suspense fallback={<main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6"><Skeleton className="h-64" /></main>}>
      <LiveCollege />
    </Suspense>
  );
}
