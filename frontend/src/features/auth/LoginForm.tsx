"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { homeFor, useAuth } from "@/features/auth/AuthProvider";
import { hardNavigate } from "@/lib/navigation";
import { emailProblem, safeNext } from "@/lib/validation";
import { apiPost } from "@/services/api";
import type { ApiError, User } from "@/types/api";

export default function LoginForm() {
  const params = useSearchParams();
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the account uses two-step sign-in: the password was right, an authenticator code is needed.
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");

  // A full page load after signing in, so no page cached while signed out (e.g. a prefetched redirect to sign-in)
  // can be reused.
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

  if (challenge) {
    return (
      <form onSubmit={verify} className="space-y-4" noValidate>
        <p className="text-sm text-muted">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
        <TextField label="Authentication code" inputMode="numeric" autoComplete="one-time-code" autoFocus required value={code} onChange={(e) => setCode(e.target.value)} maxLength={12} />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Checking…" : "Verify and sign in"}
        </Button>
        <button type="button" className="w-full text-sm text-muted underline" onClick={() => { setChallenge(null); setCode(""); setError(null); }}>
          Use a different account
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <TextField label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      <div className="text-right text-sm">
        <Link href="/forgot-password" className="font-medium text-accent-text hover:underline">
          Forgot password?
        </Link>
      </div>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
