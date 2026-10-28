"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Alert, Badge, Card, EmptyState } from "@/components/ui/Feedback";
import { LoadState, PageTitle, Pager, fmtDate } from "@/features/admin/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { ADMIN_LABELS, APPLICATION_LABELS, APPOINTMENT_LABELS, MODE_LABELS, StatusBadge, isoToIstInput, istInputToIso, reasonRequired } from "@/features/enquiry/shared";
import { RequestPaymentPanel } from "@/features/admin/stage7/AdminStage7";
import { useApiData } from "@/hooks/useApiData";
import { formatINR } from "@/lib/format";
import { api, apiGet, apiPatch, apiPost, fieldErrors } from "@/services/api";
import type { PageMeta } from "@/types/api";
import type { Course } from "@/types/catalog";
import type { AdminAppointment, AdminApplication, AdminEnquiry, AdminEnquiryRow, Counsellor, EnquiryStatus } from "@/types/enquiry";

const errMsg = (e: unknown) => (e as { message?: string }).message ?? "Something went wrong";
const control = "min-h-11 rounded-xl border border-line bg-surface px-3 text-sm";
const QUALIFICATIONS: Record<string, string> = { class_10: "Class 10", class_12: "Class 12", diploma: "Diploma", undergraduate: "UG degree", postgraduate: "PG degree", other: "Other" };

// ---- List ----

