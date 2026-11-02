"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Alert, Badge, Card, EmptyState } from "@/components/ui/Feedback";
import { LoadState, PageTitle, Pager, fmtDate } from "@/features/admin/shared";
import PhoneActions from "@/features/admin/enquiries/PhoneActions";
import { ADMIN_LABELS, CALLBACK_TIME_LABELS, EligibilityBadge, StatusBadge, isoToIstInput, istInputToIso, reasonRequired } from "@/features/enquiry/shared";
import { useApiData } from "@/hooks/useApiData";
import { formatINR } from "@/lib/format";
import { api, apiGet, apiPatch, apiPost, fieldErrors } from "@/services/api";
import type { PageMeta } from "@/types/api";
import type { AdminEnquiryRow, CounsellorEnquiry, EnquiryStatus } from "@/types/enquiry";

type Act = (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;
const errMsg = (e: unknown) => (e as { message?: string }).message ?? "Something went wrong";
const QUALIFICATIONS: Record<string, string> = { class_10: "Class 10", class_12: "Class 12", diploma: "Diploma", undergraduate: "UG degree", postgraduate: "PG degree", other: "Other" };
const QUICK: Array<[string, string]> = [
  ["", "All assigned"],
  ["today", "Today’s calls"],
  ["overdue", "Overdue follow-ups"],
  ["new", "New"],
  ["callback", "Callback requests"],
];
const EVENT_LABELS: Record<string, string> = { created: "Enquiry received", status_change: "Status", note: "Note", contact_attempt: "Contact attempt", assignment: "Assignment", follow_up: "Follow-up", message: "Message", recommendation: "Recommended courses", callback_request: "Callback request", document: "Documents", application: "Application", appointment: "Session" };

// ---- List: only the enquiries assigned to me ----

export function CounsellorEnquiryList() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const quick = params.get("quick") ?? "";
  const [q, setQ] = useState(params.get("q") ?? "");
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ sort: quick === "today" || quick === "overdue" ? "follow_up" : "activity", page: String(page), ...(quick && { quick }), ...(params.get("q") && { q: params.get("q")! }) });
  const list = useApiData(async (signal) => {
    const { data, meta } = await api<AdminEnquiryRow[]>("GET", `/counsellor/enquiries?${qs}`, { signal });
    return { items: data, meta: meta as PageMeta };
  }, [qs.toString()]);
  const go = (next: Record<string, string>) => {
    const p = new URLSearchParams({ ...(quick && { quick }), ...(params.get("q") && { q: params.get("q")! }), ...next });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    setPage(1);
    router.replace(`${pathname}${p.size ? `?${p}` : ""}`, { scroll: false });
  };
  return (
    <div className="space-y-4">
      <PageTitle title="My enquiries" subtitle="Only the enquiries assigned to you. Call, record the outcome and set the next follow-up." />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick filters">
        {QUICK.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={quick === k} onClick={() => go({ quick: k })} className={`min-h-10 rounded-full px-4 text-sm ring-1 ring-line ${quick === k ? "bg-primary text-primary-fg" : "bg-surface hover:bg-surface-2"}`}>
            {l}
          </button>
        ))}
      </div>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: q.trim() });
        }}
        className="flex gap-2"
      >
        <input type="search" aria-label="Search my enquiries" placeholder="Reference, name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-11 flex-1 rounded-xl border border-line bg-surface px-3 text-sm" />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="Nothing here">{quick ? "No enquiries match this filter." : "No enquiries are assigned to you yet."}</EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {list.data.items.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <div className="min-w-0 flex-1">
                  <Link href={`/counsellor/enquiries/${e.id}`} className="font-semibold hover:underline">
                    {e.studentName}
                  </Link>{" "}
                  <span className="font-mono text-xs text-muted">{e.reference}</span>
                  <p className="text-muted">
                    {e.courses.join(", ")}
                    {e.colleges.length > 0 && ` · ${e.colleges.join(", ")}`}
                    {e.place && ` · ${e.place}`}
                  </p>
                  <div className="mt-1">
                    <PhoneActions mobile={e.studentMobile} compact />
                  </div>
                </div>
                <div className="text-right">
                  <StatusBadge status={e.status} admin />
                  {e.followUpAt && <p className={`mt-1 text-xs ${e.followUpDue ? "font-semibold text-danger" : "text-muted"}`}>Follow up {fmtDate(e.followUpAt)}</p>}
                  {e.callbackRequested && (
                    <p className="mt-1">
                      <Badge tone="warning">Callback requested</Badge>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Pager meta={list.data.meta} onPage={setPage} />
        </>
      )}
    </div>
  );
}

// ---- Detail ----

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

