import type { Metadata } from "next";
import { CollegeData } from "@/features/admin/directory/CollegeData";

export const metadata: Metadata = { title: "College data" };

export default function Page() {
  return <CollegeData />;
}
