import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Feedback";
import CollegeDetail from "@/features/catalog/CollegeDetail";

export const metadata: Metadata = { title: "College details" };

// The slug is only known at request time (no generateStaticParams), so useParams needs a Suspense boundary.
export default function CollegePage() {
  return (
    <Suspense fallback={<main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6"><Skeleton className="h-64" /></main>}>
      <CollegeDetail />
    </Suspense>
  );
}
