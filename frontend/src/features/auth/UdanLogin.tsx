"use client";

/* eslint-disable @next/next/no-img-element -- local photo */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Icon, type IconName } from "@/features/admin/workspace/icons";
import { homeFor, useAuth } from "@/features/auth/AuthProvider";
import { hardNavigate } from "@/lib/navigation";
import { emailProblem, safeNext } from "@/lib/validation";
import { apiPost } from "@/services/api";
import type { ApiError, User } from "@/types/api";

// Sign-in page in the Udaan client design. The sign-in behaviour is the same as features/auth/LoginForm (kept in
// the code): email + password, two-step code when the account uses it, unverified accounts go to the email
// code page, and the ?next= page after signing in. The site header and footer are hidden on this page.

const hideSiteChrome = `body:has([data-udaan-login]) > header, body:has([data-udaan-login]) > footer, body:has([data-udaan-login]) > [aria-label="Announcements"] { display: none; }
[data-udaan-login] { color-scheme: light; }`;
const input =
  "h-11 w-full rounded-lg border border-slate-300 bg-white pr-10 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0b1f44] focus:ring-2 focus:ring-[#0b1f44]/15 focus:outline-none aria-[invalid=true]:border-rose-500";

function Field({ id, label, icon, children, after }: { id: string; label: string; icon: IconName; children: ReactNode; after?: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-800">
        {label} <span className="text-rose-600" aria-hidden="true">*</span>
      </label>
      <div className="relative mt-1.5">
        <Icon name={icon} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" />
        {children}
        {after}
      </div>
    </div>
  );
}

