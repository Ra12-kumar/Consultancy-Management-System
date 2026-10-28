import type { Metadata } from "next";
import ContentPage from "@/features/content/ContentPage";

export const metadata: Metadata = { title: "Frequently asked questions" };

export default function FaqPage() {
  return <ContentPage slug="faq" fallback={{ eyebrow: "FAQ", title: "Frequently asked questions", intro: "Answers to common questions about our guidance, fees and scholarships.", points: ["We do not guarantee admission: colleges decide.","Official college fees and our service charges are always shown separately.","Scholarship eligibility shown here is preliminary; the provider decides.","Your personal data is visible only to you and authorised staff.","You can ask us to correct or delete your personal data from your account.","We never ask for your password by phone or email."] }} />;
}
