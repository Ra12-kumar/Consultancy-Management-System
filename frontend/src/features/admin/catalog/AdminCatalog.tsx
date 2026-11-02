"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Alert, Badge, Card, EmptyState } from "@/components/ui/Feedback";
import { useAuth } from "@/features/auth/AuthProvider";
import { SampleBadge } from "@/features/catalog/CatalogUi";
import { LoadState, PageTitle, Pager, fmtDate } from "@/features/admin/shared";
import { useApiData } from "@/hooks/useApiData";
import { CATEGORIES, COLLEGE_TYPES, COURSE_LEVELS, OWNERSHIP, durationLabel, formatLakh, slugify } from "@/lib/format";
import { api, apiGet, apiPatch, apiPost, apiDelete, fieldErrors } from "@/services/api";
import type { PageMeta } from "@/types/api";
import type { Accreditation, AdminCollege, AdminOffering, Course, Location } from "@/types/catalog";
import CollegeGallery from "./CollegeGallery";
import MediaUpload from "./MediaUpload";
import { OfferingFees } from "./FeeEditor";

const STATUS_TONE = { draft: "gold", published: "success", archived: "neutral", needs_review: "warning" } as const;
// Students see only Active (published) colleges.
export const STATUS_LABEL = { draft: "Draft", published: "Active", archived: "Inactive", needs_review: "Needs review" } as const;
export const MODE_LABEL = { offline: "Offline (on campus)", online: "Online", hybrid: "Hybrid" } as const;
const QUALIFICATION_LABEL: Record<string, string> = { class_10: "Class 10", class_12: "Class 12", diploma: "Diploma", undergraduate: "Undergraduate degree", postgraduate: "Postgraduate degree", other: "Other" };
const SOCIAL: Array<["instagram" | "facebook" | "youtube" | "linkedin" | "x", string]> = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["youtube", "YouTube"],
  ["linkedin", "LinkedIn"],
  ["x", "X (Twitter)"],
];
const errMsg = (e: unknown) => (e as { message?: string }).message ?? "Something went wrong";

function usePermission(p: string) {
  return useAuth().user?.permissions.includes(p) ?? false;
}

// ---- Colleges list ----

