import type { Metadata } from "next";
import CoursesCatalog from "@/features/catalog/CoursesCatalog";

export const metadata: Metadata = { title: "Find your course" };

export default function CoursesPage() {
  return <CoursesCatalog />;
}
