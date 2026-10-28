import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Feedback";
import CompareView from "@/features/catalog/CompareView";

export const metadata: Metadata = { title: "Compare colleges" };

export default function ComparePage() {
  return (
    <Suspense fallback={<main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6"><Skeleton className="h-96" /></main>}>
      <CompareView />
    </Suspense>
  );
}
