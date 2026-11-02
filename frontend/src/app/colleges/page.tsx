import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Feedback";
import UdanCollegesView from "@/features/landing/UdanCollegesView";

export const metadata: Metadata = { title: "Find a college", description: "Search any college in India by name and go to its website, or browse our verified directory with filters." };

// The Udaan college finder (previous design: features/catalog/CollegesView). The query lives in the URL (useSearchParams), so the page renders inside Suspense.
export default function CollegesPage() {
  return (
    <Suspense fallback={<main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6"><Skeleton className="h-96" /></main>}>
      <UdanCollegesView />
    </Suspense>
  );
}