function StatusPanel({ e, act }: { e: CounsellorEnquiry; act: Act }) {
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
    if (await act(() => apiPost(`/counsellor/enquiries/${e.id}/status`, { fromStatus: e.status, toStatus: to, reason: reason.trim(), studentMessage: message.trim() }), "Status updated.")) {
      setTo("");
      setReason("");
      setMessage("");
    }
  }
  return (
    <Section title="Counselling status">
      <p className="mb-3 flex items-center gap-2 text-sm">
        Now: <StatusBadge status={e.status} admin />
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
            <TextAreaField label={`Internal reason${needsReason ? "" : " (optional)"}`} value={reason} onChange={(ev) => setReason(ev.target.value)} error={error} hint="Only the team sees this" maxLength={1000} />
            <TextAreaField label="Message to the student (optional)" value={message} onChange={(ev) => setMessage(ev.target.value)} hint="Shown to the student and emailed" maxLength={1000} />
            <Button type="submit" size="sm">
              Update status
            </Button>
          </>
        )}
      </form>
      <p className="mt-3 text-xs text-muted">Admission is confirmed by an administrator from a college application with evidence.</p>
    </Section>
  );
}

function FollowUpPanel({ e, act }: { e: CounsellorEnquiry; act: Act }) {
  const [when, setWhen] = useState(e.followUpAt ? isoToIstInput(e.followUpAt) : "");
  return (
    <Section title="Next follow-up">
      <div className="flex items-end gap-2">
        <TextField label="Follow up on (India time)" type="datetime-local" value={when} onChange={(ev) => setWhen(ev.target.value)} />
        <Button size="sm" variant="secondary" onClick={() => void act(() => apiPatch(`/counsellor/enquiries/${e.id}`, { followUpAt: when ? istInputToIso(when) : null }), "Follow-up saved.")}>
          Save
        </Button>
      </div>
    </Section>
  );
}

