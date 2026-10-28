"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Alert, Card } from "@/components/ui/Feedback";
import { useAuth } from "@/features/auth/AuthProvider";
import { passwordProblem } from "@/lib/validation";
import { apiPost, fieldErrors } from "@/services/api";
import type { ApiError } from "@/types/api";

// Account settings shared by students and admins: change password, sign out of every device.
export default function AccountSettings() {
  const { setUser } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<{ busy: boolean; ok?: string; error?: string }>({ busy: false });

  async function change(e: FormEvent) {
    e.preventDefault();
    const p = passwordProblem(form.newPassword);
    if (!form.currentPassword || p) return setErrors({ ...(form.currentPassword ? {} : { currentPassword: "Enter your current password" }), ...(p ? { newPassword: p } : {}) });
    setErrors({});
    setState({ busy: true });
    try {
      const { message } = await apiPost<{ message: string }>("/auth/change-password", form);
      setForm({ currentPassword: "", newPassword: "" });
      setState({ busy: false, ok: message });
    } catch (err) {
      setErrors(fieldErrors(err));
      setState({ busy: false, error: Object.keys(fieldErrors(err)).length ? undefined : (err as ApiError).message });
    }
  }

  async function logoutAll() {
    await apiPost("/auth/logout-all").catch(() => undefined);
    setUser(null);
    router.push("/login");
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold">Change password</h2>
        <form onSubmit={change} className="mt-4 max-w-md space-y-4" noValidate>
          <TextField label="Current password" type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))} error={errors.currentPassword} />
          <TextField label="New password" type="password" autoComplete="new-password" hint="At least 10 characters, with a letter and a number" value={form.newPassword} onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))} error={errors.newPassword} />
          {state.ok && <Alert tone="success">{state.ok}</Alert>}
          {state.error && <Alert>{state.error}</Alert>}
          <Button type="submit" disabled={state.busy}>
            {state.busy ? "Saving…" : "Change password"}
          </Button>
        </form>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Sign out everywhere</h2>
        <p className="mt-1 text-sm text-muted">Ends your sessions on every device, including this one.</p>
        <Button variant="secondary" className="mt-4" onClick={logoutAll}>
          Sign out of all devices
        </Button>
      </Card>
    </div>
  );
}
