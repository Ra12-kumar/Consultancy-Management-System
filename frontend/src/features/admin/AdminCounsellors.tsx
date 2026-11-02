"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Alert, Badge, Card, EmptyState } from "@/components/ui/Feedback";
import { useApiData } from "@/hooks/useApiData";
import { apiGet, apiPatch, apiPost, fieldErrors } from "@/services/api";
import type { ApiError, User } from "@/types/api";
import type { CounsellorStats } from "@/types/enquiry";
import { LoadState, PageTitle, fmtDate } from "./shared";

type Row = User & { stats: CounsellorStats };
const STAT_COLUMNS: Array<[keyof CounsellorStats, string]> = [
  ["assigned", "Assigned"],
  ["contacted", "Contacted"],
  ["pending", "Pending"],
  ["converted", "Converted"],
  ["closed", "Closed"],
  ["overdue", "Overdue follow-ups"],
  ["conversionRate", "Conversion %"],
];

// Counsellors: create accounts (they set their own password from an emailed link), edit, activate or
// deactivate them, and see each counsellor's work. Enquiries are assigned from the enquiry pages.
export default function AdminCounsellors() {
  const [range, setRange] = useState({ from: "", to: "" });
  const qs = new URLSearchParams(Object.entries(range).filter(([, v]) => v).map(([k, v]) => [k, k === "from" ? `${v}T00:00:00+05:30` : `${v}T23:59:59+05:30`])).toString();
  const list = useApiData((signal) => apiGet<Row[]>(`/admin/team/counsellors${qs ? `?${qs}` : ""}`, { signal }), [qs]);
  const [form, setForm] = useState({ name: "", email: "", mobile: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string; mobile: string } | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFlash(null);
    try {
      const u = await apiPost<User>("/admin/team/counsellors", { name: form.name.trim(), email: form.email.trim(), ...(form.mobile.trim() && { mobile: form.mobile.trim() }) });
      setFlash({ tone: "success", text: `${u.name} was added. They choose their password from the email link (valid 72 hours).` });
      setForm({ name: "", email: "", mobile: "" });
      list.reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFlash({ tone: "error", text: (err as ApiError).message });
    }
  }

  async function run(fn: () => Promise<unknown>, ok: string) {
    setFlash(null);
    try {
      await fn();
      setFlash({ tone: "success", text: ok });
      list.reload();
      return true;
    } catch (err) {
      setFlash({ tone: "error", text: Object.values(fieldErrors(err)).join(" ") || (err as ApiError).message });
      return false;
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle title="Counsellors" subtitle="Counsellors see only the enquiries assigned to them. Assign or reassign enquiries from the enquiry list." />
      {flash && (
        <div aria-live="polite">
          <Alert tone={flash.tone}>{flash.text}</Alert>
        </div>
      )}
      <Card>
        <h2 className="font-semibold">Add a counsellor</h2>
        <form onSubmit={create} className="mt-3 grid gap-4 sm:grid-cols-3" noValidate>
          <TextField label="Full name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
          <TextField label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} />
          <TextField label="Mobile (optional)" type="tel" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} error={errors.mobile} />
          <div className="sm:col-span-3">
            <Button type="submit" variant="gold">
              Add counsellor
            </Button>
            <p className="mt-2 text-xs text-muted">
              Or give them an invitation code from{" "}
              <Link href="/admin/team" className="underline">
                Administrators
              </Link>{" "}
              so they can sign up themselves.
            </p>
          </div>
        </form>
      </Card>
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-semibold">Performance</h2>
          <div className="flex flex-wrap gap-2">
            <TextField label="Enquiries from" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            <TextField label="to" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </div>
        </div>
        {!list.data ? (
          <div className="mt-3">
            <LoadState status={list.status} error={list.error} reload={list.reload} />
          </div>
        ) : list.data.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No counsellors yet">Add your first counsellor above.</EmptyState>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-semibold">Counsellor</th>
                  {STAT_COLUMNS.map(([, l]) => (
                    <th key={l} className="px-2 py-2 text-right font-semibold">
                      {l}
                    </th>
                  ))}
                  <th className="py-2 pl-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((c) => (
                  <tr key={c.id} className="border-b border-line align-top last:border-0">
                    <td className="py-3 pr-3">
                      {editing?.id === c.id ? (
                        <div className="space-y-2">
                          <TextField label="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                          <TextField label="Mobile" value={editing.mobile} onChange={(e) => setEditing({ ...editing, mobile: e.target.value })} />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={async () => (await run(() => apiPatch(`/admin/team/counsellors/${c.id}`, { name: editing.name.trim(), ...(editing.mobile.trim() && { mobile: editing.mobile.trim() }) }), "Counsellor updated.")) && setEditing(null)}>
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="font-semibold">
                            {c.name} {c.status !== "active" && <Badge>Inactive</Badge>} {!c.lastLoginAt && c.status === "active" && <Badge tone="gold">Not signed in yet</Badge>}
                          </p>
                          <p className="text-xs text-muted">{c.email}</p>
                          {c.mobile && <p className="text-xs text-muted">{c.mobile}</p>}
                          {c.lastLoginAt && <p className="text-xs text-muted">Last sign-in {fmtDate(c.lastLoginAt)}</p>}
                        </>
                      )}
                    </td>
                    {STAT_COLUMNS.map(([k]) => (
                      <td key={k} className={`px-2 py-3 text-right tabular-nums ${k === "overdue" && c.stats.overdue ? "font-semibold text-danger" : ""}`}>
                        {k === "assigned" && c.stats.assigned ? (
                          <Link href={`/admin/enquiries?assigned=${c.id}`} className="underline">
                            {c.stats.assigned}
                          </Link>
                        ) : (
                          c.stats[k]
                        )}
                      </td>
                    ))}
                    <td className="py-3 pl-3 text-right">
                      <span className="inline-flex flex-wrap justify-end gap-1">
                        <Button size="sm" variant="secondary" onClick={() => setEditing({ id: c.id, name: c.name, mobile: c.mobile ?? "" })}>
                          Edit
                        </Button>
                        {c.status === "active" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              window.confirm(`Deactivate ${c.name}? They are signed out at once and cannot sign in. Their ${c.stats.pending + c.stats.contacted} enquiries stay assigned so you can reassign them.`) &&
                              void run(() => apiPost(`/admin/team/counsellors/${c.id}/deactivate`), `${c.name} was deactivated. Reassign their open enquiries from the enquiry list.`)
                            }
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => void run(() => apiPost(`/admin/team/counsellors/${c.id}/activate`), `${c.name} can sign in again.`)}>
                            Activate
                          </Button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">Converted = admission confirmed with evidence. Pending = not yet contacted. The date range filters by when the enquiry was received.</p>
      </Card>
    </div>
  );
}
