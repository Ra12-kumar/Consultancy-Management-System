import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui/Feedback";
import LoginForm from "@/features/auth/LoginForm";
import SignInFrame from "@/features/auth/SignInFrame";

export const metadata: Metadata = { title: "Sign in" };

// Sign-in in a focused frame (no site navigation bar). The sign-in form itself (LoginForm) is unchanged; the shared
// AuthCard is still used by registration and the password pages.
export default function Page() {
  return (
    <SignInFrame>
      <Suspense fallback={<Spinner />}>
        <LoginForm />
      </Suspense>
    </SignInFrame>
  );
}
