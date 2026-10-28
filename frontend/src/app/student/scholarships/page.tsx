import type { Metadata } from "next";
import { MyScholarships } from "@/features/scholarships/Scholarships";

export const metadata: Metadata = { title: "My scholarships" };

export default function Page() {
  return <MyScholarships />;
}
