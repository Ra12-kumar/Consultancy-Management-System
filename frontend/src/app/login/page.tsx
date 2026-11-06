import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import LoginForm from "@/features/auth/LoginForm";
import AuthCard from "@/features/auth/AuthCard";
import { Spinner } from "@/components/ui/Feedback";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return (
    <AuthCard
      title="Sign in"
      subtitle="Students and administrators sign in here."
      footer={<>New here? <Link href="/register" className="font-semibold text-accent-text hover:underline">Create a student account</Link></>}
    >
      <Suspense fallback={<Spinner />}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
