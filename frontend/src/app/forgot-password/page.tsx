import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RequestLinkForm } from "@/features/auth/TokenForms";
import AuthCard from "@/features/auth/AuthCard";
import { Spinner } from "@/components/ui/Feedback";

export const metadata: Metadata = { title: "Forgot your password?" };

export default function Page() {
  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="Enter your email and we will send you a link to choose a new password."
      footer={<Link href="/login" className="font-semibold text-accent-text hover:underline">Back to sign in</Link>}
    >
      <Suspense fallback={<Spinner />}>
        <RequestLinkForm endpoint="/auth/forgot-password" label="Send reset link" />
      </Suspense>
    </AuthCard>
  );
}
