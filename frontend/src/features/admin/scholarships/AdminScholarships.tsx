"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Alert, Badge, Card, EmptyState } from "@/components/ui/Feedback";
import { LoadState, PageTitle, Pager, fmtDate } from "@/features/admin/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { SampleBadge } from "@/features/catalog/CatalogUi";
import { CATEGORY_LABELS, PROVIDERS, Reasons, ResultBadge, benefitText } from "@/features/scholarships/Scholarships";
import { useApiData } from "@/hooks/useApiData";
import { formatINR, paiseToRupees, rupeesToPaise, slugify } from "@/lib/format";
import { api, apiGet, apiPatch, apiPost, fieldErrors } from "@/services/api";
import type { PageMeta } from "@/types/api";
import type { AdminCollege, Course, Location } from "@/types/catalog";
import type { AdminScholarship, AdminScholarshipApplication } from "@/types/scholarship";

const STATUS_TONE = { draft: "gold", published: "success", archived: "neutral" } as const;
const control = "min-h-11 rounded-xl border border-line bg-surface px-3 text-sm";
const errMsg = (e: unknown) => (e as { message?: string }).message ?? "Something went wrong";

type Form = {
  name: string;
  slug: string;
  providerType: AdminScholarship["providerType"];
  providerName: string;
  college: string;
  description: string;
  benefitType: AdminScholarship["benefit"]["type"];
  benefitValue: string;
  benefitMax: string;
  benefitDescription: string;
  courses: string[];
  minPercentage: string;
  maxIncome: string;
  states: string[];
  categories: string[];
  genders: string[];
  notes: string;
  documents: string;
  academicYear: string;
  deadline: string;
  officialUrl: string;
  sourceRef: string;
  lastVerifiedAt: string;
};

const fromScholarship = (s?: AdminScholarship): Form => ({
  name: s?.name ?? "",
  slug: s?.slug ?? "",
  providerType: s?.providerType ?? "college",
  providerName: s?.providerName ?? "",
  college: s?.college ?? "",
  description: s?.description ?? "",
  benefitType: s?.benefit.type ?? "tuition_percent",
  benefitValue: s?.benefit.value == null ? "" : s.benefit.type === "fixed_amount" ? paiseToRupees(s.benefit.value) : String(s.benefit.value),
  benefitMax: paiseToRupees(s?.benefit.maxMinor),
  benefitDescription: s?.benefit.description ?? "",
  courses: s?.eligibility.courses ?? [],
  minPercentage: s?.eligibility.minPercentage == null ? "" : String(s.eligibility.minPercentage),
  maxIncome: paiseToRupees(s?.eligibility.maxFamilyIncomeMinor),
  states: s?.eligibility.states ?? [],
  categories: s?.eligibility.categories ?? [],
  genders: s?.eligibility.genders ?? [],
  notes: s?.eligibility.notes ?? "",
  documents: (s?.documentsRequired ?? []).join(", "),
  academicYear: s?.academicYear ?? "",
  deadline: s?.applicationDeadline?.slice(0, 10) ?? "",
  officialUrl: s?.officialUrl ?? "",
  sourceRef: s?.sourceRef ?? "",
  lastVerifiedAt: s?.lastVerifiedAt?.slice(0, 10) ?? "",
});

// Rupees in the form, paise in the API.
export function scholarshipPayload(f: Form) {
  const money = (v: string) => (v.trim() ? rupeesToPaise(v) : null);
  return {
    name: f.name.trim(),
    slug: f.slug,
    providerType: f.providerType,
    providerName: f.providerName.trim(),
    college: f.providerType === "college" && f.college ? f.college : null,
    description: f.description.trim(),
    benefit: {
      type: f.benefitType,
      value: f.benefitValue.trim() === "" ? null : f.benefitType === "fixed_amount" ? money(f.benefitValue) : Number(f.benefitValue),
      maxMinor: f.benefitType === "tuition_percent" ? money(f.benefitMax) : null,
      description: f.benefitDescription.trim(),
    },
    eligibility: {
      courses: f.courses,
      minPercentage: f.minPercentage.trim() === "" ? null : Number(f.minPercentage),
      maxFamilyIncomeMinor: money(f.maxIncome),
      states: f.states,
      categories: f.categories,
      genders: f.genders,
      notes: f.notes.trim(),
    },
    documentsRequired: f.documents.split(",").map((d) => d.trim()).filter(Boolean),
    academicYear: f.academicYear.trim(),
    applicationDeadline: f.deadline || null,
    officialUrl: f.officialUrl.trim(),
    sourceRef: f.sourceRef.trim(),
    lastVerifiedAt: f.lastVerifiedAt || null,
  };
}

