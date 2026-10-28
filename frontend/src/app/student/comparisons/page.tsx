import type { Metadata } from "next";
import { ComparisonsScreen } from "@/features/catalog/StudentLists";

export const metadata: Metadata = { title: "My comparisons" };

export default function Page() {
  return <ComparisonsScreen />;
}
