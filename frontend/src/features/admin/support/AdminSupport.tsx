"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { Alert, Badge, Card, EmptyState } from "@/components/ui/Feedback";
import { LoadState, PageTitle, Pager, fmtDate } from "@/features/admin/shared";
import { FEEDBACK_CATEGORIES } from "@/features/support/StudentSupport";
import { useApiData } from "@/hooks/useApiData";
import { formatINR } from "@/lib/format";
import { api, apiPost } from "@/services/api";
import type { ApiError, PageMeta } from "@/types/api";

const control = "min-h-11 rounded-xl border border-line bg-surface px-3 text-sm";
const errMsg = (e: unknown) => (e as ApiError)?.message ?? "Something went wrong";

// ---- Feedback ----

type AdminFeedbackItem = {
  id: string;
  rating: number;
  category: string;
  message: string;
  status: string;
  thread: Array<{ role: string; name: string; body: string; at: string }>;
  publishConsent: boolean;
  testimonial: { status: string; displayName: string };
  createdAt: string;
  student: { id: string; name: string; email: string } | null;
};

export function AdminFeedback() {
  const [f, setF] = useState({ status: "", testimonial: "", page: 1 });
  const [reply, setReply] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const list = useApiData(async (signal) => {
    const qs = new URLSearchParams({ page: String(f.page), ...(f.status && { status: f.status }), ...(f.testimonial && { testimonial: f.testimonial }) });
    const { data, meta } = await api<AdminFeedbackItem[]>("GET", `/admin/feedback?${qs}`, { signal });
    return { items: data, meta: meta as PageMeta };
  }, [f.status, f.testimonial, f.page]);
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      list.reload();
    } catch (e) {
      setError(errMsg(e));
    }
  };
  return (
    <div>
      <PageTitle title="Feedback" subtitle="Reply to students and resolve feedback. Only feedback a student agreed to publish can become a testimonial, and only with your approval." />
      <div className="mb-4 flex flex-wrap gap-2">
        <select aria-label="Status" className={control} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}>
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="responded">Responded</option>
          <option value="resolved">Resolved</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.testimonial === "candidates"} onChange={(e) => setF({ ...f, testimonial: e.target.checked ? "candidates" : "", page: 1 })} /> Testimonial candidates (consented, not reviewed)
        </label>
      </div>
      {error && <Alert>{error}</Alert>}
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="No feedback here" />
      ) : (
        <>
          <ul className="space-y-3">
            {list.data.items.map((x) => (
              <li key={x.id} className="rounded-2xl border border-line bg-surface p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="text-accent" aria-label={`${x.rating} out of 5`}>
                      {"★".repeat(x.rating)}
                    </span>{" "}
                    {FEEDBACK_CATEGORIES[x.category]} · {x.student?.name ?? "—"} · {fmtDate(x.createdAt)}
                  </span>
                  <span className="flex gap-1">
                    {x.publishConsent && <Badge tone="gold">Consent to publish</Badge>}
                    {x.testimonial.status !== "none" && <Badge tone={x.testimonial.status === "approved" ? "success" : "neutral"}>Testimonial {x.testimonial.status}</Badge>}
                    <Badge>{x.status}</Badge>
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-line">{x.message}</p>
                {x.thread.map((t, i) => (
                  <p key={i} className={`mt-2 rounded-xl p-3 ${t.role === "admin" ? "bg-accent/10" : "bg-surface-2"}`}>
                    <span className="block text-xs text-muted">
                      {t.name} · {fmtDate(t.at)}
                    </span>
                    {t.body}
                  </p>
                ))}
                <div className="mt-3 space-y-2">
                  <TextAreaField label="Reply to the student" value={reply[x.id] ?? ""} onChange={(e) => setReply({ ...reply, [x.id]: e.target.value })} maxLength={2000} />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={!(reply[x.id] ?? "").trim()} onClick={() => run(async () => { await apiPost(`/admin/feedback/${x.id}/respond`, { body: reply[x.id]!.trim() }); setReply({ ...reply, [x.id]: "" }); })}>
                      Reply
                    </Button>
                    <Button size="sm" variant="secondary" disabled={!(reply[x.id] ?? "").trim()} onClick={() => run(async () => { await apiPost(`/admin/feedback/${x.id}/respond`, { body: reply[x.id]!.trim(), resolve: true }); setReply({ ...reply, [x.id]: "" }); })}>
                      Reply and resolve
                    </Button>
                    {x.status !== "resolved" && (
                      <Button size="sm" variant="ghost" onClick={() => run(() => apiPost(`/admin/feedback/${x.id}/resolve`))}>
                        Resolve
                      </Button>
                    )}
                    {x.publishConsent && x.testimonial.status !== "approved" && (
                      <Button size="sm" variant="gold" onClick={() => run(() => apiPost(`/admin/feedback/${x.id}/testimonial`, { decision: "approved" }))}>
                        Approve as testimonial
                      </Button>
                    )}
                    {x.testimonial.status === "approved" && (
                      <Button size="sm" variant="ghost" onClick={() => run(() => apiPost(`/admin/feedback/${x.id}/testimonial`, { decision: "rejected" }))}>
                        Unpublish testimonial
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Pager meta={list.data.meta} onPage={(page) => setF({ ...f, page })} />
        </>
      )}
    </div>
  );
}

// ---- Personal data requests ----

type AdminRequest = { id: string; reference: string; type: "correction" | "deletion"; details: string; status: string; resolutionNote: string; createdAt: string; student: { id: string; name: string; email: string; anonymised: boolean } };

export function AdminDataRequests() {
  const [f, setF] = useState({ status: "pending", page: 1 });
  const [note, setNote] = useState<Record<string, string>>({});
  const [correction, setCorrection] = useState<Record<string, { name: string; mobile: string }>>({});
  const [flash, setFlash] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const list = useApiData(async (signal) => {
    const { data, meta } = await api<AdminRequest[]>("GET", `/admin/data-requests?page=${f.page}${f.status ? `&status=${f.status}` : ""}`, { signal });
    return { items: data, meta: meta as PageMeta };
  }, [f.status, f.page]);
  async function run(fn: () => Promise<unknown>, ok: string) {
    setFlash(null);
    try {
      await fn();
      setFlash({ tone: "success", text: ok });
      list.reload();
    } catch (e) {
      setFlash({ tone: "error", text: errMsg(e) });
    }
  }
  return (
    <div>
      <PageTitle title="Personal data requests" subtitle="Students' requests to correct their details or delete their account. Deletion anonymises the student everywhere and cannot be undone." />
      <select aria-label="Status" className={`${control} mb-4`} value={f.status} onChange={(e) => setF({ status: e.target.value, page: 1 })}>
        <option value="pending">Pending</option>
        <option value="">All</option>
        <option value="completed">Completed</option>
        <option value="rejected">Rejected</option>
        <option value="cancelled">Cancelled</option>
      </select>
      {flash && (
        <div className="mb-4">
          <Alert tone={flash.tone}>{flash.text}</Alert>
        </div>
      )}
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="Nothing waiting" />
      ) : (
        <>
          <ul className="space-y-3">
            {list.data.items.map((r) => {
              const n = note[r.id] ?? "";
              const c = correction[r.id] ?? { name: "", mobile: "" };
              return (
                <li key={r.id} className="rounded-2xl border border-line bg-surface p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-mono">{r.reference}</span> · <strong>{r.type === "deletion" ? "Delete account" : "Correct details"}</strong> · {r.student.name} ({r.student.email}) · {fmtDate(r.createdAt)}
                    </span>
                    <Badge tone={r.status === "pending" ? "gold" : r.status === "completed" ? "success" : "neutral"}>{r.status}</Badge>
                  </div>
                  {r.details && <p className="mt-2 rounded-xl bg-surface-2 p-3 whitespace-pre-line">{r.details}</p>}
                  {r.resolutionNote && <p className="mt-2 text-muted">Note: {r.resolutionNote}</p>}
                  {r.status === "pending" && (
                    <div className="mt-3 space-y-2">
                      {r.type === "correction" && (
                        <div className="flex flex-wrap items-end gap-2">
                          <TextField label="Correct name" value={c.name} onChange={(e) => setCorrection({ ...correction, [r.id]: { ...c, name: e.target.value } })} />
                          <TextField label="Correct mobile" value={c.mobile} onChange={(e) => setCorrection({ ...correction, [r.id]: { ...c, mobile: e.target.value } })} />
                          <Button size="sm" variant="secondary" disabled={!c.name.trim() && !c.mobile.trim()} onClick={() => run(() => api("PATCH", `/admin/students/${r.student.id}`, { body: { ...(c.name.trim() && { name: c.name.trim() }), ...(c.mobile.trim() && { mobile: c.mobile.trim() }) } }), "Details corrected.")}>
                            Save correction
                          </Button>
                        </div>
                      )}
                      <TextAreaField label="Note to the student" value={n} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} maxLength={1000} />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={r.type === "deletion" ? "danger" : "primary"}
                          disabled={n.trim().length < 3}
                          onClick={() => {
                            if (r.type === "deletion" && !window.confirm(`Anonymise ${r.student.name}'s account now? This cannot be undone.`)) return;
                            void run(() => apiPost(`/admin/data-requests/${r.id}/resolve`, { action: "complete", note: n.trim() }), r.type === "deletion" ? "Account anonymised." : "Request completed.");
                          }}
                        >
                          {r.type === "deletion" ? "Approve and anonymise" : "Mark completed"}
                        </Button>
                        <Button size="sm" variant="ghost" disabled={n.trim().length < 3} onClick={() => run(() => apiPost(`/admin/data-requests/${r.id}/resolve`, { action: "reject", note: n.trim() }), "Request rejected.")}>
                          Reject
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <Pager meta={list.data.meta} onPage={(page) => setF({ ...f, page })} />
        </>
      )}
    </div>
  );
}

// ---- Reports ----

type Summary = {
  range: { from: string; to: string };
  definitions: Record<string, string>;
  registrations: Array<{ date: string; count: number }>;
  enquiries: { total: number; byStatus: Record<string, number>; byCourse: Bar[]; byState: Bar[]; byCollege: Bar[]; conversion: { confirmedAdmissions: number; rate: number }; pendingFollowUps: number };
  applications: Record<string, number>;
  scholarships: { byStatus: Record<string, number>; approvedAwardsMinor: number };
  fees: Array<{ course: string; published: number; minMinor: number; avgMinor: number; maxMinor: number }>;
  emailFailures: Array<{ template: string; count: number }>;
};
type Bar = { label: string; count: number };

const DATASETS: Record<string, { label: string; fields: string[]; pii: string[] }> = {
  enquiries: { label: "Enquiries", fields: ["reference", "status", "createdAt", "courses", "colleges", "city", "state", "budgetRupees", "admissionYear", "assignedTo", "studentName", "studentEmail", "studentMobile"], pii: ["studentName", "studentEmail", "studentMobile"] },
  students: { label: "Students", fields: ["createdAt", "emailVerified", "city", "state", "percentage", "name", "email", "mobile"], pii: ["name", "email", "mobile"] },
  applications: { label: "College applications", fields: ["reference", "enquiryReference", "collegeName", "courseName", "status", "submittedAt", "decisionAt", "admissionConfirmed", "studentName"], pii: ["studentName"] },
  "scholarship-applications": { label: "Scholarship applications", fields: ["reference", "scholarshipName", "status", "preliminaryResult", "awardRupees", "createdAt", "studentName", "studentEmail"], pii: ["studentName", "studentEmail"] },
};

// Bars as a simple accessible list (values are also written out).
function Bars({ title, rows }: { title: string; rows: Bar[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card>
      <h3 className="font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No data in this period.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="flex justify-between gap-2">
                <span className="truncate">{r.label}</span>
                <span className="tabular-nums">{r.count}</span>
              </div>
              <div aria-hidden="true" className="mt-1 h-2 rounded-full bg-surface-2">
                <div className="h-2 rounded-full bg-accent" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function AdminReports() {
  // The default range (last 90 days) is fixed when the page opens.
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [range, setRange] = useState(() => ({ from: new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) }));
  const [dataset, setDataset] = useState("enquiries");
  const [fields, setFields] = useState<string[]>(DATASETS.enquiries!.fields.filter((x) => !DATASETS.enquiries!.pii.includes(x)));
  const qs = `from=${range.from}T00:00:00%2B05:30&to=${range.to}T23:59:59%2B05:30`;
  const s = useApiData((signal) => api<Summary>("GET", `/admin/reports/summary?${qs}`, { signal }).then((r) => r.data), [qs]);
  const spec = DATASETS[dataset]!;
  const includesPii = fields.some((x) => spec.pii.includes(x));
  return (
    <div className="space-y-6">
      <PageTitle title="Reports and exports" subtitle="Operational reports for a date range. Enquiries are never counted as admissions; see the definitions under each figure." />
      <div className="flex flex-wrap items-end gap-3">
        <TextField label="From" type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <TextField label="To" type="date" value={range.to} max={today} onChange={(e) => setRange({ ...range, to: e.target.value })} />
      </div>
      {!s.data ? (
        <LoadState status={s.status} error={s.error} reload={s.reload} rows={4} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Student registrations", s.data.registrations.reduce((t, r) => t + r.count, 0)],
              ["Enquiries", s.data.enquiries.total],
              ["Confirmed admissions", s.data.enquiries.conversion.confirmedAdmissions],
              ["Conversion rate", `${s.data.enquiries.conversion.rate}%`],
              ["Pending follow-ups (now)", s.data.enquiries.pendingFollowUps],
              ["Scholarships approved", s.data.scholarships.byStatus.approved ?? 0],
              ["Scholarship awards approved", formatINR(s.data.scholarships.approvedAwardsMinor)],
              ["Failed emails", s.data.emailFailures.reduce((t, e) => t + e.count, 0)],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex flex-col-reverse rounded-2xl border border-line bg-surface p-4">
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="text-2xl font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted">Conversion: {s.data.definitions.conversion}</p>
          <div className="grid gap-4 lg:grid-cols-3">
            <Bars title="Enquiries by main course" rows={s.data.enquiries.byCourse} />
            <Bars title="Enquiries by state" rows={s.data.enquiries.byState} />
            <Bars title="Enquiries by preferred college" rows={s.data.enquiries.byCollege} />
            <Bars title="Enquiry status" rows={Object.entries(s.data.enquiries.byStatus).map(([label, count]) => ({ label, count }))} />
            <Bars title="College application outcomes" rows={Object.entries(s.data.applications).map(([label, count]) => ({ label, count }))} />
            <Bars title="Scholarship application outcomes" rows={Object.entries(s.data.scholarships.byStatus).map(([label, count]) => ({ label, count }))} />
          </div>
          {s.data.fees.length > 0 && (
            <Card>
              <h3 className="font-semibold">Published official fees by course</h3>
              <p className="text-xs text-muted">{s.data.definitions.fees}</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="py-1">Course</th>
                      <th className="text-right">Fee records</th>
                      <th className="text-right">Lowest</th>
                      <th className="text-right">Average</th>
                      <th className="text-right">Highest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.data.fees.map((f) => (
                      <tr key={f.course} className="border-t border-line">
                        <td className="py-1.5">{f.course}</td>
                        <td className="text-right tabular-nums">{f.published}</td>
                        <td className="text-right tabular-nums">{formatINR(f.minMinor)}</td>
                        <td className="text-right tabular-nums">{formatINR(f.avgMinor)}</td>
                        <td className="text-right tabular-nums">{formatINR(f.maxMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
      <Card>
        <h2 className="font-semibold">Export to CSV</h2>
        <p className="mt-1 text-sm text-muted">Up to 5,000 rows for the dates above. Personal details are left out unless you tick them, and every export is recorded in the audit log.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(DATASETS).map(([k, d]) => (
            <Button key={k} size="sm" variant={dataset === k ? "primary" : "secondary"} onClick={() => { setDataset(k); setFields(d.fields.filter((x) => !d.pii.includes(x))); }}>
              {d.label}
            </Button>
          ))}
        </div>
        <fieldset className="mt-3">
          <legend className="text-sm font-medium">Columns</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {spec.fields.map((x) => (
              <label key={x} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={fields.includes(x)} onChange={(e) => setFields(e.target.checked ? [...fields, x] : fields.filter((y) => y !== x))} />
                {x}
                {spec.pii.includes(x) && <span className="text-xs text-warning">(personal)</span>}
              </label>
            ))}
          </div>
        </fieldset>
        {includesPii && (
          <div className="mt-3">
            <Alert tone="warning">This export includes personal data. Store it securely and delete it when you no longer need it.</Alert>
          </div>
        )}
        <a
          className={`mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-fg ${fields.length ? "" : "pointer-events-none opacity-50"}`}
          href={`/api/admin/reports/export/${dataset}?${qs}&fields=${fields.join(",")}`}
          download
        >
          Download CSV
        </a>
      </Card>
    </div>
  );
}
