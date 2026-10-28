import type { Metadata } from "next";
import ContentPage from "@/features/content/ContentPage";

export const metadata: Metadata = { title: "How admission guidance works" };

export default function AdmissionProcessPage() {
  return <ContentPage slug="admission-process" fallback={{ eyebrow: "Admission process", title: "How admission guidance works", intro: "From your first enquiry to your admission decision, here is what happens at each step.", points: ["Register and verify your email, then complete your academic profile.","Explore colleges and courses, and compare published fees side by side.","Submit an admission enquiry: you receive a reference number at once.","A counsellor contacts you, reviews your eligibility and books a counselling session.","We help you prepare documents and track each college application.","Colleges make the admission decisions; we keep your status up to date."] }} />;
}
