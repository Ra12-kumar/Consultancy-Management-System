import type { Metadata } from "next";
import { FeedbackScreen } from "@/features/support/StudentSupport";

export const metadata: Metadata = { title: "Feedback and support" };

export default function Page() {
  return <FeedbackScreen />;
}
