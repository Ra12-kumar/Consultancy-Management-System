"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Alert, Avatar, Badge, Card, EmptyState } from "@/components/ui/Feedback";
import { useAuth } from "@/features/auth/AuthProvider";
import { useApiData } from "@/hooks/useApiData";
import { api, apiGet, apiPatch, apiPost, fieldErrors } from "@/services/api";
import type { ApiError, PageMeta, User } from "@/types/api";
import { ADMIN_LABELS, StatusBadge } from "@/features/enquiry/shared";
import type { EnquiryStatus } from "@/types/enquiry";
import { EmailStatusBadge, LoadState, PageTitle, Pager, fmtDate } from "./shared";

const page = async <T,>(path: string, signal: AbortSignal) => {
  const { data, meta } = await api<T[]>("GET", path, { signal });
  return { items: data, meta: meta as PageMeta };
};

// ---- Dashboard ----

type Summary = {
  students: { total: number; verified: number; unverified: number; newThisWeek: number };
  recentStudents: User[];
  email: Record<string, number> & { mode: "smtp" | "log-only" };
  catalog: { colleges: { published: number; draft: number; archived: number; sample: number }; offerings: number; fees: { draft: number; published: number } };
  enquiries: { total: number; new: number; unassigned: number; open: number; followUpsDue: number };
  applications: { inProgress: number; confirmedAdmissions: number };
  appointments: { next7Days: number };
  scholarships: { published: number; applications: { submitted: number; underReview: number; approved: number; rejected: number } };
  recentEnquiries: Array<{ id: string; reference: string; status: EnquiryStatus; studentName: string; createdAt: string }>;
};

