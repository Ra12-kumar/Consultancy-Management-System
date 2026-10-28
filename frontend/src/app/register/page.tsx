import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import RegisterForm from "@/features/auth/RegisterForm";
import AuthCard from "@/features/auth/AuthCard";
import { Spinner } from "@/components/ui/Feedback";

export const metadata: Metadata = { title: "Create your student account" };

export default function Page() {
  return (
    <AuthCard
      title="Create your student account"
      subtitle="Save your academic profile, compare colleges and track your admission enquiries."
      footer={<>Already registered? <Link href="/login" className="font-semibold text-accent-text hover:underline">Sign in</Link></>}
    >
      <Suspense fallback={<Spinner />}>
        <RegisterForm />
      </Suspense>
    </AuthCard>
  );
}