export function AdminEnquiryList() {
  const [f, setF] = useState({ q: "", status: "", open: "yes", assigned: "", followUpDue: "", sort: "newest", page: 1 });
  const qs = new URLSearchParams(Object.entries(f).filter(([k, v]) => v !== "" && !(k === "page" && v === 1)).map(([k, v]) => [k, String(v)]));
  if (f.status) qs.delete("open");
  const list = useApiData(async (signal) => {
    const { data, meta } = await api<AdminEnquiryRow[]>("GET", `/admin/enquiries?${qs}`, { signal });
    return { items: data, meta: meta as PageMeta };
  }, [qs.toString()]);
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch, page: patch.page ?? 1 });
  return (
    <div>
      <PageTitle title="Enquiries" subtitle="Admission enquiries from students. Open one to assign it, contact the student and move it forward." />
      <div className="mb-4 flex flex-wrap gap-2">
        <input type="search" aria-label="Search enquiries" placeholder="Reference, name, email or mobile" className={`${control} min-w-56 flex-1`} value={f.q} onChange={(e) => set({ q: e.target.value })} />
        <select aria-label="Status" className={control} value={f.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">{f.open ? "All open" : "All statuses"}</option>
          {Object.entries(ADMIN_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select aria-label="Assigned to" className={control} value={f.assigned} onChange={(e) => set({ assigned: e.target.value })}>
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.open === "yes"} onChange={(e) => set({ open: e.target.checked ? "yes" : "" })} /> Open only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.followUpDue === "yes"} onChange={(e) => set({ followUpDue: e.target.checked ? "yes" : "" })} /> Follow-up due
        </label>
        <select aria-label="Sort" className={control} value={f.sort} onChange={(e) => set({ sort: e.target.value })}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="activity">Recent activity</option>
          <option value="follow_up">Follow-up date</option>
        </select>
      </div>
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="No enquiries match">Try clearing a filter.</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[48rem] text-sm">
              <caption className="sr-only">Enquiries</caption>
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="p-3">Reference</th>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Status</th>
                  <th>Counsellor</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((e) => (
                  <tr key={e.id} className="border-t border-line">
                    <td className="p-3">
                      <Link href={`/admin/enquiries/${e.id}`} className="font-mono font-semibold hover:underline">
                        {e.reference}
                      </Link>
                      {e.followUpDue && (
                        <span className="ml-2">
                          <Badge tone="warning">Follow-up due</Badge>
                        </span>
                      )}
                    </td>
                    <td>
                      {e.studentName}
                      <span className="block text-xs text-muted">{e.place || e.studentEmail}</span>
                    </td>
                    <td>{e.courses.join(", ")}</td>
                    <td>
                      <StatusBadge status={e.status} admin />
                    </td>
                    <td>{e.assignedTo ?? <span className="text-muted">Unassigned</span>}</td>
                    <td className="text-xs text-muted">{fmtDate(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager meta={list.data.meta} onPage={(page) => set({ page })} />
        </>
      )}
    </div>
  );
}

// ---- Detail panels ----

type Act = (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function StatusPanel({ e, act }: { e: AdminEnquiry; act: Act }) {
  const [to, setTo] = useState<EnquiryStatus | "">("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const needsReason = to !== "" && reasonRequired(e.status, to);
  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!to) return;
    if (needsReason && !reason.trim()) return setError("Give a reason for this change");
    setError("");
    const ok = await act(() => apiPost(`/admin/enquiries/${e.id}/status`, { fromStatus: e.status, toStatus: to, reason: reason.trim(), studentMessage: message.trim() }), "Status updated.");
    if (ok) {
      setTo("");
      setReason("");
      setMessage("");
    }
  }
  return (
    <Section title="Status">
      <p className="mb-3 flex items-center gap-2 text-sm">
        Now: <StatusBadge status={e.status} admin /> <span className="text-muted">(student sees “{e.statusLabel}”)</span>
      </p>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <SelectField label="Move to" value={to} onChange={(ev) => setTo(ev.target.value as EnquiryStatus)}>
          <option value="">Choose…</option>
          {e.allowedTransitions.map((s) => (
            <option key={s} value={s}>
              {ADMIN_LABELS[s]}
            </option>
          ))}
        </SelectField>
        {to && (
          <>
            <TextAreaField label={`Internal reason${needsReason ? "" : " (optional)"}`} required={needsReason} value={reason} onChange={(ev) => setReason(ev.target.value)} error={error} hint="Only the team sees this" maxLength={1000} />
            <TextAreaField label="Message to the student (optional)" value={message} onChange={(ev) => setMessage(ev.target.value)} hint="Shown to the student and included in their email" maxLength={1000} />
            <Button type="submit" size="sm">
              Update status
            </Button>
          </>
        )}
      </form>
      <p className="mt-3 text-xs text-muted">“Admitted” is set by confirming a college application with evidence.</p>
    </Section>
  );
}

function AssignPanel({ e, act }: { e: AdminEnquiry; act: Act }) {
  const people = useApiData((signal) => apiGet<Counsellor[]>("/admin/counsellors", { signal }), []);
  const [followUp, setFollowUp] = useState(e.followUpAt ? isoToIstInput(e.followUpAt) : "");
  return (
    <Section title="Counsellor and follow-up">
      <div className="space-y-3">
        <SelectField label="Assigned counsellor" value={e.assignedTo?.id ?? ""} onChange={(ev) => void act(() => apiPatch(`/admin/enquiries/${e.id}`, { assignedTo: ev.target.value || null }), "Assignment saved.")}>
          <option value="">Unassigned</option>
          {people.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>
        <div className="flex items-end gap-2">
          <TextField label="Follow up on (India time)" type="datetime-local" value={followUp} onChange={(ev) => setFollowUp(ev.target.value)} />
          <Button size="sm" variant="secondary" onClick={() => void act(() => apiPatch(`/admin/enquiries/${e.id}`, { followUpAt: followUp ? istInputToIso(followUp) : null }), "Follow-up saved.")}>
            Save
          </Button>
        </div>
      </div>
    </Section>
  );
}

function ActivityPanel({ e, act }: { e: AdminEnquiry; act: Act }) {
  const [tab, setTab] = useState<"note" | "contact" | "message">("note");
  const [text, setText] = useState("");
  const [contact, setContact] = useState({ channel: "phone", outcome: "reached" });
  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const fn = {
      note: () => apiPost(`/admin/enquiries/${e.id}/notes`, { body: text.trim() }),
      contact: () => apiPost(`/admin/enquiries/${e.id}/contact-attempts`, { ...contact, note: text.trim() }),
      message: () => apiPost(`/admin/enquiries/${e.id}/messages`, { body: text.trim() }),
    }[tab];
    if (await act(fn, { note: "Note added.", contact: "Contact attempt recorded.", message: "Message sent to the student." }[tab])) setText("");
  }
  return (
    <Section title="Add to the record">
      <div role="tablist" className="mb-3 flex gap-1">
        {(
          [
            ["note", "Internal note"],
            ["contact", "Contact attempt"],
            ["message", "Message student"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-9 rounded-lg px-3 text-sm ${tab === k ? "bg-primary text-primary-fg" : "hover:bg-surface-2"}`}>
            {l}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-3">
        {tab === "contact" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Channel" value={contact.channel} onChange={(ev) => setContact({ ...contact, channel: ev.target.value })}>
              {["phone", "email", "whatsapp", "sms", "in_person"].map((c) => (
                <option key={c} value={c}>
                  {c.replace("_", " ")}
                </option>
              ))}
            </SelectField>
            <SelectField label="Outcome" value={contact.outcome} onChange={(ev) => setContact({ ...contact, outcome: ev.target.value })}>
              {["reached", "no_answer", "left_message", "wrong_number", "other"].map((c) => (
                <option key={c} value={c}>
                  {c.replace("_", " ")}
                </option>
              ))}
            </SelectField>
          </div>
        )}
        <TextAreaField
          label={{ note: "Note (team only)", contact: "Notes (team only)", message: "Message (the student sees this and gets an email)" }[tab]}
          value={text}
          onChange={(ev) => setText(ev.target.value)}
          maxLength={2000}
          required={tab !== "contact"}
        />
        <Button type="submit" size="sm" disabled={tab !== "contact" && !text.trim()}>
          {{ note: "Add note", contact: "Record attempt", message: "Send message" }[tab]}
        </Button>
      </form>
    </Section>
  );
}

function DocumentsPanel({ e, act }: { e: AdminEnquiry; act: Act }) {
  const [names, setNames] = useState("");
  const [note, setNote] = useState("");
  const list = names.split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <Section
      title="Documents"
      action={
        e.documents.some((d) => d.status === "requested") ? (
          <Button size="sm" variant="secondary" onClick={() => void act(() => apiPost(`/admin/enquiries/${e.id}/documents/remind`), "Reminder sent.")}>
            Send reminder
          </Button>
        ) : undefined
      }
    >
      {e.documents.length > 0 && (
        <ul className="mb-3 divide-y divide-line text-sm">
          {e.documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {d.name}
                {d.note && <span className="block text-xs text-muted">{d.note}</span>}
                {d.files.map((f, i) => (
                  <a key={f.id} href={f.url} target="_blank" rel="noopener" className="mr-2 text-xs font-semibold text-accent-text underline">
                    File {i + 1}
                  </a>
                ))}
              </span>
              <select aria-label={`${d.name} status`} className={control} value={d.status} onChange={(ev) => void act(() => apiPatch(`/admin/enquiries/${e.id}/documents/${d.id}`, { status: ev.target.value }), "Document updated.")}>
                <option value="requested">Requested</option>
                <option value="received">Received</option>
                <option value="waived">Not needed</option>
              </select>
            </li>
          ))}
        </ul>
      )}
      <form
        className="space-y-2"
        onSubmit={async (ev) => {
          ev.preventDefault();
          if (await act(() => apiPost(`/admin/enquiries/${e.id}/documents`, { names: list, note: note.trim() }), "Documents requested; the student was emailed.")) {
            setNames("");
            setNote("");
          }
        }}
      >
        <TextField label="Request documents (comma separated)" placeholder="Class 12 marksheet, Aadhaar card" value={names} onChange={(ev) => setNames(ev.target.value)} />
        <TextField label="Note to the student (optional)" value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={300} />
        <Button type="submit" size="sm" disabled={!list.length}>
          Request
        </Button>
      </form>
    </Section>
  );
}

function ApplicationsPanel({ e, act }: { e: AdminEnquiry; act: Act }) {
  const { user } = useAuth();
  const canConfirm = user?.permissions.includes("admissions.confirm") ?? false;
  const courses = useApiData((signal) => apiGet<Course[]>("/courses", { signal }), []);
  const [form, setForm] = useState({ college: e.preferences.colleges[0]?.id ?? "", course: e.preferences.courses[0]?.id ?? "", applicationNumber: "", status: "planned" });
  const [confirming, setConfirming] = useState<AdminApplication | null>(null);
  const [evidence, setEvidence] = useState({ evidenceType: "offer_letter", evidenceReference: "", studentMessage: "" });
  return (
    <Section title="College applications">
      {e.applications.length > 0 && (
        <ul className="mb-4 divide-y divide-line text-sm">
          {e.applications.map((a) => (
            <li key={a.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-semibold">{a.collegeName}</span> · {a.courseName}
                  <span className="block text-xs text-muted">
                    {a.reference}
                    {a.applicationNumber && ` · college no. ${a.applicationNumber}`}
                  </span>
                </span>
                {a.status === "admitted" ? (
                  <Badge tone="success">Admission confirmed</Badge>
                ) : (
                  <select aria-label={`${a.reference} status`} className={control} value={a.status} onChange={(ev) => void act(() => apiPatch(`/admin/applications/${a.id}`, { status: ev.target.value }), "Application updated.")}>
                    {["planned", "submitted", "offer_received", "rejected", "withdrawn"].map((s) => (
                      <option key={s} value={s}>
                        {APPLICATION_LABELS[s]}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {a.evidence && (
                <p className="text-xs text-muted">
                  Evidence: {a.evidence.type.replace("_", " ")} – {a.evidence.reference} (verified {fmtDate(a.evidence.verifiedAt)})
                </p>
              )}
              {a.status === "offer_received" && canConfirm && confirming?.id !== a.id && (
                <Button size="sm" variant="gold" onClick={() => setConfirming(a)}>
                  Confirm admission…
                </Button>
              )}
              {confirming?.id === a.id && (
                <form
                  className="space-y-2 rounded-xl border border-accent/50 p-3"
                  onSubmit={async (ev) => {
                    ev.preventDefault();
                    if (await act(() => apiPost(`/admin/applications/${a.id}/confirm-admission`, evidence), "Admission confirmed.")) setConfirming(null);
                  }}
                >
                  <p className="text-sm font-semibold">Confirm admission with evidence</p>
                  <SelectField label="Evidence" value={evidence.evidenceType} onChange={(ev) => setEvidence({ ...evidence, evidenceType: ev.target.value })}>
                    <option value="offer_letter">Offer letter</option>
                    <option value="fee_receipt">Admission fee receipt</option>
                    <option value="college_portal">College portal confirmation</option>
                    <option value="other">Other</option>
                  </SelectField>
                  <TextField label="Evidence reference" required placeholder="e.g. offer letter no. / receipt no." value={evidence.evidenceReference} onChange={(ev) => setEvidence({ ...evidence, evidenceReference: ev.target.value })} />
                  <TextField label="Message to the student (optional)" value={evidence.studentMessage} onChange={(ev) => setEvidence({ ...evidence, studentMessage: ev.target.value })} />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" variant="gold" disabled={evidence.evidenceReference.trim().length < 3}>
                      Confirm admission
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (ev) => {
          ev.preventDefault();
          await act(() => apiPost(`/admin/enquiries/${e.id}/applications`, form), "Application recorded.");
        }}
      >
        <SelectField label="College" value={form.college} onChange={(ev) => setForm({ ...form, college: ev.target.value })} hint="From the student's preferred colleges">
          <option value="">Choose…</option>
          {e.preferences.colleges.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Course" value={form.course} onChange={(ev) => setForm({ ...form, course: ev.target.value })}>
          <option value="">Choose…</option>
          {courses.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <TextField label="College application no. (optional)" value={form.applicationNumber} onChange={(ev) => setForm({ ...form, applicationNumber: ev.target.value })} maxLength={60} />
        <SelectField label="Status" value={form.status} onChange={(ev) => setForm({ ...form, status: ev.target.value })}>
          <option value="planned">Planned</option>
          <option value="submitted">Submitted</option>
        </SelectField>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" disabled={!form.college || !form.course}>
            Record application
          </Button>
        </div>
      </form>
    </Section>
  );
}

function AppointmentsPanel({ e, act }: { e: AdminEnquiry; act: Act }) {
  const [form, setForm] = useState({ startsAt: "", durationMinutes: "30", mode: "phone", meetingDetails: "", agenda: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const active = (a: AdminAppointment) => ["scheduled", "confirmed", "reschedule_requested"].includes(a.status);
  return (
    <Section title="Counselling appointments">
      {e.appointments.length > 0 && (
        <ul className="mb-4 divide-y divide-line text-sm">
          {e.appointments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-semibold">{fmtDate(a.startsAt)}</span> · {MODE_LABELS[a.mode]} · {a.counsellor}
                {a.studentNote && <span className="block text-xs text-warning">Student: {a.studentNote}</span>}
                {a.outcomeNote && <span className="block text-xs text-muted">Notes: {a.outcomeNote}</span>}
              </span>
              <span className="flex items-center gap-1">
                <Badge tone={a.status === "reschedule_requested" ? "warning" : "neutral"}>{adminAppointmentLabel(a.status)}</Badge>
                {active(a) && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => void act(() => apiPost(`/admin/appointments/${a.id}/complete`, { note: window.prompt("Session notes (team only)") ?? "" }), "Marked completed.")}>
                      Done
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      const when = window.prompt("New time (India time), e.g. 2026-11-05T16:30", isoToIstInput(a.startsAt));
                      if (when) void act(() => apiPatch(`/admin/appointments/${a.id}`, { startsAt: istInputToIso(when) }), "Moved; the student was emailed.");
                    }}>
                      Move
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      const reason = window.prompt("Reason (shown to the student)");
                      if (reason !== null) void act(() => apiPost(`/admin/appointments/${a.id}/cancel`, { note: reason }), "Cancelled; the student was emailed.");
                    }}>
                      Cancel
                    </Button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid gap-3 sm:grid-cols-2"
        noValidate
        onSubmit={async (ev) => {
          ev.preventDefault();
          if (!form.startsAt) return setErrors({ startsAt: "Choose a date and time" });
          setErrors({});
          const ok = await act(() => apiPost(`/admin/enquiries/${e.id}/appointments`, { ...form, durationMinutes: Number(form.durationMinutes), startsAt: istInputToIso(form.startsAt) }), "Session booked; the student was emailed.");
          if (ok) setForm({ startsAt: "", durationMinutes: "30", mode: "phone", meetingDetails: "", agenda: "" });
        }}
      >
        <TextField label="Date and time (India time)" type="datetime-local" required value={form.startsAt} error={errors.startsAt} onChange={(ev) => setForm({ ...form, startsAt: ev.target.value })} />
        <SelectField label="Length" value={form.durationMinutes} onChange={(ev) => setForm({ ...form, durationMinutes: ev.target.value })}>
          {[15, 30, 45, 60, 90].map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </SelectField>
        <SelectField label="Mode" value={form.mode} onChange={(ev) => setForm({ ...form, mode: ev.target.value })}>
          {Object.entries(MODE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </SelectField>
        <TextField label="Meeting link or address" placeholder="https://… or office address" value={form.meetingDetails} onChange={(ev) => setForm({ ...form, meetingDetails: ev.target.value })} maxLength={500} />
        <div className="sm:col-span-2">
          <TextField label="Agenda (the student sees this)" value={form.agenda} onChange={(ev) => setForm({ ...form, agenda: ev.target.value })} maxLength={1000} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm">
            Book session
          </Button>
        </div>
      </form>
    </Section>
  );
}

const adminAppointmentLabel = (s: AdminAppointment["status"]) => (s === "scheduled" ? "Awaiting student" : APPOINTMENT_LABELS[s]);

const EVENT_LABELS: Record<string, string> = { created: "Enquiry received", status_change: "Status", note: "Internal note", contact_attempt: "Contact attempt", assignment: "Assignment", follow_up: "Follow-up", document: "Documents", application: "Application", appointment: "Appointment", message: "Message" };

export function AdminEnquiryView({ e, reload }: { e: AdminEnquiry; reload: () => void }) {
  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const act: Act = async (fn, ok) => {
    setFlash(null);
    try {
      await fn();
      if (ok) setFlash({ tone: "success", text: ok });
      reload();
      return true;
    } catch (err) {
      const fields = Object.values(fieldErrors(err));
      setFlash({ tone: "error", text: fields.length ? fields.join(" ") : errMsg(err) });
      if ((err as { code?: string }).code === "STATUS_CHANGED") reload();
      return false;
    }
  };
  const s = e.student;
  return (
    <div className="space-y-6">
      <p className="text-sm">
        <Link href="/admin/enquiries" className="text-muted hover:underline">
          ← All enquiries
        </Link>
      </p>
      <PageTitle title={`${e.reference} · ${s.name}`} subtitle={`Received ${fmtDate(e.createdAt)} · last activity ${fmtDate(e.lastActivityAt)}`} action={<StatusBadge status={e.status} admin />} />
      {flash && (
        <div aria-live="polite">
          <Alert tone={flash.tone}>{flash.text}</Alert>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-6">
          <Section title="Student">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Contact</dt>
                <dd>
                  {s.email}
                  {s.mobile && <span className="block">{s.mobile}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-muted">From</dt>
                <dd>{[s.city, s.state].filter(Boolean).join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Academics</dt>
                <dd>
                  {s.qualification ? QUALIFICATIONS[s.qualification] : "—"}
                  {s.percentage != null && ` · ${s.percentage}%`}
                  {s.passingYear && ` · ${s.passingYear}`}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Entrance exams</dt>
                <dd>{s.entranceExams.map((x) => `${x.name}${x.score ? ` (${x.score})` : ""}`).join(", ") || e.preferences.entranceExamNotes || "—"}</dd>
              </div>
            </dl>
          </Section>
          <Section title="What they want">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Courses</dt>
                <dd>
                  {e.preferences.courses.map((c) => c.name).join(", ")}
                  {e.preferences.specialization && ` · ${e.preferences.specialization}`}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Colleges</dt>
                <dd>{e.preferences.colleges.map((c) => c.name).join(", ") || "Open"}</dd>
              </div>
              <div>
                <dt className="text-muted">Locations</dt>
                <dd>{e.preferences.locations.map((l) => l.name).join(", ") || "Anywhere"}</dd>
              </div>
              <div>
                <dt className="text-muted">Budget</dt>
                <dd>{e.preferences.budgetMinor != null ? formatINR(e.preferences.budgetMinor) : "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Admission</dt>
                <dd>
                  {e.preferences.admissionYear}
                  {e.preferences.intake && ` · ${e.preferences.intake}`}
                  {e.preferences.hostel && " · hostel"}
                  {e.preferences.scholarship && " · scholarship"}
                </dd>
              </div>
            </dl>
            {e.preferences.counsellingRequest && <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm whitespace-pre-line">{e.preferences.counsellingRequest}</p>}
            {e.feeEstimates.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-muted">
                {e.feeEstimates.map((f) => (
                  <li key={`${f.college}-${f.course}`}>
                    Estimate given: {f.collegeName} · {f.courseName} ({f.academicYear}, fee v{f.version}) – official {formatINR(f.officialTotalMinor)} + service {formatINR(f.consultancyServiceChargeMinor)}
                    {f.isSample && " · sample data"}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <ApplicationsPanel e={e} act={act} />
          <AppointmentsPanel e={e} act={act} />
          <Section title="Timeline">
            <ol className="space-y-2 text-sm">
              {[...e.timeline].reverse().map((t) => (
                <li key={t.id} className={`rounded-xl border p-3 ${t.visibility === "internal" ? "border-dashed border-line bg-surface-2/60" : "border-line"}`}>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="font-semibold text-foreground">{t.actor}</span>
                    <span>{fmtDate(t.createdAt)}</span>
                    <span>· {EVENT_LABELS[t.type] ?? t.type}</span>
                    <Badge tone={t.visibility === "internal" ? "neutral" : "gold"}>{t.visibility === "internal" ? "Internal" : "Visible to student"}</Badge>
                  </p>
                  {t.toStatus && (
                    <p className="mt-1">
                      {t.fromStatus ? `${ADMIN_LABELS[t.fromStatus]} → ` : ""}
                      <strong>{ADMIN_LABELS[t.toStatus]}</strong>
                    </p>
                  )}
                  {t.reason && <p className="mt-1 text-muted">Reason: {t.reason}</p>}
                  {t.meta && "channel" in t.meta && (
                    <p className="mt-1 text-muted">
                      {String(t.meta.channel)} · {String(t.meta.outcome).replace("_", " ")}
                    </p>
                  )}
                  {t.body && <p className="mt-1 whitespace-pre-line">{t.body}</p>}
                </li>
              ))}
            </ol>
          </Section>
        </div>
        <div className="space-y-6">
          <StatusPanel e={e} act={act} />
          <AssignPanel key={`${e.assignedTo?.id}-${e.followUpAt}`} e={e} act={act} />
          <ActivityPanel e={e} act={act} />
          <DocumentsPanel e={e} act={act} />
          <RequestPaymentPanel enquiryId={e.id} suggestedMinor={e.feeEstimates[0]?.consultancyServiceChargeMinor ?? null} onDone={reload} />
        </div>
      </div>
    </div>
  );
}

export function AdminEnquiryDetail() {
  const { id } = useParams<{ id: string }>();
  const d = useApiData((signal) => apiGet<AdminEnquiry>(`/admin/enquiries/${id}`, { signal }), [id]);
  if (d.data) return <AdminEnquiryView e={d.data} reload={d.reload} />;
  return <LoadState status={d.status} error={d.error} reload={d.reload} rows={6} />;
}

// ---- Admissions and appointments ----

export function AdminApplications() {
  const [f, setF] = useState({ status: "", page: 1 });
  const list = useApiData(async (signal) => {
    const { data, meta } = await api<AdminApplication[]>("GET", `/admin/applications?page=${f.page}${f.status ? `&status=${f.status}` : ""}`, { signal });
    return { items: data, meta: meta as PageMeta };
  }, [f.status, f.page]);
  return (
    <div>
      <PageTitle title="Admissions" subtitle="College applications across all enquiries. “Admission confirmed” is only shown with verified evidence." />
      <select aria-label="Status" className={`${control} mb-4`} value={f.status} onChange={(e) => setF({ status: e.target.value, page: 1 })}>
        <option value="">All</option>
        {Object.entries(APPLICATION_LABELS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="No applications">Applications are recorded from an enquiry.</EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {list.data.items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {a.collegeName} · {a.courseName}
                  </span>
                  <span className="block text-muted">
                    {a.studentName} · {a.reference} ·{" "}
                    <Link href={`/admin/enquiries/${a.enquiry}`} className="underline">
                      {a.enquiryReference}
                    </Link>
                  </span>
                </span>
                <Badge tone={a.status === "admitted" ? "success" : a.status === "rejected" ? "danger" : "neutral"}>{APPLICATION_LABELS[a.status]}</Badge>
              </li>
            ))}
          </ul>
          <Pager meta={list.data.meta} onPage={(page) => setF({ ...f, page })} />
        </>
      )}
    </div>
  );
}

export function AdminAppointments() {
  const [f, setF] = useState({ counsellor: "me", upcoming: true, page: 1 });
  const [from] = useState(() => new Date(Date.now() - 3_600_000).toISOString());
  const list = useApiData(async (signal) => {
    const q = new URLSearchParams({ page: String(f.page), ...(f.counsellor && { counsellor: f.counsellor }), ...(f.upcoming && { from }) });
    const { data, meta } = await api<AdminAppointment[]>("GET", `/admin/appointments?${q}`, { signal });
    return { items: data, meta: meta as PageMeta };
  }, [f.counsellor, f.upcoming, f.page]);
  return (
    <div>
      <PageTitle title="Counselling appointments" subtitle="Sessions booked from enquiries. Times are India time." />
      <div className="mb-4 flex flex-wrap gap-3">
        <select aria-label="Counsellor" className={control} value={f.counsellor} onChange={(e) => setF({ ...f, counsellor: e.target.value, page: 1 })}>
          <option value="me">My sessions</option>
          <option value="">Everyone</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.upcoming} onChange={(e) => setF({ ...f, upcoming: e.target.checked, page: 1 })} /> Upcoming only
        </label>
      </div>
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="No sessions">Book sessions from an enquiry.</EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {list.data.items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{fmtDate(a.startsAt)}</span>
                  <span className="block text-muted">
                    {a.studentName} · {MODE_LABELS[a.mode]} · {a.durationMinutes} min · {a.counsellor} ·{" "}
                    <Link href={`/admin/enquiries/${a.enquiry}`} className="underline">
                      {a.enquiryReference}
                    </Link>
                  </span>
                  {a.studentNote && <span className="block text-xs text-warning">Student: {a.studentNote}</span>}
                </span>
                <Badge tone={a.status === "reschedule_requested" ? "warning" : a.status === "confirmed" ? "success" : "neutral"}>{adminAppointmentLabel(a.status)}</Badge>
              </li>
            ))}
          </ul>
          <Pager meta={list.data.meta} onPage={(page) => setF({ ...f, page })} />
        </>
      )}
    </div>
  );
}
