"use client";

import { useEffect } from "react";
import "./globals.css";

// Last resort when the root layout itself fails: a complete page with no shared components.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="en-IN">
      <body className="flex min-h-screen items-center justify-center bg-background px-4 text-center text-foreground">
        <main>
          <h1 className="text-2xl font-bold">Udaan is having trouble right now</h1>
          <p className="mt-3 text-muted">Please try again in a moment.</p>
          <div className="mt-6 flex justify-center gap-3">
            <button type="button" onClick={reset} className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-fg">
              Try again
            </button>
            {/* A full reload, since the app shell itself failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the router is unavailable here */}
            <a href="/" className="inline-flex min-h-11 items-center rounded-xl border border-line px-5 text-sm font-semibold">
              Home page
            </a>
          </div>
          {error.digest && <p className="mt-6 font-mono text-xs text-muted">Reference: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
