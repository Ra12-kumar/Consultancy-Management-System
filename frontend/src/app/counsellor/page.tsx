import type { Metadata } from "next";
import CounsellorHome from "@/features/counsellor/CounsellorHome";

export const metadata: Metadata = { title: "Counsellor dashboard" };

export default function CounsellorPage() {
  return <CounsellorHome />;
}
