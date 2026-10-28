import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Feedback";
import CollegeDirectory from "@/features/catalog/CollegeDirectory";

export const metadata: Metadata = { title: "Explore colleges", description: "Search colleges by course, location, budget and eligibility, and compare their published fees." };

// Filters live in the URL (useSearchParams), so the directory renders inside Suspense.
export default function CollegesPage() {
  return (
    <Suspense fallback={<main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6"><Skeleton className="h-96" /></main>}>
      <CollegeDirectory />
    </Suspense>
  );
}
