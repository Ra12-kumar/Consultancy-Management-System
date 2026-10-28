import type { Metadata } from "next";
import { AdminScholarshipList } from "@/features/admin/scholarships/AdminScholarships";

export const metadata: Metadata = { title: "Scholarships" };

export default function Page() {
  return <AdminScholarshipList />;
}
