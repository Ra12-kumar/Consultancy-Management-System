import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { VerifyEmail } from "@/features/auth/TokenForms";
import AuthCard from "@/features/auth/AuthCard";
import { Spinner } from "@/components/ui/Feedback";

export const metadata: Metadata = { title: "Verify your email" };

export default function Page() {
  return (
    <AuthCard
      title="Verify your email"
      subtitle="Confirming the address on your account."
      footer={<Link href="/login" className="font-semibold text-accent-text hover:underline">Back to sign in</Link>}
    >
      <Suspense fallback={<Spinner />}>
        <VerifyEmail />
      </Suspense>
    </AuthCard>
  );
}
