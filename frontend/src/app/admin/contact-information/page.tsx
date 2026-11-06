import type { Metadata } from "next";
import ContactInformation from "@/features/admin/contact/ContactInformation";

export const metadata: Metadata = { title: "Contact information" };

export default function Page() {
  return <ContactInformation />;
}
