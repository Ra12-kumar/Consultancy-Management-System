"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { emailProblem, mobileProblem, nameProblem, passwordProblem } from "@/lib/validation";
import { apiPost, fieldErrors } from "@/services/api";
import type { ApiError } from "@/types/api";

type Form = { name: string; email: string; mobile: string; password: string; confirm: string };

export function validateRegistration(f: Form): Partial<Record<keyof Form, string>> {
  const errors: Partial<Record<keyof Form, string>> = {};
  const n = nameProblem(f.name);
  if (n) errors.name = n;
  const e = emailProblem(f.email);
  if (e) errors.email = e;
  const m = mobileProblem(f.mobile);
  if (m) errors.mobile = m;
  const p = passwordProblem(f.password, f.email);
  if (p) errors.password = p;
  if (!errors.password && f.confirm !== f.password) errors.confirm = "The passwords do not match";
  return errors;
}

// Public registration always creates a student account (the server refuses anything else).
export default function RegisterForm() {
  const [form, setForm] = useState<Form>({ name: "", email: "", mobile: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problems = validateRegistration(form);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    setFailure(null);
    try {
      const { message } = await apiPost<{ message: string }>("/auth/register", { name: form.name.trim(), email: form.email.trim(), mobile: form.mobile.trim(), password: form.password });
      setDone(message);
    } catch (err) {
      const server = fieldErrors(err);
      setErrors(server as Partial<Record<keyof Form, string>>);
      setFailure(Object.keys(server).length ? "Please fix the highlighted fields." : (err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Alert tone="success" title="Check your email">
        {done} The link is valid for 24 hours. If it does not arrive, check your spam folder or request a new link from the sign-in page.
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <TextField label="Full name" autoComplete="name" required value={form.name} onChange={set("name")} error={errors.name} />
      <TextField label="Email" type="email" autoComplete="email" required value={form.email} onChange={set("email")} error={errors.email} />
      <TextField label="Mobile number" type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" hint="Indian numbers can be entered without +91" required value={form.mobile} onChange={set("mobile")} error={errors.mobile} />
      <TextField label="Password" type="password" autoComplete="new-password" hint="At least 10 characters, with a letter and a number" required value={form.password} onChange={set("password")} error={errors.password} />
      <TextField label="Confirm password" type="password" autoComplete="new-password" required value={form.confirm} onChange={set("confirm")} error={errors.confirm} />
      {failure && <Alert>{failure}</Alert>}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? "Creating your account…" : "Create student account"}
      </Button>
      <p className="text-xs text-muted">By registering you agree to our terms and privacy policy. We verify your email before you can submit enquiries.</p>
    </form>
  );
}
