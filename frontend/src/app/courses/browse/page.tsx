import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Feedback";
import UdanCourses from "@/features/landing/UdanCourses";

export const metadata: Metadata = {
  title: "Browse courses",
  description: "Courses at verified colleges with fees, eligibility, mode and deadlines.",
};

// The Udaan course browser, as on /courses (previous design: features/catalog/CourseBrowser). Filters live in
// the URL (useSearchParams), so the page renders inside Suspense.
export default function BrowseCoursesPage() {
  return (
    <Suspense
      fallback={
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
          <Skeleton className="h-96" />
        </main>
      }
    >
      <UdanCourses />
    </Suspense>
  );
}
