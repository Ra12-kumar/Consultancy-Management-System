import type { Metadata } from "next";
import { AdminFeedback } from "@/features/admin/support/AdminSupport";

export const metadata: Metadata = { title: "Feedback" };

export default function Page() {
  return <AdminFeedback />;
}
