import type { Metadata } from "next";
import { MyApplications } from "@/features/enquiry/StudentEnquiries";

export const metadata: Metadata = { title: "My applications" };

export default function Page() {
  return <MyApplications />;
}
