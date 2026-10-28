import type { Metadata } from "next";
import { Suspense } from "react";
import { NewPasswordForm } from "@/features/auth/TokenForms";
import AuthCard from "@/features/auth/AuthCard";
import { Spinner } from "@/components/ui/Feedback";

export const metadata: Metadata = { title: "Set up your administrator account" };

export default function Page() {
  return (
    <AuthCard
      title="Set up your administrator account"
      subtitle="Choose the password for your new administrator account."
      footer={null}
    >
      <Suspense fallback={<Spinner />}>
        <NewPasswordForm endpoint="/auth/set-password" />
      </Suspense>
    </AuthCard>
  );
}