export function AdminColleges() {
  const router = useRouter();
  const canEdit = usePermission("catalog.manage");
  const [filters, setFilters] = useState({ q: "", status: "", sample: "", page: 1 });
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== "" && v !== 1).map(([k, v]) => [k, String(v)]));
  const list = useApiData(async (signal) => {
    const { data, meta } = await api<AdminCollege[]>("GET", `/admin/colleges?${qs}`, { signal });
    return { items: data, meta: meta as PageMeta };
  }, [qs.toString()]);
  const [create, setCreate] = useState({ open: false, name: "", slug: "", type: "private", slugTouched: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const c = await apiPost<AdminCollege>("/admin/colleges", { name: create.name.trim(), slug: create.slug, type: create.type });
      router.push(`/admin/colleges/${c.id}`);
    } catch (err) {
      setErrors({ ...fieldErrors(err), form: errMsg(err) });
      setBusy(false);
    }
  }

  return (
    <div>
      <PageTitle
        title="Colleges"
        subtitle="Create colleges as drafts, add their courses and fees, and publish when the details are verified."
        action={
          canEdit ? (
            <span className="flex flex-wrap gap-2">
              <ButtonLink href="/admin/colleges/featured" variant="secondary">
                Featured colleges
              </ButtonLink>
              {!create.open && <Button onClick={() => setCreate({ ...create, open: true })}>Add college</Button>}
            </span>
          ) : undefined
        }
      />
      {create.open && (
        <Card className="mb-6">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3" noValidate>
            <TextField label="College name" required value={create.name} maxLength={160} error={errors.name} onChange={(e) => setCreate({ ...create, name: e.target.value, slug: create.slugTouched ? create.slug : slugify(e.target.value) })} />
            <TextField label="Web address (slug)" required value={create.slug} error={errors.slug} hint={`/colleges/${create.slug || "…"}`} onChange={(e) => setCreate({ ...create, slug: slugify(e.target.value), slugTouched: true })} />
            <SelectField label="Type" value={create.type} onChange={(e) => setCreate({ ...create, type: e.target.value })}>
              {Object.entries(COLLEGE_TYPES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </SelectField>
            {errors.form && (
              <div className="sm:col-span-3">
                <Alert>{errors.form}</Alert>
              </div>
            )}
            <div className="flex gap-2 sm:col-span-3">
              <Button type="submit" disabled={busy || create.name.trim().length < 2 || create.slug.length < 2}>
                {busy ? "Creating…" : "Create draft"}
              </Button>
              <Button variant="ghost" onClick={() => setCreate({ open: false, name: "", slug: "", type: "private", slugTouched: false })}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}
      <div className="mb-4 flex flex-wrap gap-3">
        <input type="search" aria-label="Search colleges" placeholder="Search by name" className="min-h-11 flex-1 rounded-xl border border-line bg-surface px-3 text-sm" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value, page: 1 })} />
        <select aria-label="Status" className="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Active (published)</option>
          <option value="archived">Inactive</option>
        </select>
        <select aria-label="Sample data" className="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm" value={filters.sample} onChange={(e) => setFilters({ ...filters, sample: e.target.value, page: 1 })}>
          <option value="">Real and sample</option>
          <option value="no">Real only</option>
          <option value="yes">Sample only</option>
        </select>
      </div>
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="No colleges found">{canEdit ? "Add a college to get started." : "Nothing to show yet."}</EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {list.data.items.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/colleges/${c.id}`} className="font-semibold hover:underline">
                    {c.name}
                  </Link>
                  <p className="text-sm text-muted">
                    {[c.city, c.state].filter(Boolean).join(", ") || "No city yet"} · {COLLEGE_TYPES[c.type]}
                    {c.feeSummary?.minTotalMinor != null && ` · from ${formatLakh(c.feeSummary.minTotalMinor)}`}
                  </p>
                  {c.isSample && (
                    <div className="mt-1">
                      <SampleBadge />
                    </div>
                  )}
                </div>
                <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                <span className="text-xs text-muted">Updated {fmtDate(c.updatedAt)}</span>
              </li>
            ))}
          </ul>
          <Pager meta={list.data.meta} onPage={(page) => setFilters({ ...filters, page })} />
        </>
      )}
    </div>
  );
}

// ---- College editor: Profile, Courses, Fees ----

type ProfileForm = Omit<AdminCollege, "id" | "status" | "city" | "state" | "isSample" | "feeSummary" | "updatedAt" | "offerings" | "approvals" | "aliases" | "yearEstablished" | "listingLevel" | "source" | "lockedFields" | "images" | "entranceExams" | "facilities" | "highlights" | "admissionDeadline"> & {
  approvals: string;
  aliases: string;
  yearEstablished: string;
  entranceExams: string;
  facilities: string;
  highlights: string;
  admissionDeadline: string;
};

const toProfileForm = (c: AdminCollege): ProfileForm => ({
  name: c.name,
  slug: c.slug,
  type: c.type,
  location: c.location,
  address: c.address,
  website: c.website,
  logoUrl: c.logoUrl,
  coverUrl: c.coverUrl,
  about: c.about,
  accreditations: c.accreditations.map((a) => ({ ...a, validUntil: a.validUntil ? a.validUntil.slice(0, 10) : null })),
  approvals: c.approvals.join(", "),
  admissionProcess: c.admissionProcess,
  campusInfo: c.campusInfo,
  placementInfo: c.placementInfo,
  placementVerified: c.placementVerified,
  contact: { ...c.contact },
  featured: c.featured,
  lastVerifiedAt: c.lastVerifiedAt ? c.lastVerifiedAt.slice(0, 10) : null,
  verificationSource: c.verificationSource,
  aisheCode: c.aisheCode ?? null,
  ownership: c.ownership ?? null,
  category: c.category ?? null,
  subtype: c.subtype ?? "",
  district: c.district ?? "",
  postalCode: c.postalCode ?? "",
  yearEstablished: c.yearEstablished ? String(c.yearEstablished) : "",
  affiliatedUniversity: { name: c.affiliatedUniversity?.name ?? "", type: c.affiliatedUniversity?.type ?? "" },
  aliases: (c.aliases ?? []).join(", "),
  hostelAvailable: c.hostelAvailable ?? null,
  applicationUrl: c.applicationUrl ?? "",
  eligibility: c.eligibility ?? "",
  entranceExams: (c.entranceExams ?? []).join(", "),
  facilities: (c.facilities ?? []).join(", "),
  highlights: (c.highlights ?? []).join("\n"),
  academicSession: c.academicSession ?? "",
  admissionDeadline: c.admissionDeadline ? c.admissionDeadline.slice(0, 10) : "",
  social: { instagram: c.social?.instagram ?? "", facebook: c.social?.facebook ?? "", youtube: c.social?.youtube ?? "", linkedin: c.social?.linkedin ?? "", x: c.social?.x ?? "" },
  admissionInfo: c.admissionInfo ?? "",
});

const list = (s: string, sep: string | RegExp = ",") => s.split(sep).map((x) => x.trim()).filter(Boolean);

function ProfileTab({ college, cities, canEdit, onSaved }: { college: AdminCollege; cities: Location[]; canEdit: boolean; onSaved: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState(() => toProfileForm(college));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ busy: boolean; tone?: "error" | "success"; message?: string }>({ busy: false });
  const set = (p: Partial<ProfileForm>) => setForm((f) => ({ ...f, ...p }));
  const setAcc = (i: number, p: Partial<Accreditation>) => set({ accreditations: form.accreditations.map((a, j) => (i === j ? { ...a, ...p } : a)) });

  async function save(e: FormEvent) {
    e.preventDefault();
    setStatus({ busy: true });
    setErrors({});
    try {
      // An uploaded logo is managed under "Logo & brochure"; its address is not edited here.
      const { logoUrl, ...fields } = form;
      const body = {
        ...fields,
        ...(!college.logoFile && { logoUrl }),
        approvals: form.approvals.split(",").map((s) => s.trim()).filter(Boolean),
        aliases: form.aliases.split(",").map((s) => s.trim()).filter(Boolean),
        aisheCode: form.aisheCode?.trim() || null,
        yearEstablished: /^\d{4}$/.test(form.yearEstablished.trim()) ? Number(form.yearEstablished.trim()) : null,
        lastVerifiedAt: form.lastVerifiedAt || null,
        accreditations: form.accreditations.map((a) => ({ ...a, validUntil: a.validUntil || null })),
        entranceExams: list(form.entranceExams),
        facilities: list(form.facilities),
        highlights: list(form.highlights, /\n/),
        admissionDeadline: form.admissionDeadline ? `${form.admissionDeadline}T23:59:59+05:30` : null,
      };
      await apiPatch(`/admin/colleges/${college.id}`, body);
      onSaved();
      setStatus({ busy: false, tone: "success", message: "Saved." });
    } catch (err) {
      setErrors(fieldErrors(err));
      setStatus({ busy: false, tone: "error", message: errMsg(err) });
    }
  }
  async function changeStatus(action: "publish" | "archive" | "restore") {
    if (action !== "restore" && !window.confirm(action === "publish" ? "Publish this college? It becomes Active and appears to students." : "Unpublish this college? It becomes Inactive and students will no longer see it.")) return;
    setStatus({ busy: true });
    try {
      await apiPost(`/admin/colleges/${college.id}/${action}`);
      onSaved();
      setStatus({ busy: false, tone: "success", message: { publish: "Published: the college is now Active.", archive: "Unpublished: the college is now Inactive.", restore: "Moved back to draft." }[action] });
    } catch (err) {
      setErrors(fieldErrors(err));
      setStatus({ busy: false, tone: "error", message: errMsg(err) });
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${college.name} permanently, with its courses, fees and files? This cannot be undone.`)) return;
    setStatus({ busy: true });
    try {
      await apiDelete(`/admin/colleges/${college.id}`);
      router.push("/admin/colleges");
    } catch (err) {
      setStatus({ busy: false, tone: "error", message: errMsg(err) });
    }
  }

  return (
    <form onSubmit={save} className="space-y-6" noValidate>
      {college.source?.name && (
        <Alert tone="info" title={`Imported from ${college.source.name}`}>
          {college.listingLevel === "basic" ? "Basic listing: add courses and verified fees to make it a detailed listing. " : ""}
          Last updated from the source {fmtDate(college.source.lastSyncedAt ?? null)}. Fields you change here are kept on later imports
          {college.lockedFields?.length ? ` (currently kept: ${college.lockedFields.join(", ")})` : ""}; differences are sent to the review queue under College data.
        </Alert>
      )}
      <fieldset disabled={!canEdit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" required value={form.name} onChange={(e) => set({ name: e.target.value })} error={errors.name} maxLength={160} />
          <TextField label="Web address (slug)" required value={form.slug} onChange={(e) => set({ slug: slugify(e.target.value) })} error={errors.slug} hint={`/colleges/${form.slug}`} />
          <SelectField label="Type" value={form.type} onChange={(e) => set({ type: e.target.value })}>
            {Object.entries(COLLEGE_TYPES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </SelectField>
          <SelectField label="City" value={form.location ?? ""} onChange={(e) => set({ location: e.target.value || null })} error={errors.location} hint="Region and state follow from the city">
            <option value="">Choose a city</option>
            {cities.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Institution" value={form.category ?? ""} onChange={(e) => set({ category: (e.target.value || null) as ProfileForm["category"] })}>
            <option value="">Not set</option>
            {Object.entries(CATEGORIES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </SelectField>
          <SelectField label="Ownership" value={form.ownership ?? ""} onChange={(e) => set({ ownership: (e.target.value || null) as ProfileForm["ownership"] })}>
            <option value="">Not set</option>
            {Object.entries(OWNERSHIP).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </SelectField>
          <TextField label="AISHE code" value={form.aisheCode ?? ""} onChange={(e) => set({ aisheCode: e.target.value })} error={errors.aisheCode} hint="e.g. C-12345, U-0123 or S-4567" maxLength={10} />
          <TextField label="Sub-type" value={form.subtype} onChange={(e) => set({ subtype: e.target.value })} maxLength={80} hint="e.g. Affiliated college, State public university" />
          <TextField label="District" value={form.district} onChange={(e) => set({ district: e.target.value })} maxLength={80} />
          <TextField label="PIN code" inputMode="numeric" value={form.postalCode} onChange={(e) => set({ postalCode: e.target.value })} error={errors.postalCode} maxLength={6} />
          <TextField label="Year established" inputMode="numeric" value={form.yearEstablished} onChange={(e) => set({ yearEstablished: e.target.value })} error={errors.yearEstablished} maxLength={4} />
          <TextField label="Affiliated university" value={form.affiliatedUniversity.name} onChange={(e) => set({ affiliatedUniversity: { ...form.affiliatedUniversity, name: e.target.value } })} maxLength={160} />
          <TextField label="Other names (comma separated)" value={form.aliases} onChange={(e) => set({ aliases: e.target.value })} hint="Former or short names students may search for" />
          <SelectField label="Hostel" value={form.hostelAvailable == null ? "" : form.hostelAvailable ? "yes" : "no"} onChange={(e) => set({ hostelAvailable: e.target.value === "" ? null : e.target.value === "yes" })}>
            <option value="">Not known</option>
            <option value="yes">Available</option>
            <option value="no">Not available</option>
          </SelectField>
          <TextField label="Address" value={form.address} onChange={(e) => set({ address: e.target.value })} maxLength={300} />
          <TextField label="Official website (https://)" value={form.website} onChange={(e) => set({ website: e.target.value })} error={errors.website} />
          <TextField label="Logo image URL (https://)" value={college.logoFile ? "" : form.logoUrl} disabled={Boolean(college.logoFile)} onChange={(e) => set({ logoUrl: e.target.value })} error={errors.logoUrl} hint={college.logoFile ? "An uploaded logo is in use (see Logo & brochure)" : "Or upload one under Logo & brochure. Use only images you are licensed to use"} />
          <TextField label="Cover image URL (https://)" value={form.coverUrl} onChange={(e) => set({ coverUrl: e.target.value })} error={errors.coverUrl} />
          <TextField label="Contact phone" value={form.contact.phone} onChange={(e) => set({ contact: { ...form.contact, phone: e.target.value } })} maxLength={30} />
          <TextField label="Contact email" type="email" value={form.contact.email} onChange={(e) => set({ contact: { ...form.contact, email: e.target.value } })} error={errors["contact.email"]} />
        </div>
        <TextAreaField label="About" value={form.about} onChange={(e) => set({ about: e.target.value })} maxLength={4000} />
        <TextAreaField label="Admission process" value={form.admissionProcess} onChange={(e) => set({ admissionProcess: e.target.value })} maxLength={4000} />
        <TextAreaField label="Campus information" value={form.campusInfo} onChange={(e) => set({ campusInfo: e.target.value })} maxLength={4000} />
        <div className="space-y-2">
          <TextAreaField label="Placement information" value={form.placementInfo} onChange={(e) => set({ placementInfo: e.target.value })} maxLength={4000} hint="Shown to students only when marked as verified" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.placementVerified} onChange={(e) => set({ placementVerified: e.target.checked })} /> Placement information is verified from an official source
          </label>
        </div>
        <fieldset className="space-y-4 rounded-2xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold">Admission details (from official sources only)</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Application / admission URL (https://)" value={form.applicationUrl ?? ""} onChange={(e) => set({ applicationUrl: e.target.value })} error={errors.applicationUrl} hint="Only a link you have checked on the college's official site" />
            <TextField label="Academic session" placeholder="2026-27" value={form.academicSession ?? ""} onChange={(e) => set({ academicSession: e.target.value })} error={errors.academicSession} maxLength={9} />
            <TextField label="Admission deadline" type="date" value={form.admissionDeadline} onChange={(e) => set({ admissionDeadline: e.target.value })} error={errors.admissionDeadline} />
            <TextField label="Entrance exams (comma separated)" placeholder="JEE Main, CUET" value={form.entranceExams} onChange={(e) => set({ entranceExams: e.target.value })} error={errors.entranceExams} />
            <TextField label="Facilities (comma separated)" placeholder="Hostel, Library, Labs, Sports" value={form.facilities} onChange={(e) => set({ facilities: e.target.value })} error={errors.facilities} />
          </div>
          <TextAreaField label="Eligibility" value={form.eligibility ?? ""} onChange={(e) => set({ eligibility: e.target.value })} maxLength={2000} error={errors.eligibility} />
          <TextAreaField label="Highlights (one per line)" value={form.highlights} onChange={(e) => set({ highlights: e.target.value })} error={errors.highlights} hint="Short verified facts, e.g. NAAC A++ (2024)" />
        </fieldset>
        <TextAreaField label="Admission information" value={form.admissionInfo ?? ""} onChange={(e) => set({ admissionInfo: e.target.value })} maxLength={4000} error={errors.admissionInfo} hint="Dates, documents, counselling rounds and other admission notes for students" />
        <fieldset className="space-y-4 rounded-2xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold">Official social media pages</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {SOCIAL.map(([key, name]) => (
              <TextField key={key} label={`${name} (https://)`} value={form.social?.[key] ?? ""} onChange={(e) => set({ social: { ...form.social!, [key]: e.target.value } })} error={errors[`social.${key}`]} />
            ))}
          </div>
        </fieldset>
        <TextField label="Approvals (comma separated)" value={form.approvals} onChange={(e) => set({ approvals: e.target.value })} hint="e.g. AICTE, UGC – only approvals you have verified" />
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Accreditation (verified only)</legend>
          {form.accreditations.map((a, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_8rem_10rem_1fr_auto] sm:items-end">
              <TextField label="Body" value={a.body} onChange={(e) => setAcc(i, { body: e.target.value })} error={errors[`accreditations.${i}.body`]} />
              <TextField label="Grade" value={a.grade} onChange={(e) => setAcc(i, { grade: e.target.value })} />
              <TextField label="Valid until" type="date" value={a.validUntil ?? ""} onChange={(e) => setAcc(i, { validUntil: e.target.value || null })} />
              <TextField label="Source URL" value={a.sourceUrl} onChange={(e) => setAcc(i, { sourceUrl: e.target.value })} error={errors[`accreditations.${i}.sourceUrl`]} />
              <Button size="sm" variant="ghost" onClick={() => set({ accreditations: form.accreditations.filter((_, j) => j !== i) })}>
                Remove
              </Button>
            </div>
          ))}
          <Button size="sm" variant="secondary" onClick={() => set({ accreditations: [...form.accreditations, { body: "", grade: "", validUntil: null, sourceUrl: "" }] })}>
            Add accreditation
          </Button>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Details verified on" type="date" value={form.lastVerifiedAt ?? ""} onChange={(e) => set({ lastVerifiedAt: e.target.value || null })} error={errors.lastVerifiedAt} hint="Required before publishing" />
          <TextField label="Verification source" value={form.verificationSource} onChange={(e) => set({ verificationSource: e.target.value })} maxLength={500} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.featured} onChange={(e) => set({ featured: e.target.checked })} /> Feature in the directory
        </label>
      </fieldset>
      {status.message && <Alert tone={status.tone ?? "info"}>{status.message}</Alert>}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={status.busy}>
            Save changes
          </Button>
          {college.status !== "published" && (
            <Button variant="gold" disabled={status.busy} onClick={() => changeStatus("publish")}>
              Publish (make Active)
            </Button>
          )}
          {college.status !== "archived" && (
            <Button variant="ghost" disabled={status.busy} onClick={() => changeStatus("archive")}>
              {college.status === "published" ? "Unpublish (make Inactive)" : "Mark Inactive"}
            </Button>
          )}
          {college.status !== "published" && (
            <Button variant="ghost" disabled={status.busy} onClick={remove}>
              Delete
            </Button>
          )}
          {college.status === "archived" && (
            <Button variant="secondary" disabled={status.busy} onClick={() => changeStatus("restore")}>
              Restore as draft
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

const emptyOffering = { course: "", specialization: "", durationMonths: "", minPercentage: "", seats: "", eligibilityText: "", entranceExams: "", applicationDeadline: "", admissionProcess: "", description: "", mode: "offline", minQualification: "" };

function OfferingForm({ collegeId, courses, offering, onDone }: { collegeId: string; courses: Course[]; offering?: AdminOffering; onDone: () => void }) {
  const [f, setF] = useState(
    offering
      ? {
          course: offering.course,
          specialization: offering.specialization,
          durationMonths: String(offering.durationMonths),
          minPercentage: offering.minPercentage == null ? "" : String(offering.minPercentage),
          seats: offering.seats == null ? "" : String(offering.seats),
          eligibilityText: offering.eligibilityText,
          entranceExams: offering.entranceExams.join(", "),
          applicationDeadline: offering.applicationDeadline?.slice(0, 10) ?? "",
          admissionProcess: offering.admissionProcess,
          description: offering.description ?? "",
          mode: offering.mode ?? "offline",
          minQualification: offering.minQualification ?? "",
        }
      : emptyOffering,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const body = {
      specialization: f.specialization.trim(),
      durationMonths: Number(f.durationMonths),
      minPercentage: num(f.minPercentage),
      seats: num(f.seats),
      eligibilityText: f.eligibilityText.trim(),
      entranceExams: f.entranceExams.split(",").map((s) => s.trim()).filter(Boolean),
      applicationDeadline: f.applicationDeadline || null,
      admissionProcess: f.admissionProcess.trim(),
      description: f.description.trim(),
      mode: f.mode,
      minQualification: f.minQualification || null,
    };
    try {
      if (offering) await apiPatch(`/admin/offerings/${offering.id}`, body);
      else await apiPost(`/admin/colleges/${collegeId}/offerings`, { ...body, course: f.course });
      onDone();
    } catch (err) {
      setErrors({ ...fieldErrors(err), form: errMsg(err) });
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <SelectField
        label="Course"
        required
        disabled={Boolean(offering)}
        value={f.course}
        error={errors.course}
        onChange={(e) => {
          const c = courses.find((x) => x.id === e.target.value);
          setF({ ...f, course: e.target.value, durationMonths: f.durationMonths || (c?.typicalDurationMonths ? String(c.typicalDurationMonths) : "") });
        }}
      >
        <option value="">Choose a course</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>
      <TextField label="Specialization" value={f.specialization} onChange={(e) => setF({ ...f, specialization: e.target.value })} maxLength={120} />
      <TextField label="Duration (months)" required inputMode="numeric" value={f.durationMonths} onChange={(e) => setF({ ...f, durationMonths: e.target.value })} error={errors.durationMonths} />
      <TextField label="Minimum percentage" inputMode="decimal" value={f.minPercentage} onChange={(e) => setF({ ...f, minPercentage: e.target.value })} error={errors.minPercentage} hint="Only if the college publishes one" />
      <TextField label="Seats" inputMode="numeric" value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value })} error={errors.seats} />
      <TextField label="Application deadline" type="date" value={f.applicationDeadline} onChange={(e) => setF({ ...f, applicationDeadline: e.target.value })} />
      <TextField label="Entrance exams (comma separated)" value={f.entranceExams} onChange={(e) => setF({ ...f, entranceExams: e.target.value })} />
      <TextField label="Eligibility" value={f.eligibilityText} onChange={(e) => setF({ ...f, eligibilityText: e.target.value })} maxLength={1000} />
      <SelectField label="Course mode" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })} error={errors.mode}>
        {Object.entries(MODE_LABEL).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </SelectField>
      <SelectField label="Minimum qualification" value={f.minQualification} onChange={(e) => setF({ ...f, minQualification: e.target.value })} error={errors.minQualification}>
        <option value="">Not stated</option>
        {Object.entries(QUALIFICATION_LABEL).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </SelectField>
      <div className="sm:col-span-2">
        <TextAreaField label="Course description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={2000} error={errors.description} />
      </div>
      <div className="sm:col-span-2">
        <TextAreaField label="Admission process for this course" value={f.admissionProcess} onChange={(e) => setF({ ...f, admissionProcess: e.target.value })} maxLength={2000} />
      </div>
      {errors.form && (
        <div className="sm:col-span-2">
          <Alert>{errors.form}</Alert>
        </div>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={busy || (!offering && !f.course) || !f.durationMonths}>
          {offering ? "Save course" : "Add course"}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function CoursesTab({ college, courses, canEdit, reload }: { college: AdminCollege; courses: Course[]; canEdit: boolean; reload: () => void }) {
  const [editing, setEditing] = useState<AdminOffering | "new" | null>(null);
  const [error, setError] = useState("");
  const name = (id: string) => courses.find((c) => c.id === id)?.name ?? "Course";
  const offerings = college.offerings ?? [];
  async function toggle(o: AdminOffering) {
    setError("");
    try {
      await apiPatch(`/admin/offerings/${o.id}`, { status: o.status === "active" ? "inactive" : "active" });
      reload();
    } catch (e) {
      setError(errMsg(e));
    }
  }
  async function remove(o: AdminOffering) {
    if (!window.confirm(`Delete ${name(o.course)}? Courses with fee history cannot be deleted; mark them inactive instead.`)) return;
    setError("");
    try {
      await apiDelete(`/admin/offerings/${o.id}`);
      reload();
    } catch (e) {
      setError(errMsg(e));
    }
  }
  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      {canEdit && editing === null && <Button onClick={() => setEditing("new")}>Add a course</Button>}
      {editing !== null && (
        <Card>
          <OfferingForm
            collegeId={college.id}
            courses={courses}
            offering={editing === "new" ? undefined : editing}
            onDone={() => {
              setEditing(null);
              reload();
            }}
          />
          {editing !== "new" && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MediaUpload label="Course picture" kind="image" path={`/admin/offerings/${editing.id}/image`} url={editing.imageUrl} canEdit={canEdit} onChange={reload} />
              <MediaUpload label="Course brochure" kind="pdf" path={`/admin/offerings/${editing.id}/brochure`} url={editing.brochureUrl} canEdit={canEdit} onChange={reload} />
            </div>
          )}
        </Card>
      )}
      {offerings.length === 0 ? (
        <EmptyState title="No courses yet">Add the courses this college offers.</EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {offerings.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {name(o.course)}
                  {o.specialization && ` · ${o.specialization}`}
                </p>
                <p className="text-muted">
                  {durationLabel(o.durationMonths)}
                  {o.minPercentage != null && ` · min ${o.minPercentage}%`}
                  {o.entranceExams.length > 0 && ` · ${o.entranceExams.join(", ")}`}
                  {` · ${MODE_LABEL[o.mode ?? "offline"]}`}
                </p>
              </div>
              <Badge tone={o.status === "active" ? "success" : "neutral"}>{o.status}</Badge>
              {canEdit && (
                <span className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(o)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(o)}>
                    {o.status === "active" ? "Deactivate" : "Activate"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(o)}>
                    Delete
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AdminCollegeEditor() {
  const { id } = useParams<{ id: string }>();
  const canCatalog = usePermission("catalog.manage");
  const canPricing = usePermission("pricing.manage");
  const data = useApiData(async (signal) => {
    const [college, locations, courses] = await Promise.all([apiGet<AdminCollege>(`/admin/colleges/${id}`, { signal }), apiGet<Location[]>("/locations", { signal }), apiGet<Course[]>("/courses", { signal })]);
    return { college, locations, courses };
  }, [id]);
  const [tab, setTab] = useState<"profile" | "media" | "photos" | "courses" | "fees">(canCatalog ? "profile" : "fees");
  const [offeringId, setOfferingId] = useState("");

  if (!data.data) return <LoadState status={data.status} error={data.error} reload={data.reload} rows={5} />;
  const college = data.data.college;
  const cities = data.data.locations.filter((l) => l.kind === "city");
  const offerings = college.offerings ?? [];
  const selected = offerings.find((o) => o.id === offeringId) ?? offerings[0];
  const tabs = [
    ["profile", "Profile"],
    ...(canCatalog ? [["media", "Logo & brochure"], ["photos", "Photos"]] : []),
    ["courses", "Courses"],
    ...(canPricing ? [["fees", "Fees"]] : []),
  ] as Array<[typeof tab, string]>;

  return (
    <div>
      <p className="text-sm">
        <Link href="/admin/colleges" className="text-muted hover:underline">
          ← All colleges
        </Link>
      </p>
      <PageTitle
        title={college.name}
        subtitle={[college.city, college.state].filter(Boolean).join(", ") || "No city yet"}
        action={
          <span className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[college.status]}>{STATUS_LABEL[college.status]}</Badge>
            {college.status === "published" && (
              <ButtonLink href={`/colleges/${college.slug}`} size="sm" variant="secondary" target="_blank">
                View public page
              </ButtonLink>
            )}
          </span>
        }
      />
      {college.isSample && (
        <div className="mb-4">
          <Alert tone="warning" title="Sample data – not a real institution">
            This fictional record was added by the sample seed. Remove all samples with <code>npm run seed:remove-samples</code>.
          </Alert>
        </div>
      )}
      <div role="tablist" aria-label="College sections" className="mb-6 flex gap-1 border-b border-line">
        {tabs.map(([key, label]) => (
          <button key={key} role="tab" type="button" aria-selected={tab === key} onClick={() => setTab(key)} className={`min-h-11 rounded-t-xl px-4 text-sm font-semibold ${tab === key ? "border-b-2 border-accent text-foreground" : "text-muted hover:text-foreground"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "profile" && <ProfileTab key={college.id} college={college} cities={cities} canEdit={canCatalog} onSaved={data.reload} />}
      {tab === "media" && canCatalog && (
        <div className="grid gap-4 sm:grid-cols-2">
          <MediaUpload label="College logo" kind="image" path={`/admin/colleges/${college.id}/logo`} url={college.logoFile ? college.logoUrl : null} canEdit={canCatalog} onChange={data.reload} />
          <MediaUpload label="College brochure" kind="pdf" path={`/admin/colleges/${college.id}/brochure`} url={college.brochureUrl} canEdit={canCatalog} onChange={data.reload} />
        </div>
      )}
      {tab === "photos" && canCatalog && <CollegeGallery key={college.id} collegeId={college.id} initial={college.images ?? []} canEdit={canCatalog} />}
      {tab === "courses" && <CoursesTab college={college} courses={data.data.courses} canEdit={canCatalog} reload={data.reload} />}
      {tab === "fees" &&
        canPricing &&
        (offerings.length === 0 ? (
          <EmptyState title="Add a course first">Fees are set per course offered by the college.</EmptyState>
        ) : (
          <div className="space-y-4">
            <SelectField label="Course" value={selected?.id ?? ""} onChange={(e) => setOfferingId(e.target.value)}>
              {offerings.map((o) => (
                <option key={o.id} value={o.id}>
                  {data.data!.courses.find((c) => c.id === o.course)?.name ?? "Course"}
                  {o.specialization && ` · ${o.specialization}`}
                  {o.status === "inactive" && " (inactive)"}
                </option>
              ))}
            </SelectField>
            {selected && <OfferingFees key={selected.id} offering={selected} courseName={data.data.courses.find((c) => c.id === selected.course)?.name ?? "Course"} />}
          </div>
        ))}
    </div>
  );
}

// ---- Courses catalogue ----

export function AdminCourses() {
  const list = useApiData((signal) => apiGet<Course[]>("/admin/courses", { signal }), []);
  const [form, setForm] = useState({ name: "", slug: "", level: "ug", category: "", months: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function add(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    try {
      await apiPost("/admin/courses", { name: form.name.trim(), slug: form.slug, level: form.level, category: form.category.trim(), typicalDurationMonths: form.months ? Number(form.months) : null });
      setForm({ name: "", slug: "", level: "ug", category: "", months: "" });
      list.reload();
    } catch (err) {
      setErrors({ ...fieldErrors(err), form: errMsg(err) });
    }
  }
  async function patch(c: Course, body: Partial<Course>) {
    try {
      await apiPatch(`/admin/courses/${c.id}`, body);
      list.reload();
    } catch (err) {
      setErrors({ form: errMsg(err) });
    }
  }
  return (
    <div>
      <PageTitle title="Courses" subtitle="The programme catalogue students search by. Deactivate a course to hide it; courses offered by colleges cannot be deleted." />
      <Card className="mb-6">
        <form onSubmit={add} className="grid gap-4 sm:grid-cols-5 sm:items-end" noValidate>
          <TextField label="Name" required value={form.name} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: slugify(e.target.value) })} />
          <TextField label="Slug" required value={form.slug} error={errors.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} />
          <SelectField label="Level" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
            {Object.entries(COURSE_LEVELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </SelectField>
          <TextField label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <TextField label="Typical months" inputMode="numeric" value={form.months} error={errors.typicalDurationMonths} onChange={(e) => setForm({ ...form, months: e.target.value })} />
          <div className="sm:col-span-5">
            <Button type="submit" disabled={form.name.trim().length < 2}>
              Add course
            </Button>
          </div>
        </form>
      </Card>
      {errors.form && <Alert>{errors.form}</Alert>}
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {list.data.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{c.name}</p>
                <p className="text-muted">
                  {COURSE_LEVELS[c.level]} · {c.category || "No category"}
                  {c.typicalDurationMonths && ` · ${durationLabel(c.typicalDurationMonths)}`} · /{c.slug}
                </p>
              </div>
              <Badge tone={c.isActive ? "success" : "neutral"}>{c.isActive ? "Active" : "Hidden"}</Badge>
              <Button size="sm" variant="ghost" onClick={() => patch(c, { isActive: !c.isActive })}>
                {c.isActive ? "Deactivate" : "Activate"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Locations ----

export function AdminLocations() {
  const list = useApiData((signal) => apiGet<Location[]>("/admin/locations", { signal }), []);
  const [form, setForm] = useState({ name: "", slug: "", kind: "city", parents: [] as string[] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const all = list.data ?? [];
  const names = (ids: string[]) => ids.map((id) => all.find((l) => l.id === id)?.name ?? "?").join(", ");
  async function add(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    try {
      await apiPost("/admin/locations", { name: form.name.trim(), slug: form.slug, kind: form.kind, parents: form.parents });
      setForm({ name: "", slug: "", kind: "city", parents: [] });
      list.reload();
    } catch (err) {
      setErrors({ ...fieldErrors(err), form: errMsg(err) });
    }
  }
  async function toggle(l: Location) {
    try {
      await apiPatch(`/admin/locations/${l.id}`, { isActive: !l.isActive });
      list.reload();
    } catch (err) {
      setErrors({ form: errMsg(err) });
    }
  }
  return (
    <div>
      <PageTitle title="Locations" subtitle="Regions, states and cities. A city’s parents decide which regions find it (e.g. Noida → Uttar Pradesh and Delhi NCR)." />
      <Card className="mb-6">
        <form onSubmit={add} className="grid gap-4 sm:grid-cols-3" noValidate>
          <TextField label="Name" required value={form.name} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: slugify(e.target.value) })} />
          <TextField label="Slug" required value={form.slug} error={errors.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} />
          <SelectField label="Kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="region">Region</option>
            <option value="state">State</option>
            <option value="city">City</option>
          </SelectField>
          <SelectField label="Belongs to (hold Ctrl/⌘ to choose several)" multiple value={form.parents} error={errors.parents} className="min-h-32" onChange={(e) => setForm({ ...form, parents: [...e.target.selectedOptions].map((o) => o.value) })}>
            {all
              .filter((l) => l.kind !== "city")
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.kind})
                </option>
              ))}
          </SelectField>
          <div className="self-end sm:col-span-2">
            <Button type="submit" disabled={form.name.trim().length < 2}>
              Add location
            </Button>
          </div>
        </form>
      </Card>
      {errors.form && <Alert>{errors.form}</Alert>}
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {(["region", "state", "city"] as const).map((kind) => (
            <Card key={kind}>
              <h2 className="font-semibold capitalize">{kind === "city" ? "Cities" : `${kind}s`}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {all
                  .filter((l) => l.kind === kind)
                  .map((l) => (
                    <li key={l.id} className="flex items-center gap-2">
                      <span className={`min-w-0 flex-1 ${l.isActive ? "" : "text-muted line-through"}`}>
                        {l.name}
                        {l.parents.length > 0 && <span className="block text-xs text-muted">in {names(l.parents)}</span>}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => toggle(l)}>
                        {l.isActive ? "Hide" : "Show"}
                      </Button>
                    </li>
                  ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
