"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Alert, Badge, Card, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { LoadState, PageTitle, Pager, fmtDate } from "@/features/admin/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { SampleBadge } from "@/features/catalog/CatalogUi";
import { useApiData } from "@/hooks/useApiData";
import { fmtDay, formatINR, rupeesToPaise } from "@/lib/format";
import { api, apiGet, apiPost } from "@/services/api";
import type { ApiError, PageMeta } from "@/types/api";
import type { Course } from "@/types/catalog";
import type { Benefit, EligibilityReport, EligibilityResult, Reason, Scholarship, ScholarshipApplication } from "@/types/scholarship";

export const PROVIDERS = { college: "College scholarship", consultancy: "Udaan offer", government: "Government scheme" } as const;
export const CATEGORY_LABELS: Record<string, string> = { general: "General", obc: "OBC", sc: "SC", st: "ST", ews: "EWS" };
const RESULT: Record<EligibilityResult, { label: string; tone: "success" | "danger" | "warning" }> = {
  likely_eligible: { label: "Likely eligible", tone: "success" },
  not_eligible: { label: "Not eligible", tone: "danger" },
  needs_review: { label: "Needs more details", tone: "warning" },
};
const APP_TONE: Record<string, "success" | "danger" | "warning" | "neutral" | "gold"> = { submitted: "gold", under_review: "neutral", documents_pending: "warning", approved: "success", rejected: "danger", withdrawn: "neutral" };

export function benefitText(b: Benefit) {
  if (b.description) return b.description;
  if (b.type === "tuition_percent") return `${b.value}% of tuition${b.maxMinor ? ` (up to ${formatINR(b.maxMinor)})` : ""}`;
  if (b.type === "service_charge_percent") return `${b.value}% off the Udaan service charge`;
  if (b.type === "fixed_amount") return `${formatINR(b.value)}`;
  return "See details";
}

export const ResultBadge = ({ result }: { result: EligibilityResult }) => <Badge tone={RESULT[result].tone}>{RESULT[result].label}</Badge>;