// Filters for the dashboard figures (date, course, college, state, enquiry and scholarship status).
function DashboardFilters({ value, onChange }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const opts = useApiData(async (signal) => {
    const [courses, colleges, locations] = await Promise.all([apiGet<Array<{ id: string; name: string }>>("/courses", { signal }), apiGet<Array<{ id: string; name: string }>>("/colleges?limit=50&sort=name", { signal }), apiGet<Array<{ name: string; kind: string }>>("/locations", { signal })]);
    return { courses, colleges, states: locations.filter((l) => l.kind === "state").map((l) => l.name) };
  }, []);
  const ctl = "min-h-10 rounded-xl border border-line bg-surface px-2 text-sm";
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  const active = Object.values(value).some(Boolean);
  return (
    <div role="group" aria-label="Dashboard filters" className="mb-6 flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-surface p-3">
      <label className="text-xs">From<input type="date" className={`${ctl} block`} value={value.from ?? ""} onChange={(e) => set("from", e.target.value)} /></label>
      <label className="text-xs">To<input type="date" className={`${ctl} block`} value={value.to ?? ""} onChange={(e) => set("to", e.target.value)} /></label>
      <select aria-label="Course" className={ctl} value={value.course ?? ""} onChange={(e) => set("course", e.target.value)}><option value="">All courses</option>{opts.data?.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select aria-label="College" className={ctl} value={value.college ?? ""} onChange={(e) => set("college", e.target.value)}><option value="">All colleges</option>{opts.data?.colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select aria-label="State" className={ctl} value={value.state ?? ""} onChange={(e) => set("state", e.target.value)}><option value="">All states</option>{opts.data?.states.map((s) => <option key={s} value={s}>{s}</option>)}</select>
      <select aria-label="Enquiry status" className={ctl} value={value.status ?? ""} onChange={(e) => set("status", e.target.value)}><option value="">Any enquiry status</option>{Object.entries(ADMIN_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select aria-label="Scholarship status" className={ctl} value={value.scholarshipStatus ?? ""} onChange={(e) => set("scholarshipStatus", e.target.value)}><option value="">Any scholarship status</option>{["submitted", "under_review", "documents_pending", "approved", "rejected"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select>
      {active && <Button size="sm" variant="ghost" onClick={() => onChange({})}>Clear</Button>}
    </div>
  );
}

export function AdminDashboard() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v).map(([k, v]) => [k, k === "from" ? `${v}T00:00:00+05:30` : k === "to" ? `${v}T23:59:59+05:30` : v])).toString();
  const s = useApiData((signal) => apiGet<Summary>(`/admin/dashboard/summary${qs ? `?${qs}` : ""}`, { signal }), [qs]);
  return (
    <div>
      <PageTitle title="Dashboard" subtitle="Enquiries, admissions, scholarships, students, colleges and email activity." />
      <DashboardFilters value={filters} onChange={setFilters} />
      {!s.data ? (
        <LoadState status={s.status} error={s.error} reload={s.reload} rows={4} />
      ) : (
        <div className="space-y-6">
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Registered students", s.data.students.total],
              ["Email verified", s.data.students.verified],
              ["Not yet verified", s.data.students.unverified],
              ["New this week", s.data.students.newThisWeek],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col-reverse rounded-2xl border border-line bg-surface p-4">
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="text-3xl font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(
              [
                ["Open enquiries", s.data.enquiries.open, "/admin/enquiries"],
                ["New, not yet contacted", s.data.enquiries.new, "/admin/enquiries"],
                ["Follow-ups due", s.data.enquiries.followUpsDue, "/admin/enquiries"],
                ["Unassigned", s.data.enquiries.unassigned, "/admin/enquiries"],
                ["Applications in progress", s.data.applications.inProgress, "/admin/admissions"],
                // Confirmed with verified evidence only.
                ["Confirmed admissions", s.data.applications.confirmedAdmissions, "/admin/admissions"],
                ["Sessions in the next 7 days", s.data.appointments.next7Days, "/admin/appointments"],
                ["Total enquiries", s.data.enquiries.total, "/admin/enquiries"],
                ["Published scholarships", s.data.scholarships.published, "/admin/scholarships"],
                ["Scholarship applications to review", s.data.scholarships.applications.submitted + s.data.scholarships.applications.underReview, "/admin/scholarship-applications"],
                ["Scholarships approved", s.data.scholarships.applications.approved, "/admin/scholarship-applications"],
                ["Scholarships not approved", s.data.scholarships.applications.rejected, "/admin/scholarship-applications"],
              ] as const
            ).map(([label, value, href]) => (
              <div key={label} className="flex flex-col-reverse rounded-2xl border border-line bg-surface p-4">
                <dt className="text-sm text-muted">
                  <Link href={href} className="hover:underline">
                    {label}
                  </Link>
                </dt>
                <dd className="text-3xl font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {s.data.recentEnquiries.length > 0 && (
            <Card>
              <h2 className="font-semibold">Latest enquiries</h2>
              <ul className="mt-3 divide-y divide-line text-sm">
                {s.data.recentEnquiries.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/admin/enquiries/${e.id}`} className="font-mono font-semibold hover:underline">
                      {e.reference}
                    </Link>
                    <span className="min-w-0 flex-1 truncate">{e.studentName}</span>
                    <StatusBadge status={e.status} admin />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Published colleges", s.data.catalog.colleges.published],
              ["Draft colleges", s.data.catalog.colleges.draft],
              ["Courses offered", s.data.catalog.offerings],
              ["Fee drafts awaiting publishing", s.data.catalog.fees.draft],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col-reverse rounded-2xl border border-line bg-surface p-4">
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="text-3xl font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {s.data.catalog.colleges.sample > 0 && (
            <Alert tone="warning" title={`${s.data.catalog.colleges.sample} sample colleges are in the catalogue`}>
              They are fictional and labelled “Sample data – not a real institution”. Remove them before going live with <code>npm run seed:remove-samples</code>.
            </Alert>
          )}
          {s.data.email.mode === "log-only" && (
            <Alert tone="warning" title="Email is not sending yet">
              The SMTP settings are incomplete, so emails are recorded as “not sent”. See <Link href="/admin/email" className="font-semibold underline">Email notifications</Link>.
            </Alert>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="font-semibold">Recent registrations</h2>
              {s.data.recentStudents.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No students yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {s.data.recentStudents.map((u) => (
                    <li key={u.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <Avatar name={u.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{u.name}</span>
                        <span className="block truncate text-xs text-muted">{u.email}</span>
                      </span>
                      <Badge tone={u.emailVerified ? "success" : "warning"}>{u.emailVerified ? "Verified" : "Unverified"}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <h2 className="font-semibold">Email delivery</h2>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {(["sent", "queued", "retrying", "failed", "not_sent_unconfigured"] as const).map((k) => (
                  <div key={k} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
                    <dt>
                      <EmailStatusBadge status={k} />
                    </dt>
                    <dd className="font-semibold tabular-nums">{s.data!.email[k] ?? 0}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Students ----

export function AdminStudents() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState({ q: "", verified: "", sort: "newest", page: 1 });
  const list = useApiData(
    (signal) => page<User>(`/admin/students?${new URLSearchParams(Object.entries({ ...query, page: String(query.page) }).filter(([, v]) => v !== "")).toString()}`, signal),
    [query],
  );
  return (
    <div>
      <PageTitle title="Students" subtitle="Search, filter and review registered students." />
      <form
        className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery((x) => ({ ...x, q: q.trim(), page: 1 }));
        }}
      >
        <div className="flex-1">
          <TextField label="Search name, email or mobile" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} />
        </div>
        <SelectField label="Email" value={query.verified} onChange={(e) => setQuery((x) => ({ ...x, verified: e.target.value, page: 1 }))}>
          <option value="">All</option>
          <option value="yes">Verified</option>
          <option value="no">Not verified</option>
        </SelectField>
        <SelectField label="Sort" value={query.sort} onChange={(e) => setQuery((x) => ({ ...x, sort: e.target.value, page: 1 }))}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name</option>
        </SelectField>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="No students found">Try a different search or filter.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface" role="region" aria-label="Students" tabIndex={0}>
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-surface-2 text-xs text-muted uppercase">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Mobile</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.data.items.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <span className="font-medium">{u.name}</span>
                    <span className="block text-xs text-muted">{u.email}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{u.mobile ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={u.emailVerified ? "success" : "warning"}>{u.emailVerified ? "Verified" : "Unverified"}</Badge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{fmtDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={list.data?.meta} onPage={(p) => setQuery((x) => ({ ...x, page: p }))} />
    </div>
  );
}

// ---- Email notifications ----

type EmailStatusInfo = { mode: "smtp" | "log-only"; provider: string | null; sender: string | null; missing: string[]; lastCheck: { ok: boolean; at: string; error: string | null } | null };
type Delivery = { id: string; to: string; template: string; subject: string; status: string; attempts: number; lastError: string | null; providerMessageId: string | null; sentAt: string | null; nextAttemptAt: string | null; createdAt: string };

export function AdminEmail() {
  const [status, setStatus] = useState("");
  const [p, setP] = useState(1);
  const info = useApiData((signal) => apiGet<EmailStatusInfo>("/admin/email/status", { signal }), []);
  const list = useApiData((signal) => page<Delivery>(`/admin/email/deliveries?page=${p}${status ? `&status=${status}` : ""}`, signal), [status, p]);
  return (
    <div>
      <PageTitle title="Email notifications" subtitle="Every email the system queued, with its delivery status. Message contents and links are never shown here." action={<Button size="sm" variant="secondary" onClick={list.reload}>Refresh</Button>} />
      {info.data && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Email provider</h2>
              <p className="text-sm text-muted">
                {info.data.provider ?? "Not set"} {info.data.sender ? `· sender ${info.data.sender}` : ""}
              </p>
            </div>
            <Badge tone={info.data.mode === "smtp" && info.data.lastCheck?.ok ? "success" : "warning"}>{info.data.mode === "smtp" ? (info.data.lastCheck?.ok ? "Connected" : "Configured, login not confirmed") : "Not sending (log only)"}</Badge>
          </div>
          {info.data.missing.length > 0 && <p className="mt-3 text-sm">Missing settings: {info.data.missing.join(", ")}. Add them to the server’s .env and restart the API.</p>}
          {info.data.lastCheck?.error && <p className="mt-2 text-sm text-danger">Last check: {info.data.lastCheck.error}</p>}
        </Card>
      )}
      <div className="mb-4 max-w-xs">
        <SelectField
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setP(1);
          }}
        >
          <option value="">All</option>
          <option value="sent">Sent</option>
          <option value="queued">Queued</option>
          <option value="retrying">Retrying</option>
          <option value="failed">Failed</option>
          <option value="not_sent_unconfigured">Not sent (not set up)</option>
        </SelectField>
      </div>
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="No emails yet" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface" role="region" aria-label="Email deliveries" tabIndex={0}>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-surface-2 text-xs text-muted uppercase">
              <tr>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Queued</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.data.items.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-3">{d.to}</td>
                  <td className="px-4 py-3">
                    {d.subject}
                    {d.lastError && d.status !== "sent" && <span className="block text-xs text-danger">{d.lastError}</span>}
                    {d.providerMessageId && <span className="block font-mono text-xs text-muted">{d.providerMessageId}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <EmailStatusBadge status={d.status} />
                    {d.nextAttemptAt && d.status === "retrying" && <span className="block text-xs text-muted">next try {fmtDate(d.nextAttemptAt)}</span>}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{d.attempts}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{fmtDate(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={list.data?.meta} onPage={setP} />
    </div>
  );
}

// ---- Administrators ----

const PERMISSION_LABELS: Record<string, string> = {
  "students.read": "View students",
  "students.write": "Edit students",
  "admins.manage": "Manage administrators",
  "email.view": "View email notifications",
  "audit.read": "View audit log",
  "catalog.manage": "Manage colleges and courses",
  "pricing.manage": "Manage college fees",
  "enquiries.manage": "Manage enquiries, applications and appointments",
  "admissions.confirm": "Confirm admissions (with evidence)",
  "scholarships.manage": "Manage scholarships",
  "scholarships.approve": "Approve scholarships",
  "reports.export": "View reports and export data",
  "feedback.manage": "Manage feedback and testimonials",
  "privacy.manage": "Handle personal data requests (incl. deletion)",
  "content.manage": "Edit website pages and send announcements",
  "payments.manage": "Request and track payments",
  "settings.manage": "Manage site settings and email templates",
};

function PermissionPicker({ value, onChange, allowed }: { value: string[]; onChange: (v: string[]) => void; allowed: string[] }) {
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-medium">Permissions</legend>
      {Object.entries(PERMISSION_LABELS).map(([p, label]) => (
        <label key={p} className={`flex min-h-10 items-center gap-2 text-sm ${allowed.includes(p) ? "" : "opacity-50"}`}>
          <input type="checkbox" className="size-4 accent-[var(--accent)]" disabled={!allowed.includes(p)} checked={value.includes(p)} onChange={(e) => onChange(e.target.checked ? [...value, p] : value.filter((x) => x !== p))} />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

export function AdminTeam() {
  const { user } = useAuth();
  const admins = useApiData((signal) => apiGet<User[]>("/admin/admins", { signal }), []);
  const [invite, setInvite] = useState({ name: "", email: "", permissions: ["students.read"] as string[] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; permissions: string[] } | null>(null);
  const mine = user?.permissions ?? [];

  async function sendInvite(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErrors({});
    try {
      const u = await apiPost<User>("/admin/admins", { ...invite, name: invite.name.trim(), email: invite.email.trim() });
      setMsg({ tone: "success", text: `Invitation sent to ${u.email}. They choose their own password from the email link (valid 72 hours).` });
      setInvite({ name: "", email: "", permissions: ["students.read"] });
      admins.reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      setMsg({ tone: "error", text: (err as ApiError).message });
    }
  }

  async function savePermissions() {
    if (!editing) return;
    try {
      await apiPatch(`/admin/admins/${editing.id}/permissions`, { permissions: editing.permissions });
      setMsg({ tone: "success", text: "Permissions updated. That administrator has been signed out so the change applies at once." });
      setEditing(null);
      admins.reload();
    } catch (err) {
      setMsg({ tone: "error", text: (err as ApiError).message });
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle title="Administrators" subtitle="Invite administrators with only the permissions they need. Nobody can change their own permissions." />
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Card>
        <h2 className="font-semibold">Invite an administrator</h2>
        <form onSubmit={sendInvite} className="mt-4 space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Full name" value={invite.name} onChange={(e) => setInvite((x) => ({ ...x, name: e.target.value }))} error={errors.name} />
            <TextField label="Email" type="email" value={invite.email} onChange={(e) => setInvite((x) => ({ ...x, email: e.target.value }))} error={errors.email} />
          </div>
          <PermissionPicker value={invite.permissions} allowed={mine} onChange={(permissions) => setInvite((x) => ({ ...x, permissions }))} />
          <Button type="submit" variant="gold">
            Send invitation
          </Button>
        </form>
      </Card>
      <Card>
        <h2 className="font-semibold">Current administrators</h2>
        {!admins.data ? (
          <div className="mt-3">
            <LoadState status={admins.status} error={admins.error} reload={admins.reload} />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {admins.data.map((a) => (
              <li key={a.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{a.name}</span> <span className="text-muted">{a.email}</span> {a.id === user?.id && <Badge tone="gold">You</Badge>} {!a.lastLoginAt && <Badge>Invitation pending</Badge>}
                  </span>
                  {a.id !== user?.id && (
                    <Button size="sm" variant="secondary" onClick={() => setEditing({ id: a.id, permissions: a.permissions })}>
                      Edit permissions
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">{a.permissions.map((p) => PERMISSION_LABELS[p] ?? p).join(" · ") || "No permissions"}</p>
                {editing?.id === a.id && (
                  <div className="mt-3 space-y-3 rounded-xl bg-surface-2 p-4">
                    <PermissionPicker value={editing.permissions} allowed={mine} onChange={(permissions) => setEditing({ id: a.id, permissions })} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={savePermissions}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---- Audit log ----

type AuditRow = { id: string; actor: string; role: string; action: string; target: string | null; ip: string; at: string };

export function AdminAudit() {
  const [p, setP] = useState(1);
  const list = useApiData((signal) => page<AuditRow>(`/admin/audit-logs?page=${p}`, signal), [p]);
  return (
    <div>
      <PageTitle title="Audit log" subtitle="Append-only record of sign-ins by administrators and security-relevant changes." />
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="No audit records yet" />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface text-sm">
          {list.data.items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
              <span>
                <span className="font-mono text-xs">{a.action}</span> <span className="text-muted">by</span> {a.actor}
                {a.target && <span className="block text-xs text-muted">{a.target}</span>}
              </span>
              <span className="text-xs text-muted">
                {fmtDate(a.at)}
                {a.ip ? ` · ${a.ip}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Pager meta={list.data?.meta} onPage={setP} />
    </div>
  );
}
