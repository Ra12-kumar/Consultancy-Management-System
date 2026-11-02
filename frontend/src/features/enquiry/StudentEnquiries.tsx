"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Field";
import { Alert, Badge, Card, EmptyState } from "@/components/ui/Feedback";
import { LoadState, PageTitle, Pager, fmtDate } from "@/features/admin/shared";
import { useApiData } from "@/hooks/useApiData";
import { formatINR } from "@/lib/format";
import { api, apiGet, apiPost, apiUpload } from "@/services/api";
import type { PageMeta } from "@/types/api";
import type { EnquiryStatus, EnquirySummary, StudentAppointment, StudentApplication, StudentEnquiry, StudentEvent } from "@/types/enquiry";
import CallbackRequest from "./CallbackRequest";
import { APPLICATION_LABELS, APPOINTMENT_LABELS, FINISHED, MODE_LABELS, StatusBadge, StatusStepper, EligibilityBadge } from "./shared";

const errMsg = (e: unknown) => (e as { message?: string }).message ?? "Something went wrong";

// ---- My enquiries ----

export function MyEnquiries() {
  const list = useApiData((signal) => apiGet<EnquirySummary[]>("/enquiries", { signal }), []);
  return (
    <div>
      <PageTitle title="My enquiries" subtitle="Your admission enquiries and where each one stands." action={<ButtonLink href="/enquire" variant="gold" size="sm">New enquiry</ButtonLink>} />
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : list.data.length === 0 ? (
        <EmptyState title="No enquiries yet">
          <Link href="/enquire" className="font-semibold underline">
            Tell us what you want to study
          </Link>{" "}
          and a counsellor will get in touch.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {list.data.map((e) => (
            <li key={e.reference}>
              <Link href={`/student/enquiries/${e.reference}`} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-accent">
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-sm font-semibold">{e.reference}</span>
                  <span className="block text-sm">{e.courses.map((c) => c.name).join(", ")}</span>
                  {e.colleges.length > 0 && <span className="block text-xs text-muted">{e.colleges.map((c) => c.name).join(" · ")}</span>}
                </span>
                <StatusBadge status={e.status} />
                <span className="text-xs text-muted">Updated {fmtDate(e.lastActivityAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Appointment card with the student's actions ----

export function AppointmentCard({ a, onChanged }: { a: StudentAppointment; onChanged: () => void }) {
  const [mode, setMode] = useState<"reschedule" | "cancel" | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  async function act(action: "confirm" | "reschedule" | "cancel") {
    setState({ busy: true });
    try {
      await apiPost(`/appointments/${a.id}/${action}`, action === "confirm" ? {} : { note: note.trim() });
      setMode(null);
      setNote("");
      setState({ busy: false });
      onChanged();
    } catch (e) {
      setState({ busy: false, error: errMsg(e) });
    }
  }
  const active = ["scheduled", "confirmed", "reschedule_requested"].includes(a.status);
  return (
    <article className="rounded-2xl border border-line bg-surface p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold">{fmtDate(a.startsAt)} <span className="text-xs font-normal text-muted">(India time)</span></p>
          <p className="text-muted">
            {MODE_LABELS[a.mode]} · {a.durationMinutes} min · with {a.counsellor}
            {a.enquiryReference && (
              <>
                {" · "}
                <Link href={`/student/enquiries/${a.enquiryReference}`} className="underline">
                  {a.enquiryReference}
                </Link>
              </>
            )}
          </p>
        </div>
        <Badge tone={a.status === "scheduled" ? "gold" : a.status === "confirmed" || a.status === "completed" ? "success" : a.status === "cancelled" || a.status === "no_show" ? "neutral" : "warning"}>{APPOINTMENT_LABELS[a.status]}</Badge>
      </div>
      {a.meetingDetails && (
        <p className="mt-2 break-words">
          {/^https:\/\//.test(a.meetingDetails) ? (
            <a href={a.meetingDetails} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
              Join link
            </a>
          ) : (
            a.meetingDetails
          )}
        </p>
      )}
      {a.agenda && <p className="mt-1 text-muted">Agenda: {a.agenda}</p>}
      {a.studentNote && <p className="mt-1 text-muted">Your note: {a.studentNote}</p>}
      {state.error && (
        <div className="mt-2">
          <Alert>{state.error}</Alert>
        </div>
      )}
      {active && mode === null && (
        <div className="mt-3 flex flex-wrap gap-2">
          {a.status === "scheduled" && (
            <Button size="sm" disabled={state.busy} onClick={() => act("confirm")}>
              Confirm
            </Button>
          )}
          {a.status !== "reschedule_requested" && (
            <Button size="sm" variant="secondary" onClick={() => setMode("reschedule")}>
              Ask for another time
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setMode("cancel")}>
            Cancel
          </Button>
        </div>
      )}
      {mode && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void act(mode);
          }}
        >
          <TextAreaField label={mode === "reschedule" ? "Which times suit you?" : "Why are you cancelling?"} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} required />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={state.busy || !note.trim()}>
              {mode === "reschedule" ? "Send request" : "Cancel session"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
              Back
            </Button>
          </div>
        </form>
      )}
    </article>
  );
}

// ---- One enquiry ----

function Timeline({ events }: { events: StudentEvent[] }) {
  return (
    <ol className="space-y-3">
      {[...events].reverse().map((ev) => (
        <li key={ev.id} className={`rounded-xl border p-3 text-sm ${ev.type === "message" ? (ev.by === "You" ? "ml-6 border-line bg-surface-2" : "mr-6 border-accent/40 bg-accent/5") : "border-line"}`}>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="font-semibold text-foreground">{ev.by}</span>
            <span>{fmtDate(ev.createdAt)}</span>
            {ev.toStatus && <StatusBadge status={ev.toStatus} />}
          </p>
          {ev.body && <p className="mt-1 whitespace-pre-line">{ev.body}</p>}
          {ev.recommendations && ev.recommendations.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold">Courses your counsellor suggests</p>
              <ul className="mt-1 space-y-2">
                {ev.recommendations.map((r) => (
                  <li key={r.offeringId} className="rounded-lg bg-surface-2 p-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link href={`/colleges/${r.collegeSlug}`} className="font-semibold hover:underline">
                        {r.courseName} at {r.collegeName}
                      </Link>
                      <EligibilityBadge value={r.eligibility} />
                    </span>
                    <span className="block text-xs text-muted">{r.reasons.join(" · ")}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted">Eligibility is a guide from your marks and the college&apos;s criteria; it is not a guarantee of admission.</p>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

export function EnquiryView({ enquiry: e, reload }: { enquiry: StudentEnquiry; reload: () => void }) {
  const [message, setMessage] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const open = !FINISHED.includes(e.status);
  const history = e.timeline.map((t) => t.toStatus).filter((s): s is EnquiryStatus => Boolean(s));

  async function send(ev: FormEvent) {
    ev.preventDefault();
    setState({ busy: true });
    try {
      await apiPost(`/enquiries/${e.reference}/messages`, { body: message.trim() });
      setMessage("");
      setState({ busy: false });
      reload();
    } catch (err) {
      setState({ busy: false, error: errMsg(err) });
    }
  }
  async function withdraw(ev: FormEvent) {
    ev.preventDefault();
    setState({ busy: true });
    try {
      await apiPost(`/enquiries/${e.reference}/withdraw`, { reason: reason.trim() });
      setWithdrawing(false);
      setState({ busy: false });
      reload();
    } catch (err) {
      setState({ busy: false, error: errMsg(err) });
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm">
        <Link href="/student/enquiries" className="text-muted hover:underline">
          ← My enquiries
        </Link>
      </p>
      <PageTitle title={`Enquiry ${e.reference}`} subtitle={`Sent ${fmtDate(e.createdAt)}${e.counsellor ? ` · Your counsellor: ${e.counsellor}` : " · A counsellor will be assigned soon"}`} action={<StatusBadge status={e.status} />} />
      {state.error && <Alert>{state.error}</Alert>}
      <StatusStepper status={e.status} history={history} />
      {e.studentMessage && (
        <Alert tone="info" title={e.statusLabel}>
          {e.studentMessage}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          {e.documents.some((d) => d.status === "requested") && (
            <Card>
              <h2 className="font-semibold">Documents we need</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {e.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <span>
                      {d.name}
                      {d.note && <span className="block text-xs text-muted">{d.note}</span>}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      {d.files.length > 0 && <span className="text-xs text-muted">{d.files.length} file(s) uploaded</span>}
                      {d.status === "requested" && d.files.length < 5 && (
                        <label className="cursor-pointer rounded-lg border border-line px-2 py-1 text-xs font-semibold hover:bg-surface-2">
                          Upload
                          <input
                            type="file"
                            accept="application/pdf,image/jpeg,image/png"
                            className="sr-only"
                            aria-label={`Upload ${d.name}`}
                            onChange={async (ev) => {
                              const file = ev.target.files?.[0];
                              ev.target.value = "";
                              if (!file) return;
                              if (file.size > 5 * 1024 * 1024) return setState({ busy: false, error: "Files must be smaller than 5 MB" });
                              setState({ busy: true });
                              try {
                                await apiUpload("POST", `/enquiries/${e.reference}/documents/${d.id}/files`, file, file.name);
                                setState({ busy: false });
                                reload();
                              } catch (err) {
                                setState({ busy: false, error: errMsg(err) });
                              }
                            }}
                          />
                        </label>
                      )}
                      <Badge tone={d.status === "received" ? "success" : d.status === "waived" ? "neutral" : "warning"}>{{ requested: "Needed", received: "Received", waived: "Not needed" }[d.status]}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">Upload PDF, JPG or PNG files (up to 5 MB each). They are stored privately and only your counsellors can open them. Please don’t send documents by email.</p>
            </Card>
          )}
          {e.appointments.length > 0 && (
            <section aria-label="Counselling sessions" className="space-y-3">
              <h2 className="font-semibold">Counselling sessions</h2>
              {e.appointments.map((a) => (
                <AppointmentCard key={a.id} a={a} onChanged={reload} />
              ))}
            </section>
          )}
          <section aria-labelledby="conv" className="space-y-3">
            <h2 id="conv" className="font-semibold">
              Updates and messages
            </h2>
            {open && (
              <form onSubmit={send} className="space-y-2">
                <TextAreaField label="Message your counsellor" value={message} onChange={(ev) => setMessage(ev.target.value)} maxLength={2000} />
                <Button type="submit" size="sm" disabled={state.busy || !message.trim()}>
                  Send message
                </Button>
              </form>
            )}
            <Timeline events={e.timeline} />
          </section>
        </div>

        <aside className="space-y-4">
          <Card>
            <h2 className="font-semibold">What you asked for</h2>
            <dl className="mt-2 space-y-2 text-sm">
              <div>
                <dt className="text-muted">Courses</dt>
                <dd>{e.preferences.courses.map((c) => c.name).join(", ")}</dd>
              </div>
              {e.preferences.colleges.length > 0 && (
                <div>
                  <dt className="text-muted">Colleges</dt>
                  <dd>{e.preferences.colleges.map((c) => c.name).join(", ")}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted">Admission</dt>
                <dd>
                  {e.preferences.admissionYear}
                  {e.preferences.intake && ` · ${e.preferences.intake}`}
                </dd>
              </div>
            </dl>
          </Card>
          {e.feeEstimates.length > 0 && (
            <Card>
              <h2 className="font-semibold">Fee estimates when you enquired</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {e.feeEstimates.map((f) => (
                  <li key={`${f.college}-${f.course}`}>
                    <span className="block">{f.collegeName} · {f.courseName}</span>
                    <span className="block text-xs text-muted">
                      {f.academicYear}: official {formatINR(f.officialTotalMinor)} + service charge {formatINR(f.consultancyServiceChargeMinor)} = <strong>{formatINR(f.estimatedTotalMinor)}</strong>
                      {f.isSample && " (sample data)"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">We confirm current fees with the college before you pay anything.</p>
            </Card>
          )}
          {e.applications.length > 0 && (
            <Card>
              <h2 className="font-semibold">College applications</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {e.applications.map((a) => (
                  <li key={a.reference}>
                    <span className="block">{a.collegeName} · {a.courseName}</span>
                    <Badge tone={a.admissionConfirmed ? "success" : "neutral"}>{APPLICATION_LABELS[a.status]}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {open && (
            <Card>
              <h2 className="font-semibold">Talk to your counsellor</h2>
              {e.counsellor && <p className="mt-1 text-sm text-muted">Your counsellor: {e.counsellor}</p>}
              <div className="mt-3">
                <CallbackRequest reference={e.reference} current={e.callbackRequest} onDone={() => reload()} />
              </div>
            </Card>
          )}
          {open && (
            <Card>
              {!withdrawing ? (
                <Button size="sm" variant="ghost" onClick={() => setWithdrawing(true)}>
                  Withdraw this enquiry
                </Button>
              ) : (
                <form onSubmit={withdraw} className="space-y-2">
                  <TextAreaField label="Why are you withdrawing?" value={reason} onChange={(ev) => setReason(ev.target.value)} maxLength={500} required />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" variant="danger" disabled={state.busy || reason.trim().length < 3}>
                      Withdraw
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setWithdrawing(false)}>
                      Keep it
                    </Button>
                  </div>
                </form>
              )}
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

// /student/enquiries/[reference]: the reference is request-time data, so the page wraps this in <Suspense>.
export function EnquiryDetail() {
  const { reference } = useParams<{ reference: string }>();
  const d = useApiData((signal) => apiGet<StudentEnquiry>(`/enquiries/${encodeURIComponent(reference)}`, { signal }), [reference]);
  if (d.data) return <EnquiryView enquiry={d.data} reload={d.reload} />;
  if (d.status === "error" && d.error?.status === 404) {
    return (
      <Alert title="Enquiry not found">
        <Link href="/student/enquiries" className="font-semibold underline">
          Back to my enquiries
        </Link>
      </Alert>
    );
  }
  return <LoadState status={d.status} error={d.error} reload={d.reload} rows={5} />;
}

// ---- Applications, appointments and notifications ----

export function MyApplications() {
  const list = useApiData((signal) => apiGet<StudentApplication[]>("/admissions", { signal }), []);
  return (
    <div>
      <PageTitle title="My applications" subtitle="College applications your counsellor is handling for you. An admission shows as confirmed only once we have verified the college’s offer and your acceptance." />
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : list.data.length === 0 ? (
        <EmptyState title="No applications yet">Your counsellor records applications here once you decide where to apply.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {list.data.map((a) => (
            <li key={a.reference} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{a.collegeName}</span>
                <span className="block text-muted">
                  {a.courseName} · {a.reference}
                  {a.applicationNumber && ` · college no. ${a.applicationNumber}`}
                </span>
                {a.enquiryReference && (
                  <Link href={`/student/enquiries/${a.enquiryReference}`} className="text-xs underline">
                    Enquiry {a.enquiryReference}
                  </Link>
                )}
              </span>
              <Badge tone={a.admissionConfirmed ? "success" : a.status === "rejected" ? "danger" : "neutral"}>{APPLICATION_LABELS[a.status]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MyAppointments() {
  const list = useApiData((signal) => apiGet<StudentAppointment[]>("/appointments", { signal }), []);
  const [now] = useState(() => Date.now());
  const upcoming = list.data?.filter((a) => new Date(a.startsAt).getTime() >= now - 3_600_000 && ["scheduled", "confirmed", "reschedule_requested"].includes(a.status)).reverse() ?? [];
  const past = list.data?.filter((a) => !upcoming.includes(a)) ?? [];
  return (
    <div>
      <PageTitle title="My appointments" subtitle="Counselling sessions booked by your counsellor. Times are India time." />
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : list.data.length === 0 ? (
        <EmptyState title="No sessions yet">Your counsellor will book a session after reviewing your enquiry.</EmptyState>
      ) : (
        <div className="space-y-6">
          <section className="space-y-3" aria-label="Upcoming">
            <h2 className="font-semibold">Upcoming</h2>
            {upcoming.length ? upcoming.map((a) => <AppointmentCard key={a.id} a={a} onChanged={list.reload} />) : <p className="text-sm text-muted">Nothing booked.</p>}
          </section>
          {past.length > 0 && (
            <section className="space-y-3" aria-label="Past and cancelled">
              <h2 className="font-semibold">Past and cancelled</h2>
              {past.map((a) => (
                <AppointmentCard key={a.id} a={a} onChanged={list.reload} />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export function Notifications() {
  const [page, setPage] = useState(1);
  const list = useApiData(async (signal) => {
    const { data, meta } = await api<StudentEvent[]>("GET", `/students/me/updates?page=${page}`, { signal });
    return { items: data, meta: meta as PageMeta };
  }, [page]);
  return (
    <div>
      <PageTitle title="Notifications" subtitle="Every update on your enquiries, newest first. We also email you about important changes." />
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="Nothing yet">Updates appear here once you send an enquiry.</EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {list.data.items.map((ev) => (
              <li key={ev.id} className="p-4 text-sm">
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Link href={`/student/enquiries/${ev.reference}`} className="font-mono font-semibold text-foreground underline">
                    {ev.reference}
                  </Link>
                  <span>{fmtDate(ev.createdAt)}</span>
                  <span>· {ev.by}</span>
                  {ev.toStatus && <StatusBadge status={ev.toStatus} />}
                </p>
                {ev.body && <p className="mt-1">{ev.body}</p>}
              </li>
            ))}
          </ul>
          <Pager meta={list.data.meta} onPage={setPage} />
        </>
      )}
    </div>
  );
}