export function Reasons({ reasons }: { reasons: Reason[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {reasons.map((r) => (
        <li key={r.rule + r.message} className="flex gap-2">
          <span aria-hidden="true" className={r.ok === true ? "text-success" : r.ok === false ? "text-danger" : "text-warning"}>
            {r.ok === true ? "✓" : r.ok === false ? "✕" : "?"}
          </span>
          <span>
            <span className="sr-only">{r.ok === true ? "Met: " : r.ok === false ? "Not met: " : "Unknown: "}</span>
            {r.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Criteria({ s }: { s: Scholarship }) {
  const e = s.eligibility;
  const items = [
    e.courses.length > 0 && `Courses: ${e.courses.map((c) => c.name).join(", ")}`,
    e.minPercentage != null && `At least ${e.minPercentage}% in the qualifying exam`,
    e.maxFamilyIncomeMinor != null && `Family income up to ${formatINR(e.maxFamilyIncomeMinor)} a year`,
    e.states.length > 0 && `Students from ${e.states.map((x) => x.name).join(", ")}`,
    e.categories.length > 0 && `Categories: ${e.categories.map((c) => CATEGORY_LABELS[c]).join(", ")}`,
    e.genders.length > 0 && `For ${e.genders.join(", ")} students`,
  ].filter(Boolean) as string[];
  return items.length ? (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted">No specific criteria listed.</p>
  );
}

export function ScholarshipCard({ s, extra }: { s: Scholarship; extra?: ReactNode }) {
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="gold">{PROVIDERS[s.providerType]}</Badge>
        {!s.open && <Badge tone="neutral">Closed</Badge>}
      </div>
      <h3 className="mt-2 font-semibold">
        <Link href={`/scholarships/${s.slug}`} className="hover:underline">
          {s.name}
        </Link>
      </h3>
      {s.providerName && <p className="text-sm text-muted">{s.providerName}</p>}
      {s.isSample && (
        <div className="mt-2">
          <SampleBadge />
        </div>
      )}
      <p className="mt-3 text-sm">
        <span className="text-muted">Benefit: </span>
        <strong>{benefitText(s.benefit)}</strong>
      </p>
      {s.applicationDeadline && <p className="text-sm text-muted">Apply by {fmtDay(s.applicationDeadline)}</p>}
      {extra}
      <div className="mt-auto pt-4">
        <ButtonLink href={`/scholarships/${s.slug}`} size="sm" variant="secondary">
          Details and eligibility
        </ButtonLink>
      </div>
    </article>
  );
}

// ---- /scholarships ----

export function ScholarshipDirectory() {
  const [f, setF] = useState({ provider: "", course: "", open: "yes", page: 1 });
  const courses = useApiData((signal) => apiGet<Course[]>("/courses", { signal }), []);
  const qs = new URLSearchParams(Object.entries(f).filter(([k, v]) => v !== "" && !(k === "page" && v === 1)).map(([k, v]) => [k, String(v)]));
  const list = useApiData(async (signal) => {
    const { data, meta } = await api<Scholarship[]>("GET", `/scholarships?${qs}`, { signal });
    return { items: data, meta: meta as PageMeta };
  }, [qs.toString()]);
  const control = "min-h-11 rounded-xl border border-line bg-surface px-3 text-sm";
  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold tracking-widest text-accent-text uppercase">Scholarships</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Scholarships and fee support</h1>
      <p className="mt-2 max-w-2xl text-muted">College scholarships, our own offers and government schemes. Sign in as a student to check your preliminary eligibility; final decisions are made after review.</p>
      <div className="mt-6 mb-4 flex flex-wrap gap-2">
        <select aria-label="Type" className={control} value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value, page: 1 })}>
          <option value="">All types</option>
          {Object.entries(PROVIDERS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select aria-label="Course" className={control} value={f.course} onChange={(e) => setF({ ...f, course: e.target.value, page: 1 })}>
          <option value="">Any course</option>
          {courses.data?.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.open === "yes"} onChange={(e) => setF({ ...f, open: e.target.checked ? "yes" : "", page: 1 })} /> Open for applications
        </label>
        <ButtonLink href="/student/scholarships" size="sm" variant="gold" className="ml-auto">
          Check my eligibility
        </ButtonLink>
      </div>
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} rows={3} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="No scholarships match">Try another course or type.</EmptyState>
      ) : (
        <>
          {list.data.items.some((s) => s.isSample) && (
            <div className="mb-4">
              <Alert tone="warning" title="This list includes sample data">
                Scholarships marked as sample data are fictional examples. Do not rely on them.
              </Alert>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {list.data.items.map((s) => (
              <ScholarshipCard key={s.id} s={s} />
            ))}
          </div>
          <Pager meta={list.data.meta} onPage={(page) => setF({ ...f, page })} />
        </>
      )}
    </main>
  );
}

// ---- /scholarships/[slug]: details, preliminary check and application ----

function CheckAndApply({ s }: { s: Scholarship }) {
  const { status, user } = useAuth();
  const [form, setForm] = useState({ income: "", category: "", gender: "", course: "", statement: "" });
  const [report, setReport] = useState<EligibilityReport | null>(null);
  const [state, setState] = useState<{ busy: boolean; error?: ApiError; applied?: ScholarshipApplication }>({ busy: false });
  if (status === "loading") return <Skeleton className="h-40" />;
  if (status === "signedOut")
    return (
      <Alert tone="info" title="Check your eligibility">
        <Link href={`/login?next=${encodeURIComponent(`/scholarships/${s.slug}`)}`} className="font-semibold underline">
          Sign in as a student
        </Link>{" "}
        to see whether you are likely to qualify and to apply.
      </Alert>
    );
  if (user?.role !== "student") return null;

  const declared = () => {
    const p = new URLSearchParams();
    const income = form.income.trim() ? rupeesToPaise(form.income) : null;
    if (income != null) p.set("familyIncomeMinor", String(income));
    if (form.category) p.set("category", form.category);
    if (form.gender) p.set("gender", form.gender);
    if (form.course) p.set("course", form.course);
    return p;
  };
  async function check(e: FormEvent) {
    e.preventDefault();
    setState({ busy: true });
    try {
      setReport(await apiGet<EligibilityReport>(`/scholarships/${s.slug}/eligibility?${declared()}`));
      setState({ busy: false });
    } catch (err) {
      setState({ busy: false, error: err as ApiError });
    }
  }
  async function apply() {
    setState({ busy: true });
    const d = Object.fromEntries(declared());
    try {
      const applied = await apiPost<ScholarshipApplication>("/scholarship-applications", {
        scholarship: s.id,
        statement: form.statement.trim(),
        ...(d.familyIncomeMinor && { familyIncomeMinor: Number(d.familyIncomeMinor) }),
        ...(d.category && { category: d.category }),
        ...(d.gender && { gender: d.gender }),
        ...(d.course && { course: d.course }),
      });
      setState({ busy: false, applied });
    } catch (err) {
      setState({ busy: false, error: err as ApiError });
    }
  }
  if (state.applied)
    return (
      <Alert tone="success" title={`Application ${state.applied.reference} submitted`}>
        Our team will review it and email you the decision.{" "}
        <Link href="/student/scholarships" className="font-semibold underline">
          Track it in My scholarships
        </Link>
      </Alert>
    );
  const result = report?.results[0];
  return (
    <Card>
      <h2 className="font-semibold">Check your eligibility</h2>
      <p className="mt-1 text-sm text-muted">We use your profile (marks and state). Add the details below for a fuller check; they are used only for this check and your application.</p>
      <form onSubmit={check} className="mt-4 grid gap-3 sm:grid-cols-2">
        {s.eligibility.courses.length > 0 && (
          <SelectField label="Your course" value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })}>
            <option value="">From my enquiries</option>
            {s.eligibility.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        )}
        {s.eligibility.maxFamilyIncomeMinor != null && <TextField label="Annual family income (₹)" inputMode="decimal" value={form.income} onChange={(e) => setForm({ ...form, income: e.target.value })} />}
        {s.eligibility.categories.length > 0 && (
          <SelectField label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">Prefer not to say</option>
            {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </SelectField>
        )}
        {s.eligibility.genders.length > 0 && (
          <SelectField label="Gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option value="">Prefer not to say</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </SelectField>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" variant="secondary" disabled={state.busy}>
            Check eligibility
          </Button>
        </div>
      </form>
      {result && (
        <div className="mt-4 space-y-3 rounded-xl border border-line p-4" aria-live="polite">
          <p className="flex items-center gap-2 font-semibold">
            <ResultBadge result={result.result} /> <span className="text-xs font-normal text-muted">Preliminary – not a decision</span>
          </p>
          <Reasons reasons={result.reasons} />
          {result.result !== "not_eligible" && s.open && (
            <div className="space-y-2">
              <TextAreaField label="Why should you get this scholarship? (optional)" value={form.statement} onChange={(e) => setForm({ ...form, statement: e.target.value })} maxLength={2000} />
              {!user.emailVerified ? (
                <Alert tone="warning">Verify your email address before applying.</Alert>
              ) : (
                <Button variant="gold" disabled={state.busy} onClick={apply}>
                  {state.busy ? "Submitting…" : "Apply for this scholarship"}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {state.error && (
        <div className="mt-3">
          <Alert>
            {state.error.message}
            {state.error.details?.length ? (
              <ul className="mt-1 list-disc pl-5">
                {state.error.details.map((d) => (
                  <li key={d.field + d.message}>{d.message}</li>
                ))}
              </ul>
            ) : null}
          </Alert>
        </div>
      )}
    </Card>
  );
}

export function ScholarshipDetail() {
  const { slug } = useParams<{ slug: string }>();
  const d = useApiData((signal) => apiGet<Scholarship>(`/scholarships/${encodeURIComponent(slug)}`, { signal }), [slug]);
  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <p className="text-sm">
        <Link href="/scholarships" className="text-muted hover:underline">
          ← All scholarships
        </Link>
      </p>
      {!d.data ? (
        d.status === "error" && d.error?.status === 404 ? (
          <div className="mt-4">
            <Alert title="Scholarship not found" />
          </div>
        ) : (
          <div className="mt-4">
            <LoadState status={d.status} error={d.error} reload={d.reload} rows={4} />
          </div>
        )
      ) : (
        <div className="mt-4 space-y-6">
          <header>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="gold">{PROVIDERS[d.data.providerType]}</Badge>
              {!d.data.open && <Badge>Closed</Badge>}
              {d.data.isSample && <SampleBadge />}
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{d.data.name}</h1>
            <p className="mt-1 text-muted">
              {d.data.college?.slug ? (
                <Link href={`/colleges/${d.data.college.slug}`} className="underline">
                  {d.data.providerName}
                </Link>
              ) : (
                d.data.providerName
              )}
              {d.data.academicYear && ` · ${d.data.academicYear}`}
            </p>
          </header>
          <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
            <div className="space-y-6">
              <Card>
                <h2 className="font-semibold">Benefit</h2>
                <p className="mt-1 text-lg font-bold">{benefitText(d.data.benefit)}</p>
                {d.data.description && <p className="mt-3 text-sm whitespace-pre-line">{d.data.description}</p>}
              </Card>
              <CheckAndApply s={d.data} />
            </div>
            <aside className="space-y-4">
              <Card>
                <h2 className="font-semibold">Who can apply</h2>
                <div className="mt-2">
                  <Criteria s={d.data} />
                </div>
                {d.data.eligibility.notes && <p className="mt-2 text-sm text-muted">{d.data.eligibility.notes}</p>}
              </Card>
              {d.data.documentsRequired.length > 0 && (
                <Card>
                  <h2 className="font-semibold">Documents usually needed</h2>
                  <ul className="mt-2 list-disc pl-5 text-sm">
                    {d.data.documentsRequired.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </Card>
              )}
              <Card>
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-muted">Apply by</dt>
                    <dd>{d.data.applicationDeadline ? fmtDay(d.data.applicationDeadline) : "No fixed deadline"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Details verified</dt>
                    <dd>{d.data.isSample ? "Sample – not verified" : fmtDay(d.data.lastVerifiedAt)}</dd>
                  </div>
                  {d.data.officialUrl && (
                    <div>
                      <dt className="text-muted">Official page</dt>
                      <dd>
                        <a href={d.data.officialUrl} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline">
                          {d.data.officialUrl}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
              </Card>
            </aside>
          </div>
        </div>
      )}
    </main>
  );
}

// ---- /student/scholarships ----

export function MyScholarships() {
  const apps = useApiData((signal) => apiGet<ScholarshipApplication[]>("/scholarship-applications", { signal }), []);
  const report = useApiData((signal) => apiGet<EligibilityReport>("/scholarships/eligibility", { signal }), []);
  const [withdrawError, setWithdrawError] = useState("");
  const likely = report.data?.results.filter((r) => r.result !== "not_eligible" && r.scholarship.open) ?? [];
  return (
    <div className="space-y-8">
      <PageTitle title="My scholarships" subtitle="Your applications, and scholarships you may qualify for. Eligibility shown here is preliminary." />
      <section aria-labelledby="apps" className="space-y-3">
        <h2 id="apps" className="font-semibold">
          My applications
        </h2>
        {withdrawError && <Alert>{withdrawError}</Alert>}
        {!apps.data ? (
          <LoadState status={apps.status} error={apps.error} reload={apps.reload} rows={2} />
        ) : apps.data.length === 0 ? (
          <EmptyState title="No applications yet">Check the scholarships below and apply from their page.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {apps.data.map((a) => (
              <li key={a.reference} className="rounded-2xl border border-line bg-surface p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="block font-semibold">{a.scholarshipName}</span>
                    <span className="font-mono text-xs text-muted">
                      {a.reference} · applied {fmtDate(a.createdAt)}
                    </span>
                  </span>
                  <Badge tone={APP_TONE[a.status]}>{a.statusLabel}</Badge>
                </div>
                {a.decision && (
                  <p className="mt-2">
                    {a.decision.awardMinor != null && <strong>Award: {formatINR(a.decision.awardMinor)}. </strong>}
                    {a.decision.note}
                  </p>
                )}
                {a.history.filter((h) => h.note).length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-muted">
                    {a.history
                      .filter((h) => h.note)
                      .map((h) => (
                        <li key={h.at + h.status}>
                          {fmtDate(h.at)} · {h.statusLabel}: {h.note}
                        </li>
                      ))}
                  </ul>
                )}
                {["submitted", "under_review", "documents_pending"].includes(a.status) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    onClick={async () => {
                      if (!window.confirm("Withdraw this application?")) return;
                      setWithdrawError("");
                      try {
                        await apiPost(`/scholarship-applications/${a.reference}/withdraw`);
                        apps.reload();
                      } catch (e) {
                        setWithdrawError((e as ApiError).message);
                      }
                    }}
                  >
                    Withdraw
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="matches" className="space-y-3">
        <h2 id="matches" className="font-semibold">
          Scholarships you may qualify for
        </h2>
        {report.data && (
          <p className="text-sm text-muted">
            Based on your profile ({report.data.facts.percentage != null ? `${report.data.facts.percentage}%` : "no marks yet"}
            {report.data.facts.state ? `, ${report.data.facts.state}` : ""}). Open a scholarship to add income or category details.{" "}
            <Link href="/student/profile" className="underline">
              Update my profile
            </Link>
          </p>
        )}
        {!report.data ? (
          <LoadState status={report.status} error={report.error} reload={report.reload} rows={2} />
        ) : likely.length === 0 ? (
          <EmptyState title="No open matches right now">
            <Link href="/scholarships" className="underline">
              Browse all scholarships
            </Link>
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {likely.map((r) => (
              <ScholarshipCard
                key={r.scholarship.id}
                s={r.scholarship}
                extra={
                  <div className="mt-3 space-y-2">
                    <ResultBadge result={r.result} />
                    <Reasons reasons={r.reasons} />
                  </div>
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
