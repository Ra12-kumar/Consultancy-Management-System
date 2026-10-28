import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Feedback";
import { AdminScholarshipEditor } from "@/features/admin/scholarships/AdminScholarships";

export const metadata: Metadata = { title: "Edit scholarship" };

// Reads the URL parameter at request time, so it renders inside Suspense (Cache Components).
export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <AdminScholarshipEditor />
    </Suspense>
  );
}