function ActivityPanel({ e, act }: { e: CounsellorEnquiry; act: Act }) {
  const [tab, setTab] = useState<"contact" | "note" | "message">("contact");
  const [text, setText] = useState("");
  const [contact, setContact] = useState({ channel: "phone", outcome: "reached" });
  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const fn = {
      contact: () => apiPost(`/counsellor/enquiries/${e.id}/contact-attempts`, { ...contact, note: text.trim() }),
      note: () => apiPost(`/counsellor/enquiries/${e.id}/notes`, { body: text.trim() }),
      message: () => apiPost(`/counsellor/enquiries/${e.id}/messages`, { body: text.trim() }),
    }[tab];
    if (await act(fn, { contact: "Call outcome recorded.", note: "Note added.", message: "Message sent to the student." }[tab])) setText("");
  }
  return (
    <Section title="Record your work">
      <div role="tablist" className="mb-3 flex flex-wrap gap-1">
        {(
          [
            ["contact", "Call outcome"],
            ["note", "Counselling note"],
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
              {["phone", "whatsapp", "email", "sms", "in_person"].map((c) => (
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
        <TextAreaField label={{ contact: "Notes (team only)", note: "Note (team only)", message: "Message (the student sees this and gets an email)" }[tab]} value={text} onChange={(ev) => setText(ev.target.value)} maxLength={2000} />
        <Button type="submit" size="sm" disabled={tab !== "contact" && !text.trim()}>
          {{ contact: "Record outcome", note: "Add note", message: "Send message" }[tab]}
        </Button>
      </form>
    </Section>
  );
}

function EligibilityPanel({ e, act }: { e: CounsellorEnquiry; act: Act }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 10 ? p : [...p, id]));
  return (
    <Section title="Eligibility and recommendations">
      <p className="mb-3 text-xs text-muted">From the student&apos;s marks and each college&apos;s stated criteria. A guide only: it never guarantees admission.</p>
      {e.eligibility.length === 0 ? (
        <p className="text-sm text-muted">No active courses match the colleges or courses this student chose.</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {e.eligibility.map((r) => (
            <li key={r.offeringId} className="flex gap-3 py-2">
              <input type="checkbox" className="mt-1" aria-label={`Recommend ${r.courseName} at ${r.collegeName}`} checked={picked.includes(r.offeringId)} onChange={() => toggle(r.offeringId)} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {r.courseName}
                    {r.specialization && ` · ${r.specialization}`}
                  </span>
                  <EligibilityBadge value={r.eligibility} />
                </p>
                <p className="text-muted">
                  <Link href={`/colleges/${r.collegeSlug}`} target="_blank" className="hover:underline">
                    {r.collegeName}
                  </Link>
                  {r.place && ` · ${r.place}`}
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs text-muted">
                  {r.reasons.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}
      {e.eligibility.length > 0 && (
        <div className="mt-3 space-y-2">
          <TextAreaField label="Note to the student (optional)" value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={1000} />
          <Button
            size="sm"
            disabled={!picked.length}
            onClick={async () => {
              if (await act(() => apiPost(`/counsellor/enquiries/${e.id}/recommendations`, { offerings: picked, note: note.trim() }), "Recommendations shared with the student.")) {
                setPicked([]);
                setNote("");
              }
            }}
          >
            Recommend {picked.length ? `${picked.length} course${picked.length > 1 ? "s" : ""}` : "selected courses"}
          </Button>
        </div>
      )}
    </Section>
  );
}

export function CounsellorEnquiryView({ e, reload }: { e: CounsellorEnquiry; reload: () => void }) {
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
  const a = e.academics;
  const mark = (v: number | null) => (v == null ? "—" : `${v}%`);
  return (
    <div className="space-y-6">
      <p className="text-sm">
        <Link href="/counsellor/enquiries" className="text-muted hover:underline">
          ← My enquiries
        </Link>
      </p>
      <PageTitle title={`${s.name} · ${e.reference}`} subtitle={`Received ${fmtDate(e.createdAt)} · last contact ${e.lastContactAt ? fmtDate(e.lastContactAt) : "not yet"}`} action={<StatusBadge status={e.status} admin />} />
      {e.callbackRequest && !e.callbackRequest.handledAt && (
        <Alert tone="warning" title={e.callbackRequest.kind === "callback" ? "The student asked for a phone call" : "The student asked for a counselling session"}>
          {CALLBACK_TIME_LABELS[e.callbackRequest.slot]}. {e.callbackRequest.note} Record a call outcome to mark it handled.
        </Alert>
      )}
      {flash && (
        <div aria-live="polite">
          <Alert tone={flash.tone}>{flash.text}</Alert>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-6">
          <Section title="Student">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Contact</dt>
                <dd>
                  {s.email}
                  <span className="mt-1 block">
                    <PhoneActions mobile={s.mobile} />
                  </span>
                  <span className="mt-1 block text-xs text-muted">Best time to call: {CALLBACK_TIME_LABELS[e.callbackTime]}</span>
                </dd>
              </div>
              <div>
                <dt className="text-muted">From</dt>
                <dd>{[s.city, s.state].filter(Boolean).join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Highest qualification</dt>
                <dd>
                  {a.highestQualification ? QUALIFICATIONS[a.highestQualification] : "—"}
                  {a.percentage != null && ` · ${a.percentage}%`}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Marks</dt>
                <dd>
                  Class 10: {mark(a.marks.class10)} · Class 12: {mark(a.marks.class12)}
                  {a.stream && ` (${a.stream})`} · Graduation: {mark(a.marks.graduation)}
                  {a.graduationDegree && ` (${a.graduationDegree})`}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted">Entrance exams</dt>
                <dd>{a.exams.map((x) => `${x.name}${x.score ? ` (${x.score})` : ""}${x.year ? ` ${x.year}` : ""}`).join(", ") || e.preferences.entranceExamNotes || "—"}</dd>
              </div>
            </dl>
          </Section>
          <Section title="What they want">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Courses</dt>
                <dd>{e.preferences.courses.map((c) => c.name).join(", ")}</dd>
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
            </dl>
            {e.preferences.counsellingRequest && (
              <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
                <p className="text-xs font-semibold text-muted">Additional requirements</p>
                <p className="whitespace-pre-line">{e.preferences.counsellingRequest}</p>
              </div>
            )}
          </Section>
          <EligibilityPanel e={e} act={act} />
          <Section title="History">
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
                  {t.type === "recommendation" && Array.isArray(t.meta?.items) && (
                    <ul className="mt-1 list-disc pl-5">
                      {(t.meta.items as Array<{ offeringId: string; courseName: string; collegeName: string }>).map((r) => (
                        <li key={r.offeringId}>
                          {r.courseName} at {r.collegeName}
                        </li>
                      ))}
                    </ul>
                  )}
                  {t.body && <p className="mt-1 whitespace-pre-line">{t.body}</p>}
                </li>
              ))}
            </ol>
          </Section>
        </div>
        <div className="space-y-6">
          <StatusPanel e={e} act={act} />
          <FollowUpPanel key={e.followUpAt ?? "none"} e={e} act={act} />
          <ActivityPanel e={e} act={act} />
        </div>
      </div>
    </div>
  );
}

export function CounsellorEnquiryDetail() {
  const { id } = useParams<{ id: string }>();
  const d = useApiData((signal) => apiGet<CounsellorEnquiry>(`/counsellor/enquiries/${id}`, { signal }), [id]);
  if (d.data) return <CounsellorEnquiryView e={d.data} reload={d.reload} />;
  return <LoadState status={d.status} error={d.error} reload={d.reload} rows={6} />;
}
