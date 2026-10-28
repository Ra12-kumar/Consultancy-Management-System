import type { Metadata } from "next";
import ContentPage from "@/features/content/ContentPage";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return <ContentPage slug="privacy" fallback={{ eyebrow: "Privacy policy", title: "Privacy policy", intro: "How we collect, use and protect your personal information. This summary will be replaced by the consultancy’s reviewed policy before launch.", points: ["We collect the details you enter: name, contact details and academic information.","We use them only to provide admission guidance and to contact you about your enquiries.","Only you and authorised consultancy staff can see your records.","Passwords are stored only as secure hashes; sessions use secure cookies.","You can request correction or deletion of your data from your account.","We do not sell your personal data."] }} />;
}
