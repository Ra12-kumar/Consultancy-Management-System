import type { Metadata } from "next";
import { AdminColleges } from "@/features/admin/catalog/AdminCatalog";

export const metadata: Metadata = { title: "Colleges" };

export default function Page() {
  return <AdminColleges />;
}