function Chips({ label, options, value, onChange }: { label: string; options: Array<[string, string]>; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map(([v, l]) => {
          const on = value.includes(v);
          return (
            <button key={v} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== v) : [...value, v])} className={`min-h-9 rounded-full border px-3 text-sm ${on ? "border-primary bg-primary text-primary-fg" : "border-line hover:bg-surface-2"}`}>
              {l}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-muted">None selected means no restriction.</p>
    </fieldset>
  );
}

function ScholarshipForm({ initial, onSaved }: { initial?: AdminScholarship; onSaved: (s: AdminScholarship) => void }) {
  const [f, setF] = useState(() => fromScholarship(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<{ busy: boolean; tone?: "error" | "success"; message?: string }>({ busy: false });
  const refs = useApiData(async (signal) => {
    const [courses, locations, colleges] = await Promise.all([apiGet<Course[]>("/courses", { signal }), apiGet<Location[]>("/locations", { signal }), api<AdminCollege[]>("GET", "/admin/colleges?limit=50", { signal }).then((r) => r.data).catch(() => [] as AdminCollege[])]);
    return { courses, states: locations.filter((l) => l.kind === "state"), colleges };
  }, []);
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setState({ busy: true });
    setErrors({});
    try {
      const body = scholarshipPayload(f);
      const saved = initial ? await apiPatch<AdminScholarship>(`/admin/scholarships/${initial.id}`, body) : await apiPost<AdminScholarship>("/admin/scholarships", body);
      setState({ busy: false, tone: "success", message: "Saved." });
      onSaved(saved);
    } catch (err) {
      setErrors(fieldErrors(err));
      setState({ busy: false, tone: "error", message: errMsg(err) });
    }
  }
  const percent = f.benefitType === "tuition_percent" || f.benefitType === "service_charge_percent";
  return (
    <form onSubmit={save} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" required value={f.name} error={errors.name} maxLength={160} onChange={(e) => set({ name: e.target.value, ...(!initial && { slug: slugify(e.target.value) }) })} />
        <TextField label="Web address (slug)" required value={f.slug} error={errors.slug} onChange={(e) => set({ slug: slugify(e.target.value) })} hint={`/scholarships/${f.slug || "…"}`} />
        <SelectField label="Type" value={f.providerType} onChange={(e) => set({ providerType: e.target.value as Form["providerType"] })}>
          {Object.entries(PROVIDERS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </SelectField>
        {f.providerType === "college" ? (
          <SelectField label="College" value={f.college} error={errors.college} onChange={(e) => set({ college: e.target.value })}>
            <option value="">Choose a college</option>
            {refs.data?.colleges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <TextField label="Provider" placeholder={f.providerType === "government" ? "e.g. Ministry / state department" : "EduPath Consultancy"} value={f.providerName} onChange={(e) => set({ providerName: e.target.value })} />
        )}
      </div>
      <TextAreaField label="Description" value={f.description} onChange={(e) => set({ description: e.target.value })} maxLength={4000} />
      <fieldset className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Benefit</legend>
        <SelectField label="Kind" value={f.benefitType} onChange={(e) => set({ benefitType: e.target.value as Form["benefitType"] })}>
          <option value="tuition_percent">% of tuition</option>
          <option value="fixed_amount">Fixed amount</option>
          <option value="service_charge_percent">% off our service charge</option>
          <option value="other">Other (describe)</option>
        </SelectField>
        {f.benefitType !== "other" && <TextField label={percent ? "Percentage" : "Amount (₹)"} inputMode="decimal" value={f.benefitValue} error={errors["benefit.value"]} onChange={(e) => set({ benefitValue: e.target.value })} />}
        {f.benefitType === "tuition_percent" && <TextField label="Maximum (₹, optional)" inputMode="decimal" value={f.benefitMax} onChange={(e) => set({ benefitMax: e.target.value })} />}
        <TextField label="How to describe it to students" value={f.benefitDescription} onChange={(e) => set({ benefitDescription: e.target.value })} maxLength={300} />
      </fieldset>
      <fieldset className="space-y-4 rounded-xl border border-line p-4">
        <legend className="px-1 text-sm font-semibold">Eligibility rules (drive the preliminary check)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Minimum percentage" inputMode="decimal" value={f.minPercentage} error={errors["eligibility.minPercentage"]} onChange={(e) => set({ minPercentage: e.target.value })} />
          <TextField label="Maximum annual family income (₹)" inputMode="decimal" value={f.maxIncome} onChange={(e) => set({ maxIncome: e.target.value })} />
        </div>
        {refs.data && <Chips label="Courses" options={refs.data.courses.map((c) => [c.id, c.name])} value={f.courses} onChange={(courses) => set({ courses })} />}
        {refs.data && <Chips label="States" options={refs.data.states.map((s) => [s.id, s.name])} value={f.states} onChange={(states) => set({ states })} />}
        <Chips label="Categories" options={Object.entries(CATEGORY_LABELS)} value={f.categories} onChange={(categories) => set({ categories })} />
        <Chips label="Gender" options={[["female", "Female"], ["male", "Male"], ["other", "Other"]]} value={f.genders} onChange={(genders) => set({ genders })} />
        <TextField label="Other criteria (shown as text)" value={f.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={1000} />
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Documents needed (comma separated)" value={f.documents} onChange={(e) => set({ documents: e.target.value })} />
        <TextField label="Academic year" placeholder="2026-27" value={f.academicYear} error={errors.academicYear} onChange={(e) => set({ academicYear: e.target.value })} />
        <TextField label="Application deadline" type="date" value={f.deadline} onChange={(e) => set({ deadline: e.target.value })} />
        <TextField label="Official page (https://)" value={f.officialUrl} error={errors.officialUrl} hint={f.providerType === "government" ? "Required to publish a government scheme" : undefined} onChange={(e) => set({ officialUrl: e.target.value })} />
        <TextField label="Source reference" value={f.sourceRef} onChange={(e) => set({ sourceRef: e.target.value })} maxLength={500} />
        <TextField label="Details verified on" type="date" value={f.lastVerifiedAt} error={errors.lastVerifiedAt} hint="Required to publish" onChange={(e) => set({ lastVerifiedAt: e.target.value })} />
      </div>
      {state.message && <Alert tone={state.tone ?? "info"}>{state.message}</Alert>}
      <Button type="submit" disabled={state.busy || f.name.trim().length < 3 || f.slug.length < 2}>
        {initial ? "Save changes" : "Create draft"}
      </Button>
    </form>
  );
}

export function AdminScholarshipList() {
  const router = useRouter();
  const [f, setF] = useState({ q: "", status: "", page: 1 });
  const [creating, setCreating] = useState(false);
  const list = useApiData(async (signal) => {
    const qs = new URLSearchParams({ page: String(f.page), ...(f.q && { q: f.q }), ...(f.status && { status: f.status }) });
    const { data, meta } = await api<AdminScholarship[]>("GET", `/admin/scholarships?${qs}`, { signal });
    return { items: data, meta: meta as PageMeta };
  }, [f.q, f.status, f.page]);
  return (
    <div>
      <PageTitle title="Scholarships" subtitle="College scholarships, EduPath offers and government schemes. Rules drive students' preliminary eligibility; awards are decided on each application." action={!creating ? <Button onClick={() => setCreating(true)}>Add scholarship</Button> : undefined} />
      {creating && (
        <Card className="mb-6">
          <ScholarshipForm onSaved={(s) => router.push(`/admin/scholarships/${s.id}`)} />
        </Card>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        <input type="search" aria-label="Search scholarships" placeholder="Search by name" className={`${control} flex-1`} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} />
        <select aria-label="Status" className={control} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="No scholarships yet">Add one to get started.</EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {list.data.items.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <span className="min-w-0 flex-1">
                  <Link href={`/admin/scholarships/${s.id}`} className="font-semibold hover:underline">
                    {s.name}
                  </Link>
                  <span className="block text-muted">
                    {PROVIDERS[s.providerType]} · {benefitText(s.benefit)} · {s.applications ?? 0} application(s)
                  </span>
                  {s.isSample && <SampleBadge />}
                </span>
                <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
              </li>
            ))}
          </ul>
          <Pager meta={list.data.meta} onPage={(page) => setF({ ...f, page })} />
        </>
      )}
    </div>
  );
}

export function AdminScholarshipEditor() {
  const { id } = useParams<{ id: string }>();
  const d = useApiData((signal) => apiGet<AdminScholarship>(`/admin/scholarships/${id}`, { signal }), [id]);
  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  if (!d.data) return <LoadState status={d.status} error={d.error} reload={d.reload} rows={5} />;
  const s = d.data;
  async function status(action: "publish" | "archive" | "restore") {
    setFlash(null);
    try {
      await apiPost(`/admin/scholarships/${s.id}/${action}`);
      setFlash({ tone: "success", text: { publish: "Published.", archive: "Archived.", restore: "Back to draft." }[action] });
      d.reload();
    } catch (e) {
      const fields = Object.values(fieldErrors(e));
      setFlash({ tone: "error", text: fields.length ? `${errMsg(e)}: ${fields.join("; ")}` : errMsg(e) });
    }
  }
  return (
    <div>
      <p className="text-sm">
        <Link href="/admin/scholarships" className="text-muted hover:underline">
          ← All scholarships
        </Link>
      </p>
      <PageTitle
        title={s.name}
        subtitle={PROVIDERS[s.providerType]}
        action={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
            {s.status !== "published" && (
              <Button size="sm" variant="gold" onClick={() => status("publish")}>
                Publish
              </Button>
            )}
            {s.status !== "archived" ? (
              <Button size="sm" variant="ghost" onClick={() => status("archive")}>
                Archive
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => status("restore")}>
                Restore
              </Button>
            )}
          </span>
        }
      />
      {s.isSample && (
        <div className="mb-4">
          <Alert tone="warning" title="Sample data – fictional">
            Removed with <code>npm run seed:remove-samples</code>.
          </Alert>
        </div>
      )}
      {flash && (
        <div className="mb-4">
          <Alert tone={flash.tone}>{flash.text}</Alert>
        </div>
      )}
      <Card>
        <ScholarshipForm key={s.updatedAt} initial={s} onSaved={() => d.reload()} />
      </Card>
    </div>
  );
}

// ---- Applications ----

function ApplicationPanel({ a, onDone }: { a: AdminScholarshipApplication; onDone: () => void }) {
  const { user } = useAuth();
  const canDecide = user?.permissions.includes("scholarships.approve") ?? false;
  const [note, setNote] = useState("");
  const [internal, setInternal] = useState(a.internalNote);
  const [award, setAward] = useState("");
  const [error, setError] = useState("");
  const open = ["submitted", "under_review", "documents_pending"].includes(a.status);
  async function run(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      setNote("");
      onDone();
    } catch (e) {
      const fields = Object.values(fieldErrors(e));
      setError(fields.length ? fields.join(" ") : errMsg(e));
    }
  }
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-line p-4">
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-muted">Student</p>
          <p>
            {a.student.name} · {a.student.email}
            <span className="block text-xs text-muted">
              {a.student.percentage != null ? `${a.student.percentage}%` : "no marks"}
              {a.student.state && ` · ${a.student.state}`}
              {a.declared.familyIncomeMinor != null && ` · income ${formatINR(a.declared.familyIncomeMinor)}`}
              {a.declared.category && ` · ${CATEGORY_LABELS[a.declared.category]}`}
              {a.declared.gender && ` · ${a.declared.gender}`}
            </span>
          </p>
          {a.enquiry && (
            <Link href={`/admin/enquiries/${a.enquiry}`} className="text-xs underline">
              Related enquiry
            </Link>
          )}
        </div>
        <div>
          <p className="flex items-center gap-2 text-muted">
            Preliminary check <ResultBadge result={a.preliminary.result} />
          </p>
          <Reasons reasons={a.preliminary.reasons} />
        </div>
      </div>
      {a.statement && <p className="rounded-xl bg-surface-2 p-3 text-sm whitespace-pre-line">{a.statement}</p>}
      {error && <Alert>{error}</Alert>}
      {open && (
        <div className="space-y-2">
          <TextAreaField label="Note to the student" value={note} onChange={(e) => setNote(e.target.value)} hint="Included in the email; required for a decision" maxLength={1000} />
          <TextAreaField label="Internal note (team only)" value={internal} onChange={(e) => setInternal(e.target.value)} maxLength={2000} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => run(() => apiPost(`/admin/scholarship-applications/${a.id}/review`, { status: "under_review", note: note.trim(), internalNote: internal }))}>
              Mark under review
            </Button>
            <Button size="sm" variant="secondary" onClick={() => run(() => apiPost(`/admin/scholarship-applications/${a.id}/review`, { status: "documents_pending", note: note.trim(), internalNote: internal }))}>
              Ask for documents
            </Button>
          </div>
          {canDecide ? (
            <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
              <TextField label="Award (₹, optional)" inputMode="decimal" value={award} onChange={(e) => setAward(e.target.value)} />
              <Button size="sm" variant="gold" disabled={note.trim().length < 3} onClick={() => run(() => apiPost(`/admin/scholarship-applications/${a.id}/decision`, { decision: "approved", note: note.trim(), awardMinor: award.trim() ? rupeesToPaise(award) : null }))}>
                Approve
              </Button>
              <Button size="sm" variant="danger" disabled={note.trim().length < 3} onClick={() => run(() => apiPost(`/admin/scholarship-applications/${a.id}/decision`, { decision: "rejected", note: note.trim(), awardMinor: null }))}>
                Reject
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted">Approving or rejecting needs the “Approve scholarships” permission.</p>
          )}
        </div>
      )}
      {a.decision && (
        <p className="text-sm">
          Decision: <strong>{a.statusLabel}</strong>
          {a.decision.awardMinor != null && ` · ${formatINR(a.decision.awardMinor)}`} – {a.decision.note}
        </p>
      )}
      <ol className="space-y-1 text-xs text-muted">
        {a.history.map((h) => (
          <li key={h.at + h.status}>
            {fmtDate(h.at)} · {h.statusLabel}
            {h.note && `: ${h.note}`}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AdminScholarshipApplications() {
  const [f, setF] = useState({ q: "", status: "", page: 1 });
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useApiData(async (signal) => {
    const qs = new URLSearchParams({ page: String(f.page), ...(f.q && { q: f.q }), ...(f.status && { status: f.status }) });
    const { data, meta } = await api<AdminScholarshipApplication[]>("GET", `/admin/scholarship-applications?${qs}`, { signal });
    return { items: data, meta: meta as PageMeta };
  }, [f.q, f.status, f.page]);
  return (
    <div>
      <PageTitle title="Scholarship applications" subtitle="Review applications, ask for documents and record decisions. The preliminary check is a guide, never a decision." />
      <div className="mb-4 flex flex-wrap gap-2">
        <input type="search" aria-label="Search applications" placeholder="Reference, student or scholarship" className={`${control} flex-1`} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} />
        <select aria-label="Status" className={control} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}>
          <option value="">All statuses</option>
          {["submitted", "under_review", "documents_pending", "approved", "rejected", "withdrawn"].map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="No applications">Students apply from a scholarship’s page.</EmptyState>
      ) : (
        <>
          <ul className="space-y-3">
            {list.data.items.map((a) => (
              <li key={a.id} className="rounded-2xl border border-line bg-surface p-4">
                <button type="button" aria-expanded={openId === a.id} onClick={() => setOpenId(openId === a.id ? null : a.id)} className="flex w-full flex-wrap items-center gap-3 text-left text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{a.scholarshipName}</span>
                    <span className="block text-muted">
                      <span className="font-mono">{a.reference}</span> · {a.student.name} · {fmtDate(a.createdAt)}
                    </span>
                  </span>
                  <ResultBadge result={a.preliminary.result} />
                  <Badge>{a.statusLabel}</Badge>
                </button>
                {openId === a.id && <ApplicationPanel a={a} onDone={list.reload} />}
              </li>
            ))}
          </ul>
          <Pager meta={list.data.meta} onPage={(page) => setF({ ...f, page })} />
        </>
      )}
    </div>
  );
}
