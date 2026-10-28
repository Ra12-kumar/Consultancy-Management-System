import type { Metadata } from "next";
import ContentPage from "@/features/content/ContentPage";

export const metadata: Metadata = { title: "About the consultancy" };

export default function AboutPage() {
  return (
    <ContentPage slug="about" fallback={{ eyebrow: "About us", title: "About the consultancy", intro: "We guide students through choosing colleges, courses and scholarships, from the first enquiry to admission.", points: ["Experienced admission counsellors","Transparent college and fee information","Scholarship guidance","Support through every admission step"] }} />
  );
}
