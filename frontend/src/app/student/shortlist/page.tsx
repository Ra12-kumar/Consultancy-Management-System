import type { Metadata } from "next";
import { ShortlistScreen } from "@/features/catalog/StudentLists";

export const metadata: Metadata = { title: "My selected colleges" };

export default function Page() {
  return <ShortlistScreen />;
}
