import type { Metadata } from "next";
import StudentHome from "@/features/student/StudentHome";

export const metadata: Metadata = { title: "Student dashboard" };

export default function StudentPage() {
  return <StudentHome />;
}
