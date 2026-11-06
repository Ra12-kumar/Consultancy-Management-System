import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui/Feedback";
import UdanLogin from "@/features/auth/UdanLogin";

export const metadata: Metadata = { title: "Sign in" };

// Sign-in page in the Udaan client design (previous: features/auth/AuthCard + LoginForm, kept in the code).
// The form reads ?next= (useSearchParams), so it renders inside Suspense.
export default function Page() {
  return (
    <Suspense fallback={<main id="main" className="flex flex-1 items-center justify-center py-20"><Spinner /></main>}>
      <UdanLogin />
    </Suspense>
  );
}
