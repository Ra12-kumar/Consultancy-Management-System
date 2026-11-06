"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert, Badge, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { SelectField, TextField } from "@/components/ui/Field";
import { ownImage } from "@/features/catalog/CatalogUi";
import { PageTitle } from "@/features/admin/shared";
import { useApiData } from "@/hooks/useApiData";
import { durationLabel } from "@/lib/format";
import { safeHref } from "@/lib/safeUrl";
import { filterOnline, loadOnlineColleges, ONLINE_UNIVERSITIES, type OnlineCollege, type ProgramLevel } from "./onlineUniversities";

// Online UG & PG: the highlighted universities with their catalogue details (logo, description, online UG/PG
// courses) or, when not yet in the catalogue, the college finder entry. Read-only; data from the existing APIs.

const LEVEL_LABEL: Record<ProgramLevel, string> = { ug: "UG", pg: "PG" };
const SOURCE: Partial<Record<OnlineCollege["status"], string>> = { catalogue: "Udaan college catalogue", finder: "College finder (Wikidata)" };

// The university's own logo (an https address from its official website, or one uploaded by an admin) in a panel
// of fixed size; a neutral placeholder when there is none or it fails to load. Never a stand-in picture.
function LogoPanel({ college }: { college: OnlineCollege }) {
  const [failed, setFailed] = useState(false);
  const src = ownImage(college.logoUrl) ?? safeHref(college.logoUrl, { httpsOnly: true });
  return (
    <div className="flex h-28 items-center justify-center rounded-xl border border-line bg-white px-6 py-4">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- official logos from each university's own website
        <img src={src} alt={`${college.name ?? college.label} logo`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="max-h-full max-w-full object-contain" />
      ) : (
        <span className="flex flex-col items-center gap-1 text-slate-400">
          <svg viewBox="0 0 24 24" className="size-9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 10 12 4l9 6M5 10v8M19 10v8M9 10v8M15 10v8M3 20h18" />
          </svg>
          <span className="text-[11px] font-medium">Logo not available</span>
        </span>
      )}
    </div>
  );
}

function ViewCollege({ college }: { college: OnlineCollege }) {
  const href = safeHref(college.website);
  if (!href) return <span className="inline-flex min-h-9 items-center text-xs text-muted">Official website not verified</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-fg hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
      View College <span aria-hidden="true">↗</span>
      <span className="sr-only">: {college.name ?? college.label} official website (opens in a new tab)</span>
    </a>
  );
}

function Courses({ college, level }: { college: OnlineCollege; level: "" | ProgramLevel }) {
  const shown = college.courses.filter((c) => !level || c.level === level);
  if (college.status !== "catalogue") return <p className="text-xs text-muted">Online courses are listed once this university is added to the college catalogue.</p>;
  if (!shown.length) return <p className="text-xs text-muted">No online UG/PG courses in the catalogue yet.</p>;
  return (
    <ul className="space-y-1.5" aria-label={`Online courses at ${college.name}`}>
      {shown.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-1.5 text-sm">
          <Badge tone={c.level === "ug" ? "neutral" : "gold"}>{LEVEL_LABEL[c.level]}</Badge>
          <span className="font-medium">{c.name}</span>
          {c.specialization && <span className="text-muted">· {c.specialization}</span>}
          <span className="text-xs text-muted">· {durationLabel(c.durationMonths)}</span>
        </li>
      ))}
    </ul>
  );
}

function CollegeTile({ college, level, onRetry }: { college: OnlineCollege; level: "" | ProgramLevel; onRetry: () => void }) {
  const place = [college.city, college.state].filter(Boolean).join(", ");
  const found = college.status === "catalogue" || college.status === "finder";
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm" aria-label={college.label}>
      <LogoPanel college={college} />
      <div className="mt-4 flex items-start gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{college.label}</p>
          <h2 className="font-semibold leading-snug">{college.name ?? college.label}</h2>
          {place && <p className="text-xs text-muted">{place}</p>}
        </div>
      </div>

      <div className="mt-3 flex-1 space-y-3">
        {college.status === "error" && (
          <div className="space-y-2">
            <Alert>Could not load this university. Please try again.</Alert>
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}
        {college.status === "pending" && <Alert tone="info">The college finder list is still loading on the server. Try again in a minute.</Alert>}
        {college.status === "not_found" && <p className="text-sm text-muted">Not found in the college catalogue or the college finder yet.</p>}
        {found && (
          <>
            <p className={`text-sm ${college.about ? "line-clamp-3" : "text-muted"}`}>{college.about || "Description not yet added in the college catalogue."}</p>
            <Courses college={college} level={level} />
          </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        {found ? <ViewCollege college={college} /> : <span />}
        {SOURCE[college.status] && <span className="text-[11px] text-muted">Source: {SOURCE[college.status]}</span>}
      </div>
    </article>
  );
}

export default function OnlinePrograms() {
  const [q, setQ] = useState("");
  const [level, setLevel] = useState<"" | ProgramLevel>("");
  const data = useApiData((signal) => loadOnlineColleges(signal), []);
  const items = data.data ?? [];
  const shown = filterOnline(items, q, level);
  const found = items.filter((c) => c.status === "catalogue" || c.status === "finder").length;
  const withCourses = items.filter((c) => c.courses.length > 0).length;

  return (
    <div>
      <PageTitle title="Online UG & PG" subtitle="Universities offering online undergraduate and postgraduate programmes. Details come from the college catalogue and the college finder; websites open in a new tab." />

      <form role="search" aria-label="Filter online universities" onSubmit={(e) => e.preventDefault()} className="mb-5 grid gap-3 sm:grid-cols-[1fr_12rem]">
        <TextField label="Search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="University, city or course" maxLength={80} />
        <SelectField label="Course level" value={level} onChange={(e) => setLevel(e.target.value as "" | ProgramLevel)}>
          <option value="">UG and PG</option>
          <option value="ug">UG (undergraduate)</option>
          <option value="pg">PG (postgraduate)</option>
        </SelectField>
      </form>

      {data.status === "error" && (
        <div className="space-y-3">
          <Alert title="Could not load the universities">{data.error?.message ?? "Please try again."}</Alert>
          <Button size="sm" variant="secondary" onClick={data.reload}>
            Try again
          </Button>
        </div>
      )}

      {data.status === "loading" && !data.data && (
        <div role="status" aria-label="Loading universities" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      )}

      {data.data && (
        <>
          <p className="mb-4 text-sm text-muted" aria-live="polite">
            {found} of {ONLINE_UNIVERSITIES.length} universities found · {withCourses} with online UG/PG courses in the catalogue · showing {shown.length}
          </p>
          {shown.length === 0 ? (
            <EmptyState title="No universities match">
              {level && withCourses === 0 ? "No online courses have been added to the college catalogue for these universities yet." : "Try another search or course level."}
            </EmptyState>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((c) => (
                <CollegeTile key={c.key} college={c} level={level} onRetry={data.reload} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
