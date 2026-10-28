import type { Metadata } from "next";
import ProfileForm from "@/features/student/ProfileForm";

export const metadata: Metadata = { title: "My profile" };

export default function StudentProfilePage() {
  return <ProfileForm />;
}
