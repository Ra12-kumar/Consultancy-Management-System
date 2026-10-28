import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Feedback";
import { ScholarshipDetail } from "@/features/scholarships/Scholarships";

export const metadata: Metadata = { title: "Scholarship" };

// Reads the URL parameter at request time, so it renders inside Suspense (Cache Components).
export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <ScholarshipDetail />
    </Suspense>
  );
}
