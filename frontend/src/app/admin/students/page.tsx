import type { Metadata } from "next";
import { AdminStudents } from "@/features/admin/AdminScreens";

export const metadata: Metadata = { title: "Students" };

export default function Page() {
  return <AdminStudents />;
}
