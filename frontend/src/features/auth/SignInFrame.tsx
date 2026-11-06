import Link from "next/link";
import type { ReactNode } from "react";

// Frame for the sign-in page only: no site navigation bar (a focused page), the Udaan logo linking home, a centred
// card and quiet help links. Uses the site's colour tokens, so it follows light and dark mode like the other pages.
// The shared AuthCard (registration and password pages) is unchanged.
const hideSiteHeader = `body:has([data-signin-page]) > header, body:has([data-signin-page]) > [aria-label="Announcements"] { display: none; }`;

export default function SignInFrame({ children }: { children: ReactNode }) {
  return (
    <main id="main" data-signin-page="" className="relative isolate flex flex-1 flex-col items-center overflow-hidden px-4 pt-10 pb-14 sm:pt-14">
      <style>{hideSiteHeader}</style>
      {/* Soft navy glow behind the card. */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(70%_100%_at_50%_0%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent)]" />
      <div aria-hidden="true" className="absolute inset-0 -z-20 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--line)_45%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--line)_45%,transparent)_1px,transparent_1px)] [mask-image:radial-gradient(60%_50%_at_50%_20%,black,transparent)] bg-[size:44px_44px]" />

      <Link href="/" aria-label="Udaan home" className="flex items-center gap-3 rounded-xl focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
        <span aria-hidden="true" className="inline-flex size-11 items-center justify-center rounded-xl bg-navy text-gold shadow-md ring-1 ring-gold/40">
          <svg viewBox="0 0 24 24" className="size-6" fill="currentColor">
            <path d="M12 3 1 9l11 6 9-4.9V17h2V9L12 3Zm-6 9.6V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.4l-6 3.3-6-3.3Z" />
          </svg>
        </span>
        <span className="text-2xl font-bold tracking-tight">Udaan</span>
      </Link>

      <div className="mt-8 w-full max-w-[440px] rounded-2xl border border-line bg-surface p-6 shadow-[0_20px_50px_-20px_rgba(11,31,68,0.35)] sm:p-9">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Welcome back</h1>
          <p className="mt-1.5 text-sm text-muted">Sign in to continue to your Udaan account.</p>
        </div>
        <div className="mt-7">{children}</div>
        <div className="mt-7 flex items-center gap-3 text-xs text-muted" aria-hidden="true">
          <span className="h-px flex-1 bg-line" />
          New to Udaan?
          <span className="h-px flex-1 bg-line" />
        </div>
        <Link href="/register" className="mt-4 flex min-h-11 w-full items-center justify-center rounded-xl border border-line text-sm font-semibold hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
          Create a student account
        </Link>
        <p className="mt-5 text-center text-xs text-muted">Students, counsellors and administrators sign in here.</p>
      </div>

      <p className="mt-6 flex items-center gap-2 text-xs text-muted">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        Secure sign-in. Your password is stored only as a secure hash.
      </p>
      <nav aria-label="Sign-in help" className="mt-3 flex gap-5 text-xs">
        <Link href="/" className="font-medium text-muted hover:text-foreground hover:underline">
          ← Back to home
        </Link>
        <Link href="/contact" className="font-medium text-muted hover:text-foreground hover:underline">
          Need help?
        </Link>
      </nav>
    </main>
  );
}
