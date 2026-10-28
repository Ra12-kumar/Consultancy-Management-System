"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Alert, Card, ProgressSteps, Skeleton } from "@/components/ui/Feedback";
import { useAuth } from "@/features/auth/AuthProvider";
import { SampleBadge } from "@/features/catalog/CatalogUi";
import { useApiData } from "@/hooks/useApiData";
import { COLLEGE_TYPES, formatINR, rupeesToPaise } from "@/lib/format";
import { apiGet, apiPost } from "@/services/api";
import type { ApiError, Profile } from "@/types/api";
import type { CollegeCard, CollegeDetail, Course, Location } from "@/types/catalog";
import type { StudentEnquiry } from "@/types/enquiry";

export const STEPS = ["Your details", "Course & colleges", "Preferences", "Review"];
const QUALIFICATIONS: Record<string, string> = { class_10: "Class 10", class_12: "Class 12", diploma: "Diploma", undergraduate: "Undergraduate degree", postgraduate: "Postgraduate degree", other: "Other" };
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`);

type Draft = {
  courses: string[];
  specialization: string;
  locations: string[];
  colleges: Array<{ id: string; name: string; isSample: boolean }>;
  institutionTypes: string[];
  budget: string;
  hostel: boolean;
  scholarship: boolean;
  admissionYear: string;
  intake: string;
  entranceExamNotes: string;
  counsellingRequest: string;
};

// Client-side checks for each step (the server validates everything again).
export function validateStep(step: number, d: Draft): Record<string, string> {
  const e: Record<string, string> = {};
  if (step === 1 && d.courses.length === 0) e.courses = "Choose at least one course";
  if (step === 2) {
    const y = Number(d.admissionYear);
    const now = new Date().getFullYear();
    if (!(y >= now && y <= now + 3)) e.admissionYear = `Choose a year from ${now} to ${now + 3}`;
    if (d.budget.trim() && rupeesToPaise(d.budget) == null) e.budget = "Enter an amount in rupees";
  }
  return e;
}

// The API body: only the fields a student may send.
export function enquiryPayload(d: Draft, idempotencyKey: string) {
  return {
    idempotencyKey,
    courses: d.courses,
    specialization: d.specialization.trim(),
    locations: d.locations,
    colleges: d.colleges.map((c) => c.id),
    institutionTypes: d.institutionTypes,
    budgetMinor: d.budget.trim() ? rupeesToPaise(d.budget) : null,
    hostel: d.hostel,
    scholarship: d.scholarship,
    admissionYear: Number(d.admissionYear),
    intake: d.intake.trim(),
    entranceExamNotes: d.entranceExamNotes.trim(),
    counsellingRequest: d.counsellingRequest.trim(),
  };
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3 text-sm">
      <input type="checkbox" className="size-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function CollegePicker({ value, onChange }: { value: Draft["colleges"]; onChange: (v: Draft["colleges"]) => void }) {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const found = useApiData((signal) => (term.length >= 2 ? apiGet<CollegeCard[]>(`/colleges?q=${encodeURIComponent(term)}&limit=8`, { signal }) : Promise.resolve([])), [term]);
  return (
    <div className="space-y-2">
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(q.trim());
        }}
      >
        <input aria-label="Search colleges" placeholder="Search a college by name or city" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-11 flex-1 rounded-xl border border-line bg-surface px-3 text-sm" />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {found.data && found.data.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {found.data.map((c) => {
            const chosen = value.some((x) => x.id === c.id);
            return (
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  {c.name} <span className="text-muted">· {c.city}</span>
                </span>
                <Button size="sm" variant={chosen ? "primary" : "secondary"} disabled={!chosen && value.length >= 5} onClick={() => onChange(chosen ? value.filter((x) => x.id !== c.id) : [...value, { id: c.id, name: c.name, isSample: c.isSample }])}>
                  {chosen ? "✓ Added" : "Add"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {term && found.data?.length === 0 && <p className="text-sm text-muted">No published colleges match “{term}”.</p>}
      {value.length > 0 && (
        <ul aria-label="Chosen colleges" className="flex flex-wrap gap-2">
          {value.map((c) => (
            <li key={c.id} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pr-1 pl-3 text-xs">
              {c.name}
              <button type="button" aria-label={`Remove ${c.name}`} className="inline-flex size-6 items-center justify-center rounded-full hover:bg-foreground/10" onClick={() => onChange(value.filter((x) => x.id !== c.id))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">Optional, up to 5. We record each college’s currently published fee estimate with your enquiry.</p>
    </div>
  );
}

function Form({ profile, courses, locations, initial }: { profile: Profile; courses: Course[]; locations: Location[]; initial: Partial<Draft> }) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>({
    courses: [],
    specialization: "",
    locations: [],
    colleges: [],
    institutionTypes: [],
    budget: "",
    hostel: false,
    scholarship: false,
    admissionYear: String(new Date().getFullYear()),
    intake: "",
    entranceExamNotes: "",
    counsellingRequest: "",
    ...initial,
  });
  const [key] = useState(newKey);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<{ busy: boolean; error?: ApiError; done?: StudentEnquiry }>({ busy: false });
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const toggle = (list: string[], v: string, max: number) => (list.includes(v) ? list.filter((x) => x !== v) : list.length < max ? [...list, v] : list);

  function next() {
    const e = validateStep(step, d);
    setErrors(e);
    if (!Object.keys(e).length) setStep((s) => s + 1);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (state.busy) return;
    setState({ busy: true });
    try {
      const done = await apiPost<StudentEnquiry>("/enquiries", enquiryPayload(d, key));
      setState({ busy: false, done });
    } catch (err) {
      setState({ busy: false, error: err as ApiError });
    }
  }

  if (state.done) {
    const r = state.done;
    return (
      <Card>
        <p className="text-sm font-semibold text-success">Enquiry received</p>
        <h2 className="mt-1 text-2xl font-bold">
          Your reference: <span className="font-mono">{r.reference}</span>
        </h2>
        <p className="mt-2 text-sm text-muted">We have emailed you a copy. A counsellor will get in touch soon; you can follow every step in your dashboard.</p>
        {r.feeEstimates.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <caption className="pb-2 text-left text-muted">Fee estimates recorded with your enquiry (published fees at this time)</caption>
              <tbody>
                {r.feeEstimates.map((f) => (
                  <tr key={`${f.college}-${f.course}`} className="border-t border-line">
                    <th scope="row" className="py-2 pr-3 text-left font-normal">
                      {f.collegeName} · {f.courseName} ({f.academicYear}){f.isSample && <span className="ml-1 text-xs text-accent-text">sample</span>}
                    </th>
                    <td className="py-2 text-right tabular-nums">{formatINR(f.estimatedTotalMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <ButtonLink href={`/student/enquiries/${r.reference}`}>Track this enquiry</ButtonLink>
          <ButtonLink href="/colleges" variant="secondary">
            Keep exploring colleges
          </ButtonLink>
        </div>
      </Card>
    );
  }

  const courseName = (id: string) => courses.find((c) => c.id === id)?.name ?? "";
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? "";
  const a = profile.academic;
  return (
    <Card>
      <ProgressSteps steps={STEPS} current={step} />
      <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
        {step === 0 && (
          <section aria-labelledby="s0" className="space-y-4">
            <h2 id="s0" className="text-lg font-semibold">
              Your details
            </h2>
            <p className="text-sm text-muted">These come from your profile and are shared with our counsellors with this enquiry.</p>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {[
                ["Name", user?.name],
                ["Email", user?.email],
                ["Mobile", user?.mobile ?? "—"],
                ["City / State", [profile.personal.city, profile.personal.state].filter(Boolean).join(", ") || "—"],
                ["Highest qualification", a.highestQualification ? QUALIFICATIONS[a.highestQualification] : "—"],
                ["Marks", a.percentage != null ? `${a.percentage}%` : "—"],
                ["Passing year", a.passingYear ?? "—"],
                ["Entrance exams", a.entranceExams.map((x) => `${x.name}${x.score ? ` (${x.score})` : ""}`).join(", ") || "—"],
              ].map(([k, v]) => (
                <div key={String(k)} className="rounded-xl bg-surface-2 px-3 py-2">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {profile.completion < 100 && (
              <Alert tone="warning" title={`Your profile is ${profile.completion}% complete`}>
                A complete academic profile helps us suggest the right colleges.{" "}
                <Link href="/student/profile" className="font-semibold underline">
                  Complete my profile
                </Link>
              </Alert>
            )}
            <p className="text-sm">
              <Link href="/student/profile" className="font-semibold text-accent-text underline">
                Edit my profile
              </Link>
            </p>
          </section>
        )}

        {step === 1 && (
          <section aria-labelledby="s1" className="space-y-4">
            <h2 id="s1" className="text-lg font-semibold">
              Course and colleges
            </h2>
            <fieldset>
              <legend className="text-sm font-medium">
                Courses you are interested in <span className="text-danger">*</span> <span className="font-normal text-muted">(up to 3; the first is your main choice)</span>
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {courses.map((c) => {
                  const on = d.courses.includes(c.id);
                  return (
                    <button key={c.id} type="button" aria-pressed={on} onClick={() => set({ courses: toggle(d.courses, c.id, 3) })} className={`min-h-10 rounded-full border px-3 text-sm ${on ? "border-primary bg-primary text-primary-fg" : "border-line hover:bg-surface-2"}`}>
                      {on && `${d.courses.indexOf(c.id) + 1}. `}
                      {c.name}
                    </button>
                  );
                })}
              </div>
              {errors.courses && (
                <p role="alert" className="mt-1 text-xs font-medium text-danger">
                  {errors.courses}
                </p>
              )}
            </fieldset>
            <TextField label="Specialization (optional)" placeholder="e.g. Computer Science, Finance" value={d.specialization} onChange={(e) => set({ specialization: e.target.value })} maxLength={120} />
            <div>
              <p className="mb-2 text-sm font-medium">Preferred colleges</p>
              <CollegePicker value={d.colleges} onChange={(colleges) => set({ colleges })} />
            </div>
          </section>
        )}

        {step === 2 && (
          <section aria-labelledby="s2" className="space-y-4">
            <h2 id="s2" className="text-lg font-semibold">
              Preferences
            </h2>
            <fieldset>
              <legend className="text-sm font-medium">Preferred locations (up to 5)</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {locations
                  .filter((l) => l.kind !== "state")
                  .map((l) => {
                    const on = d.locations.includes(l.id);
                    return (
                      <button key={l.id} type="button" aria-pressed={on} onClick={() => set({ locations: toggle(d.locations, l.id, 5) })} className={`min-h-10 rounded-full border px-3 text-sm ${on ? "border-primary bg-primary text-primary-fg" : "border-line hover:bg-surface-2"}`}>
                        {l.name}
                      </button>
                    );
                  })}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-medium">College type</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(COLLEGE_TYPES).map(([v, label]) => (
                  <Toggle key={v} label={label} checked={d.institutionTypes.includes(v)} onChange={() => set({ institutionTypes: toggle(d.institutionTypes, v, 5) })} />
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField label="Approximate total budget (₹)" inputMode="decimal" placeholder="e.g. 600000" value={d.budget} onChange={(e) => set({ budget: e.target.value })} error={errors.budget} />
              <SelectField label="Admission year" required value={d.admissionYear} onChange={(e) => set({ admissionYear: e.target.value })} error={errors.admissionYear}>
                {[0, 1, 2, 3].map((n) => {
                  const y = new Date().getFullYear() + n;
                  return (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  );
                })}
              </SelectField>
              <TextField label="Intake" placeholder="e.g. July" value={d.intake} onChange={(e) => set({ intake: e.target.value })} maxLength={40} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Toggle label="I need hostel accommodation" checked={d.hostel} onChange={(hostel) => set({ hostel })} />
              <Toggle label="I am interested in scholarships" checked={d.scholarship} onChange={(scholarship) => set({ scholarship })} />
            </div>
            <TextField label="Entrance exams (taken or planned)" placeholder="e.g. JEE Main 2026 – 92 percentile" value={d.entranceExamNotes} onChange={(e) => set({ entranceExamNotes: e.target.value })} maxLength={500} />
            <TextAreaField label="Anything else for your counsellor?" placeholder="Questions, best time to call, special requirements…" value={d.counsellingRequest} onChange={(e) => set({ counsellingRequest: e.target.value })} maxLength={2000} />
          </section>
        )}

        {step === 3 && (
          <section aria-labelledby="s3" className="space-y-4">
            <h2 id="s3" className="text-lg font-semibold">
              Review and submit
            </h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Courses</dt>
                <dd>{d.courses.map(courseName).join(", ")}</dd>
              </div>
              <div>
                <dt className="text-muted">Colleges</dt>
                <dd className="space-y-1">
                  {d.colleges.length
                    ? d.colleges.map((c) => (
                        <span key={c.id} className="block">
                          {c.name} {c.isSample && <SampleBadge />}
                        </span>
                      ))
                    : "Open to suggestions"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Locations</dt>
                <dd>{d.locations.map(locationName).join(", ") || "Anywhere"}</dd>
              </div>
              <div>
                <dt className="text-muted">Budget</dt>
                <dd>{d.budget.trim() ? formatINR(rupeesToPaise(d.budget)) : "Not specified"}</dd>
              </div>
              <div>
                <dt className="text-muted">Admission</dt>
                <dd>
                  {d.admissionYear}
                  {d.intake && ` · ${d.intake}`}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Also</dt>
                <dd>{[d.hostel && "Hostel", d.scholarship && "Scholarships"].filter(Boolean).join(", ") || "—"}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted">By submitting, you agree that our counsellors may contact you about this enquiry. Fee figures are estimates from published college fees; official college fees and our service charge are always shown separately.</p>
            {state.error?.code === "DUPLICATE_ENQUIRY" ? (
              <Alert tone="warning" title="You already have an open enquiry for this course">
                <Link href={`/student/enquiries/${state.error.details?.[0]?.message ?? ""}`} className="font-semibold underline">
                  Open enquiry {state.error.details?.[0]?.message}
                </Link>{" "}
                and send your counsellor a message instead.
              </Alert>
            ) : (
              state.error && <Alert>{state.error.message}</Alert>
            )}
          </section>
        )}

        <div className="flex justify-between gap-2 border-t border-line pt-4">
          <Button variant="secondary" disabled={step === 0 || state.busy} onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            // Separate keys: reusing one <button> would turn the Continue click into a submit on the last step.
            <Button key="continue" onClick={next}>
              Continue
            </Button>
          ) : (
            <Button key="submit" type="submit" variant="gold" disabled={state.busy}>
              {state.busy ? "Submitting…" : "Submit enquiry"}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

// /enquire: signed-in, verified students only (the server checks this too).
export default function EnquiryForm() {
  const { status, user } = useAuth();
  const params = useSearchParams();
  const isStudent = user?.role === "student" && user.emailVerified;
  const data = useApiData(
    async (signal) => {
      if (!isStudent) return null;
      const [profile, courses, locations] = await Promise.all([apiGet<Profile>("/students/me/profile", { signal }), apiGet<Course[]>("/courses", { signal }), apiGet<Location[]>("/locations", { signal })]);
      const initial: Partial<Draft> = {};
      const course = courses.find((c) => c.slug === params.get("course"));
      if (course) initial.courses = [course.id];
      const slug = params.get("college");
      if (slug && /^[a-z0-9-]{2,80}$/.test(slug)) {
        const c = await apiGet<CollegeDetail>(`/colleges/${slug}`, { signal }).catch(() => null);
        if (c) initial.colleges = [{ id: c.id, name: c.name, isSample: c.isSample }];
      }
      return { profile, courses, locations, initial };
    },
    [isStudent],
  );

  let body;
  if (status === "loading") body = <Skeleton className="h-96" />;
  else if (status === "signedOut")
    body = (
      <Alert tone="info" title="Sign in to send an enquiry">
        Enquiries are linked to your student account so you can track them.{" "}
        <Link href="/login?next=%2Fenquire" className="font-semibold underline">
          Sign in
        </Link>{" "}
        or{" "}
        <Link href="/register" className="font-semibold underline">
          create a free account
        </Link>
        .
      </Alert>
    );
  else if (user?.role !== "student") body = <Alert tone="info">Enquiries are submitted by students. Use the admin area to manage them.</Alert>;
  else if (!user.emailVerified)
    body = (
      <Alert tone="warning" title="Please verify your email first">
        We need a working email address to send your reference number and updates. Use the link we emailed you, or{" "}
        <Link href="/student" className="font-semibold underline">
          send a new link from your dashboard
        </Link>
        .
      </Alert>
    );
  else if (!data.data) body = data.status === "error" ? <Alert>{data.error?.message}</Alert> : <Skeleton className="h-96" />;
  else body = <Form {...data.data} />;

  return (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold tracking-widest text-accent-text uppercase">Admissions</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Enquire for admission</h1>
      <p className="mt-2 mb-6 text-muted">Tell us what you want to study. You get a reference number straight away and can follow every step from your dashboard.</p>
      {body}
    </main>
  );
}
