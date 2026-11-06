import type { Metadata } from "next";
import OnlinePrograms from "@/features/admin/online/OnlinePrograms";

export const metadata: Metadata = { title: "Online UG & PG" };

export default function Page() {
  return <OnlinePrograms />;
}
