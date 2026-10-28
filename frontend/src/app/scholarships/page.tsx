import type { Metadata } from "next";
import { ScholarshipDirectory } from "@/features/scholarships/Scholarships";

export const metadata: Metadata = { title: "Scholarships" };

export default function Page() {
  return <ScholarshipDirectory />;
}
