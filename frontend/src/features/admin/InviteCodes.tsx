"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Alert, Badge, Card } from "@/components/ui/Feedback";
import { useApiData } from "@/hooks/useApiData";
import { apiDelete, apiGet, apiPost, fieldErrors } from "@/services/api";
import type { ApiError } from "@/types/api";
import { LoadState, fmtDate } from "./shared";

export type InviteCode = { id: string; hint: string; role: "admin" | "counsellor"; permissions: string[]; email: string | null; note: string; status: "active" | "used" | "expired" | "revoked"; expiresAt: string; usedAt: string | null; createdBy: string; createdAt: string | null };

const STATUS_TONE = { active: "success", used: "neutral", expired: "neutral", revoked: "danger" } as const;

// Single-use codes for counsellor and admin sign-up. The code is shown once, right after it is made.
export default function InviteCodes({ renderPermissions }: { renderPermissions: (value: string[], onChange: (v: string[]) => void) => ReactNode }) {
  const codes = useApiData((signal) => apiGet<InviteCode[]>("/admin/invite-codes", { signal }), []);
  const [form, setForm] = useState({ role: "counsellor" as InviteCode["role"], email: "", note: "", days: "7", permissions: ["students.read"] as string[] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fresh, setFresh] = useState<{ code: string; role: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setMsg(null);
    setCopied(false);
    try {
      const res = await apiPost<{ code: string; invite: InviteCode }>("/admin/invite-codes", {
        role: form.role,
        ...(form.role === "admin" && { permissions: form.permissions }),
        ...(form.email.trim() && { email: form.email.trim() }),
        note: form.note.trim(),
        days: Number(form.days),
      });
      setFresh({ code: res.code, role: res.invite.role });
      setForm((f) => ({ ...f, email: "", note: "" }));
      codes.reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      setMsg((err as ApiError).message);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm("Revoke this invitation code? Nobody will be able to use it.")) return;
    try {
      await apiDelete(`/admin/invite-codes/${id}`);
      codes.reload();
    } catch (err) {
      setMsg((err as ApiError).message);
    }
  }

  return (
    <Card>
      <h2 className="font-semibold">Invitation codes for counsellors and admins</h2>
      <p className="mt-1 text-sm text-muted">Give a code to a new counsellor or admin. They choose the role on the sign-up page, enter the code and verify their email. Each code works once.</p>
      <form onSubmit={create} className="mt-4 space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField label="Role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as InviteCode["role"] }))}>
            <option value="counsellor">Counsellor</option>
            <option value="admin">Admin</option>
          </SelectField>
          <TextField label="Only for this email (optional)" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} error={errors.email} />
          <SelectField label="Valid for" value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}>
            {["1", "3", "7", "14", "30"].map((d) => (
              <option key={d} value={d}>
                {d} {d === "1" ? "day" : "days"}
              </option>
            ))}
          </SelectField>
        </div>
        <TextField label="Note (optional)" placeholder="e.g. For Priya, Pune office" maxLength={200} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        {form.role === "admin" && renderPermissions(form.permissions, (permissions) => setForm((f) => ({ ...f, permissions })))}
        <Button type="submit" variant="gold">
          Create code
        </Button>
      </form>
      {msg && (
        <div className="mt-4">
          <Alert>{msg}</Alert>
        </div>
      )}
      {fresh && (
        <div className="mt-4">
          <Alert tone="success" title={`New ${fresh.role} code (shown only once)`}>
            <span className="mt-1 flex flex-wrap items-center gap-2">
              <code className="rounded-lg bg-surface px-3 py-1.5 font-mono text-base font-semibold tracking-wider">{fresh.code}</code>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard?.writeText(fresh.code);
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy code"}
              </Button>
            </span>
            <span className="mt-1 block text-xs">Send it privately. We store only a scrambled version, so it cannot be shown again.</span>
          </Alert>
        </div>
      )}
      <h3 className="mt-6 text-sm font-semibold">Recent codes</h3>
      {!codes.data ? (
        <div className="mt-2">
          <LoadState status={codes.status} error={codes.error} reload={codes.reload} />
        </div>
      ) : codes.data.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No codes yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line text-sm">
          {codes.data.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-mono">…{c.hint}</span> <Badge>{c.role === "admin" ? "Admin" : "Counsellor"}</Badge> <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                <span className="block text-xs text-muted">
                  {c.email ? `Only for ${c.email} · ` : ""}
                  {c.status === "used" ? `Used ${fmtDate(c.usedAt)}` : `Expires ${fmtDate(c.expiresAt)}`}
                  {c.note ? ` · ${c.note}` : ""} · by {c.createdBy}
                </span>
              </span>
              {c.status === "active" && (
                <Button size="sm" variant="ghost" onClick={() => revoke(c.id)}>
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
