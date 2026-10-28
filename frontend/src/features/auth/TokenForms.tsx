"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Alert, Spinner } from "@/components/ui/Feedback";
import { homeFor, useAuth } from "@/features/auth/AuthProvider";
import { emailProblem, passwordProblem } from "@/lib/validation";
import { apiPost, fieldErrors } from "@/services/api";
import type { ApiError, User } from "@/types/api";

// Asks for a fresh link by email (same answer whether or not the account exists).
export function RequestLinkForm({ endpoint, label }: { endpoint: "/auth/forgot-password" | "/auth/resend-verification"; label: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = emailProblem(email);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      setMessage((await apiPost<{ message: string }>(endpoint, { email: email.trim() })).message);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }
  if (message) return <Alert tone="success">{message}</Alert>;
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      {error && <Alert>{error}</Alert>}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? "Sending…" : label}
      </Button>
    </form>
  );
}

// Confirms the email address from the link in the verification email (once, on page load).
export function VerifyEmail() {
  const token = useSearchParams().get("token");
  const { user, refresh } = useAuth();
  const [state, setState] = useState<{ status: "working" | "done" | "error"; message?: string }>({ status: token ? "working" : "error", message: token ? undefined : "This verification link is incomplete." });
  const started = useRef(false);
  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    apiPost<{ user: User }>("/auth/verify-email", { token })
      .then(async () => {
        await refresh();
        setState({ status: "done" });
      })
      .catch((err: ApiError) => setState({ status: "error", message: err.message }));
  }, [token, refresh]);

  if (state.status === "working") return <Spinner label="Verifying your email" />;
  if (state.status === "done") {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="Email verified">
          Thank you. Your email address is confirmed.
        </Alert>
        {user ? <ButtonLink href={homeFor(user)}>Go to your dashboard</ButtonLink> : <ButtonLink href="/login">Sign in</ButtonLink>}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Alert>{state.message}</Alert>
      <p className="text-sm text-muted">Request a new verification link:</p>
      <RequestLinkForm endpoint="/auth/resend-verification" label="Send a new link" />
    </div>
  );
}

// Choose a new password from an emailed link: password reset (forgotten) or admin invitation (set).
export function NewPasswordForm({ endpoint }: { endpoint: "/auth/reset-password" | "/auth/set-password" }) {
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const p = passwordProblem(password);
    const next = { password: p ?? undefined, confirm: !p && confirm !== password ? "The passwords do not match" : undefined };
    setErrors(next);
    if (next.password || next.confirm) return;
    setBusy(true);
    setError(null);
    try {
      setDone((await apiPost<{ message: string }>(endpoint, { token, password })).message);
    } catch (err) {
      const f = fieldErrors(err);
      if (f.password) setErrors({ password: f.password });
      else setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  if (!token) return <Alert>This link is incomplete. Please use the full link from your email.</Alert>;
  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{done}</Alert>
        <ButtonLink href="/login">Sign in</ButtonLink>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <TextField label="New password" type="password" autoComplete="new-password" hint="At least 10 characters, with a letter and a number" required value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
      <TextField label="Confirm new password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
      {error && (
        <Alert>
          {error}{" "}
          <Link href="/forgot-password" className="font-semibold underline">
            Request a new link
          </Link>
        </Alert>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}
