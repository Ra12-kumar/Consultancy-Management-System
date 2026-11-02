"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";

// Shown when a page fails while rendering. The site header and footer stay; the visitor can retry or leave.
// Details stay in the browser console (and the server log); the page shows only a reference.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
      <p className="text-sm font-semibold tracking-widest text-accent-text uppercase">Something went wrong</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">This page couldn’t be shown</h1>
      <p className="mt-3 text-muted">Please try again. If it keeps happening, contact us and mention the reference below.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/" variant="secondary">
          Go to the home page
        </ButtonLink>
      </div>
      {error.digest && <p className="mt-6 font-mono text-xs text-muted">Reference: {error.digest}</p>}
    </main>
  );
}
