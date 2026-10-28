import type { Metadata } from "next";
import { AdminDataRequests } from "@/features/admin/support/AdminSupport";

export const metadata: Metadata = { title: "Personal data requests" };

export default function Page() {
  return <AdminDataRequests />;
}
