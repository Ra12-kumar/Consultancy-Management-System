import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NewPasswordForm } from "@/features/auth/TokenForms";
import AuthCard from "@/features/auth/AuthCard";
import { Spinner } from "@/components/ui/Feedback";

export const metadata: Metadata = { title: "Choose a new password" };

export default function Page() {
  return (
    <AuthCard
      title="Choose a new password"
      subtitle="Your new password signs you out of every device."
      footer={<Link href="/login" className="font-semibold text-accent-text hover:underline">Back to sign in</Link>}
    >
      <Suspense fallback={<Spinner />}>
        <NewPasswordForm endpoint="/auth/reset-password" />
      </Suspense>
    </AuthCard>
  );
}
