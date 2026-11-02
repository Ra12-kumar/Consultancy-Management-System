"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { homeFor, useAuth } from "@/features/auth/AuthProvider";
import { useApiData } from "@/hooks/useApiData";
import { hardNavigate } from "@/lib/navigation";
import { emailProblem } from "@/lib/validation";
import { apiGet, apiPost } from "@/services/api";
import type { ApiError, User } from "@/types/api";

export const RESEND_SECONDS = 60;
export const NO_EMAIL = "We cannot email verification codes right now because email delivery is not set up. Please contact us to activate your account.";

export function codeProblem(code: string) {
  return /^\d{6}$/.test(code.trim()) ? null : "Enter the 6-digit code from the email";
}

// Confirms the email address with the 6-digit code we emailed. A correct code signs the student in.
export default function OtpForm() {
  const params = useSearchParams();
  const { setUser } = useAuth();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    params.get("sent") ? "If this email is new, we have emailed you a 6-digit code (valid for 10 minutes). If you already have an account, we emailed sign-in help instead, so just log in." : null,
  );
  // Whether the server can send email at all; never show "code sent" when it cannot.
  const delivery = useApiData((signal) => apiGet<{ available: boolean }>("/auth/email-delivery", { signal }), []);
  const noEmail = delivery.data?.available === false;
  // Seconds until another code may be requested (the server enforces the same limit).
  const [wait, setWait] = useState(params.get("sent") ? RESEND_SECONDS : 0);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function verify(e: FormEvent) {
    e.preventDefault();
    const problem = emailProblem(email) ?? codeProblem(code);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ user: User; signedIn: boolean }>("/auth/verify-otp", { email: email.trim(), code: code.trim() });
      if (res.signedIn) {
        setUser(res.user);
        hardNavigate(homeFor(res.user));
        return;
      }
      hardNavigate("/login");
    } catch (err) {
      setError((err as ApiError).message);
      setBusy(false);
    }
  }

  async function resend() {
    const problem = emailProblem(email);
    if (problem) return setError(problem);
    setError(null);
    try {
      const res = await apiPost<{ message: string; emailDelivery?: boolean }>("/auth/resend-verification", { email: email.trim() });
      if (res.emailDelivery === false) return setError(res.message);
      setNotice(res.message);
      setCode("");
      setWait(RESEND_SECONDS);
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  return (
    <form onSubmit={verify} className="space-y-4" noValidate>
      {noEmail ? <Alert tone="warning">{NO_EMAIL}</Alert> : notice && <Alert tone="success">{notice}</Alert>}
      <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <TextField
        label="Verification code"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="6-digit code"
        maxLength={6}
        required
        autoFocus={Boolean(email)}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        hint="Check your inbox (and spam folder) for an email from us."
        className="tracking-[0.4em]"
      />
      {error && <Alert>{error}</Alert>}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? "Verifying…" : "Verify and continue"}
      </Button>
      <p className="text-center text-sm text-muted">
        Didn&apos;t get it?{" "}
        <button type="button" onClick={resend} disabled={wait > 0} className="font-semibold text-accent-text underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline">
          {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
        </button>
      </p>
    </form>
  );
}
