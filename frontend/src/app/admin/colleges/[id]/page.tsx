import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Feedback";
import { AdminCollegeEditor } from "@/features/admin/catalog/AdminCatalog";

export const metadata: Metadata = { title: "Edit college" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <AdminCollegeEditor />
    </Suspense>
  );
}
