"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { hardNavigate } from "@/lib/navigation";
import { emailProblem, mobileProblem, nameProblem, passwordProblem } from "@/lib/validation";
import { apiPost, fieldErrors } from "@/services/api";
import type { ApiError } from "@/types/api";

type AccountType = "student" | "counsellor" | "admin";
type Form = { name: string; email: string; mobile: string; password: string; confirm: string; qualification: string; preferredCourse: string; preferredLocation: string; accountType: AccountType; inviteCode: string };

// Students register freely; counsellors and admins need an invitation code from an administrator.
export const ACCOUNT_TYPES: Array<[AccountType, string, string]> = [
  ["student", "Student", "Find colleges and get admission help"],
  ["counsellor", "Counsellor", "Needs an invitation code"],
  ["admin", "Admin", "Needs an invitation code"],
];

export const QUALIFICATION_OPTIONS = [
  ["class_10", "Class 10"],
  ["class_12", "Class 12"],
  ["diploma", "Diploma"],
  ["undergraduate", "Undergraduate degree"],
  ["postgraduate", "Postgraduate degree"],
  ["other", "Other"],
] as const;

export function validateRegistration(f: Pick<Form, "name" | "email" | "mobile" | "password" | "confirm"> & Partial<Pick<Form, "accountType" | "inviteCode">>): Partial<Record<keyof Form, string>> {
  const errors: Partial<Record<keyof Form, string>> = {};
  if (f.accountType && f.accountType !== "student" && (f.inviteCode ?? "").replace(/[^A-Za-z0-9]/g, "").length < 8) errors.inviteCode = "Enter the invitation code you received";
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

// Registration: a student account by default. Counsellor and admin accounts need a valid invitation code; the
// server takes the role from the code, never from this form.
export default function RegisterForm() {
  const [form, setForm] = useState<Form>({ name: "", email: "", mobile: "", password: "", confirm: "", qualification: "", preferredCourse: "", preferredLocation: "", accountType: "student", inviteCode: "" });
  const staff = form.accountType !== "student";
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problems = validateRegistration(form);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    setFailure(null);
    try {
      const optional = staff
        ? { accountType: form.accountType, inviteCode: form.inviteCode.trim() }
        : { qualification: form.qualification || undefined, preferredCourse: form.preferredCourse.trim() || undefined, preferredLocation: form.preferredLocation.trim() || undefined };
      await apiPost<{ message: string }>("/auth/register", { name: form.name.trim(), email: form.email.trim(), mobile: form.mobile.trim(), password: form.password, ...optional });
      // Next: enter the 6-digit code we emailed.
      hardNavigate(`/verify-email?sent=1&email=${encodeURIComponent(form.email.trim())}`);
      return;
    } catch (err) {
      const server = fieldErrors(err);
      setErrors(server as Partial<Record<keyof Form, string>>);
      setFailure(Object.keys(server).length ? "Please fix the highlighted fields." : (err as ApiError).message);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <fieldset>
        <legend className="text-sm font-semibold">I am a</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {ACCOUNT_TYPES.map(([value, label, hint]) => (
            <label key={value} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${form.accountType === value ? "border-accent bg-accent/10" : "border-line"}`}>
              <input type="radio" name="accountType" value={value} checked={form.accountType === value} onChange={() => setForm((f) => ({ ...f, accountType: value }))} className="mt-0.5" />
              <span>
                <span className="block font-semibold">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {staff && (
        <TextField
          label="Invitation code"
          autoComplete="off"
          placeholder="XXXX-XXXX-XXXX-XXXX"
          hint="Ask an administrator for a code. It works once and only for the role it was made for."
          required
          maxLength={40}
          value={form.inviteCode}
          onChange={set("inviteCode")}
          error={errors.inviteCode}
        />
      )}
      <TextField label="Full name" autoComplete="name" required value={form.name} onChange={set("name")} error={errors.name} />
      <TextField label="Email" type="email" autoComplete="email" required value={form.email} onChange={set("email")} error={errors.email} />
      <TextField label="Mobile number" type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" hint="Indian numbers can be entered without +91" required value={form.mobile} onChange={set("mobile")} error={errors.mobile} />
      <TextField label="Password" type="password" autoComplete="new-password" hint="At least 10 characters, with a letter and a number" required value={form.password} onChange={set("password")} error={errors.password} />
      <TextField label="Confirm password" type="password" autoComplete="new-password" required value={form.confirm} onChange={set("confirm")} error={errors.confirm} />
      {!staff && (
      <fieldset className="space-y-4 rounded-xl border border-line p-4">
        <legend className="px-1 text-sm font-semibold">Academic details (optional)</legend>
        <SelectField label="Highest qualification" value={form.qualification} onChange={set("qualification")} error={errors.qualification}>
          <option value="">Choose…</option>
          {QUALIFICATION_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </SelectField>
        <TextField label="Preferred course" placeholder="e.g. B.Tech, MBA" maxLength={120} value={form.preferredCourse} onChange={set("preferredCourse")} error={errors.preferredCourse} />
        <TextField label="Preferred study location" placeholder="e.g. Bengaluru, Delhi NCR" maxLength={120} value={form.preferredLocation} onChange={set("preferredLocation")} error={errors.preferredLocation} />
      </fieldset>
      )}
      {failure && <Alert>{failure}</Alert>}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? "Creating your account…" : `Create ${ACCOUNT_TYPES.find(([v]) => v === form.accountType)![1].toLowerCase()} account`}
      </Button>
      <p className="text-xs text-muted">By registering you agree to our terms and privacy policy. We will email you a 6-digit code to verify your address.</p>
    </form>
  );
}
