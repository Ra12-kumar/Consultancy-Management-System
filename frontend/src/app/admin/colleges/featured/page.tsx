import type { Metadata } from "next";
import FeaturedColleges from "@/features/admin/catalog/FeaturedColleges";

export const metadata: Metadata = { title: "Featured colleges" };

export default function Page() {
  return <FeaturedColleges />;
}
