import type { Metadata } from "next";
import { AdminCourses } from "@/features/admin/catalog/AdminCatalog";

export const metadata: Metadata = { title: "Courses" };

export default function Page() {
  return <AdminCourses />;
}