function SignInForm() {
  const params = useSearchParams();
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the account uses two-step sign-in: the password was right, an authenticator code is needed.
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");

  // A full page load after signing in, so no page cached while signed out can be reused.
  function signedIn(user: User) {
    setUser(user);
    hardNavigate(safeNext(params.get("next"), homeFor(user)));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = emailProblem(email) ?? (password ? null : "Enter your password");
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ user?: User; mfaRequired?: boolean; challenge?: string }>("/auth/login", { email: email.trim(), password });
      if (res.mfaRequired && res.challenge) {
        setChallenge(res.challenge);
        setPassword("");
        setBusy(false);
        return;
      }
      signedIn(res.user!);
    } catch (err) {
      // Right password, unverified email: a fresh code was emailed, so go and enter it.
      if ((err as ApiError).code === "EMAIL_NOT_VERIFIED") return hardNavigate(`/verify-email?sent=1&email=${encodeURIComponent(email.trim())}`);
      setError((err as ApiError).message);
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return setError("Enter the code from your authenticator app");
    setBusy(true);
    setError(null);
    try {
      const { user } = await apiPost<{ user: User }>("/auth/mfa/verify", { challenge, code: code.trim() });
      signedIn(user);
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.code === "INVALID_TOKEN") {
        setChallenge(null);
        setCode("");
      }
      setError(apiErr.message);
      setBusy(false);
    }
  }

  const errorBox = error && (
    <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {error}
    </p>
  );
  const primary = "flex h-11 w-full items-center justify-center rounded-lg bg-[#0b1f44] text-sm font-semibold text-white shadow-sm hover:bg-[#13306a] focus-visible:ring-2 focus-visible:ring-[#c9a227] focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60";

  if (challenge) {
    return (
      <form onSubmit={verify} className="space-y-4" noValidate>
        <p className="text-sm text-slate-600">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
        <Field id="login-code" label="Authentication code" icon="lock">
          <input id="login-code" inputMode="numeric" autoComplete="one-time-code" autoFocus required value={code} onChange={(e) => setCode(e.target.value)} maxLength={12} className={input} />
        </Field>
        {errorBox}
        <button type="submit" className={primary} disabled={busy}>
          {busy ? "Checking…" : "Verify and sign in"}
        </button>
        <button type="button" className="w-full text-sm text-slate-500 underline" onClick={() => { setChallenge(null); setCode(""); setError(null); }}>
          Use a different account
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field id="login-email" label="Email" icon="mail">
        <input id="login-email" type="email" autoComplete="email" required placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(error && /email/i.test(error))} className={input} />
      </Field>
      <Field
        id="login-password"
        label="Password"
        icon="lock"
        after={
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
            <Icon name={show ? "eyeOff" : "eye"} />
          </button>
        }
      >
        <input id="login-password" type={show ? "text" : "password"} autoComplete="current-password" required placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
      </Field>
      <div className="text-right text-sm">
        <Link href="/forgot-password" className="font-semibold text-[#1d4ed8] hover:underline">
          Forgot password?
        </Link>
      </div>
      {errorBox}
      <button type="submit" className={primary} disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function UdanLogin() {
  return (
    <main id="main" data-udaan-login="" className="relative isolate flex min-h-screen w-full flex-1 items-center justify-center overflow-hidden bg-[#0a1d5c] px-4 py-10 sm:px-6">
      <style>{hideSiteChrome}</style>
      {/* Background: deep blue with soft light waves. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_10%_10%,#1d4ed8_0%,transparent_60%),radial-gradient(50%_45%_at_95%_95%,#1e40af_0%,transparent_60%),linear-gradient(135deg,#0b1f5c_0%,#0a1a4f_50%,#081440_100%)]" />
      <svg aria-hidden="true" className="absolute -top-10 -left-24 -z-10 h-[340px] w-[620px] text-blue-400/30" viewBox="0 0 620 340" fill="none">
        <path d="M0 260C140 120 300 40 620 0" stroke="currentColor" strokeWidth="2" />
        <path d="M0 300C170 150 330 70 620 40" stroke="currentColor" strokeWidth="1" />
      </svg>
      <svg aria-hidden="true" className="absolute -right-24 -bottom-10 -z-10 h-[300px] w-[620px] text-blue-400/30" viewBox="0 0 620 300" fill="none">
        <path d="M0 300C260 260 420 160 620 20" stroke="currentColor" strokeWidth="2" />
        <path d="M60 300C300 250 450 170 620 70" stroke="currentColor" strokeWidth="1" />
      </svg>

      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl shadow-2xl shadow-black/40 ring-1 ring-white/10 md:grid-cols-[1fr_1.05fr]">
        {/* Welcome panel */}
        <section aria-label="About Udaan" className="relative min-h-[220px] overflow-hidden bg-[#0b1f5c] md:min-h-[520px]">
          <img src="/udan/counselling.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-[#0b1f5c]/30 via-[#0b1f5c]/70 to-[#0a1a4f]/95" />
          <svg aria-hidden="true" className="absolute right-0 bottom-0 h-10 w-full text-amber-300" viewBox="0 0 400 40" fill="none" preserveAspectRatio="none">
            <path d="M0 38C150 34 290 22 400 2" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
          </svg>
          <div className="relative flex h-full flex-col justify-end p-6 pb-10 text-white sm:p-8 sm:pb-12">
            <Link href="/" className="flex w-fit items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:outline-none" aria-label="Udaan home">
              <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-xl bg-[#0b1f44] text-amber-300 ring-2 ring-amber-300/70">
                <svg viewBox="0 0 24 24" className="size-6" fill="currentColor">
                  <path d="M12 3 1 9l11 6 9-4.9V17h2V9L12 3Zm-6 9.6V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.4l-6 3.3-6-3.3Z" />
                </svg>
              </span>
              <span className="text-2xl font-bold">Udaan</span>
            </Link>
            <h1 className="mt-5 text-2xl leading-tight font-bold sm:text-3xl">
              Your Gateway to
              <br />
              Better Education
            </h1>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/85">Explore colleges, find courses, get scholarships and manage your admission journey – all in one place.</p>
          </div>
        </section>

        {/* Sign-in card */}
        <section aria-labelledby="login-title" className="bg-white p-6 sm:p-10">
          <h2 id="login-title" className="text-3xl font-bold text-slate-900">
            Sign In
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">Welcome back! Please sign in to your account.</p>
          <div className="mt-7">
            <SignInForm />
          </div>
          <p className="mt-8 text-center text-sm text-slate-600">
            New here?{" "}
            <Link href="/register" className="font-semibold text-[#1d4ed8] hover:underline">
              Create a student account
            </Link>
          </p>
          <p className="mt-2 text-center text-xs text-slate-500">Students, counsellors and administrators sign in here.</p>
        </section>
      </div>
    </main>
  );
}
