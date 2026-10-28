import type { Metadata } from "next";
import ContentPage, { ContactDetails } from "@/features/content/ContentPage";

export const metadata: Metadata = { title: "Talk to a counsellor" };

export default function ContactPage() {
  return (
    <ContentPage slug="contact" fallback={{ eyebrow: "Contact", title: "Talk to a counsellor", intro: "Send us an enquiry or book a counselling appointment.", points: ["Higher-education enquiry form","Counselling appointments","Phone and email support","Office address and hours"] }}>
      <ContactDetails />
    </ContentPage>
  );
}
