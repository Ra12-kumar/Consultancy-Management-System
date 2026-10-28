import type { Metadata } from "next";
import { AdminLocations } from "@/features/admin/catalog/AdminCatalog";

export const metadata: Metadata = { title: "Locations" };

export default function Page() {
  return <AdminLocations />;
}
