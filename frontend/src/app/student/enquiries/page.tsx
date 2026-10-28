import type { Metadata } from "next";
import { MyEnquiries } from "@/features/enquiry/StudentEnquiries";

export const metadata: Metadata = { title: "My enquiries" };

export default function Page() {
  return <MyEnquiries />;
}
