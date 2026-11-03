import type { Metadata } from "next";
import CounsellorDashboard from "@/features/counsellor/workspace/CounsellorDashboard";

export const metadata: Metadata = { title: "Counsellor dashboard" };

// The counsellor dashboard in the client design (previous summary: features/counsellor/CounsellorHome).
export default function CounsellorPage() {
  return <CounsellorDashboard />;
}
