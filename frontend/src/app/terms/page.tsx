import type { Metadata } from "next";
import ContentPage from "@/features/content/ContentPage";

export const metadata: Metadata = { title: "Terms and conditions" };

export default function TermsPage() {
  return <ContentPage slug="terms" fallback={{ eyebrow: "Terms and conditions", title: "Terms and conditions", intro: "The terms for using this website. This summary will be replaced by the consultancy’s reviewed terms before launch.", points: ["Information about colleges, fees and scholarships is provided for guidance and may change; always confirm with the institution.","Admission and scholarship decisions are made by the institutions and providers.","Our consultancy service charges are shown separately from official fees.","Keep your account password private; you are responsible for activity on your account.","We may suspend accounts that misuse the service."] }} />;
}
