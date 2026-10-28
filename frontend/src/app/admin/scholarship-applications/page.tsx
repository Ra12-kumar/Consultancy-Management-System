import type { Metadata } from "next";
import { AdminScholarshipApplications } from "@/features/admin/scholarships/AdminScholarships";

export const metadata: Metadata = { title: "Scholarship applications" };

export default function Page() {
  return <AdminScholarshipApplications />;
}
