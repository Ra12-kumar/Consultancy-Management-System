import type { Metadata } from "next";
import StudentDashboard from "@/features/student/StudentDashboard";

export const metadata: Metadata = { title: "Student dashboard" };

export default function StudentPage() {
  return <StudentDashboard />;
}
