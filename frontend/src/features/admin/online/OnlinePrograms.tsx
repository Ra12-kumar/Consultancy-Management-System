"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Alert, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { ownImage } from "@/features/catalog/CatalogUi";
import { useApiData } from "@/hooks/useApiData";
import { durationLabel, fmtDay } from "@/lib/format";
import { safeHref } from "@/lib/safeUrl";
import { filterOnline, loadOnlineColleges, ONLINE_UNIVERSITIES, type OnlineCollege, type ProgramLevel } from "./onlineUniversities";

// Online UG & PG (client design "Online UG & PG Programs"): a hero, one filter row and horizontal university cards.
// Every detail comes from the existing college APIs: the catalogue record (logo, description, online UG/PG
// courses, campus photo when an admin added one) or, when not in the catalogue, the college finder entry.

const LEVEL_LABEL: Record<ProgramLevel, string> = { ug: "UG", pg: "PG" };
const SOURCE: Partial<Record<OnlineCollege["status"], string>> = { catalogue: "Udaan college catalogue", finder: "College finder (Wikidata)" };
// "MBA / PGDM" → "MBA": the short name used on the course chips.
const shortName = (name: string) => name.split(" / ")[0]!.trim();
const imageSrc = (url: string | null) => ownImage(url) ?? safeHref(url, { httpsOnly: true });

function Svg({ children, className = "size-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
const ShieldIcon = () => (
  <Svg>
    <path d="M12 3 4 6v6c0 4.4 3.4 8 8 9 4.6-1 8-4.6 8-9V6l-8-3Z" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </Svg>
);
const LaptopIcon = () => (
  <Svg>
    <rect x="4" y="5" width="16" height="11" rx="1.5" />
    <path d="M2 19h20" />
  </Svg>
);
const AwardIcon = () => (
  <Svg>
    <circle cx="12" cy="9" r="5" />
    <path d="m9 13.5-1.5 7.5 4.5-2.5 4.5 2.5-1.5-7.5" />
  </Svg>
);
const BuildingIcon = ({ className = "size-9" }: { className?: string }) => (
  <Svg className={className}>
    <path d="M3 10 12 4l9 6M5 10v8M19 10v8M9 10v8M15 10v8M3 20h18" />
  </Svg>
);

function Hero() {
  const points: Array<[ReactNode, string, string]> = [
    [<ShieldIcon key="s" />, "UGC-Entitled", "Universities"],
    [<LaptopIcon key="l" />, "Flexible", "Online Learning"],
    [<AwardIcon key="a" />, "Recognised", "Degrees"],
  ];
  return (
    <section aria-labelledby="online-title" className="relative mb-5 overflow-hidden rounded-2xl bg-gradient-to-r from-sky-50 via-blue-50 to-blue-100 px-5 py-7 sm:px-8 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950">
      <div className="relative z-10 max-w-2xl">
        <h1 id="online-title" className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
          Online <span className="text-blue-600 dark:text-blue-400">UG &amp; PG</span> Programs
        </h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-[15px] dark:text-slate-300">
          Explore universities offering UGC-entitled online degree programmes. Compare courses, check the details and visit each university&apos;s official website.
        </p>
        <ul className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
          {points.map(([icon, a, b]) => (
            <li key={a} className="flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-200">
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm ring-1 ring-blue-100 dark:bg-slate-800 dark:text-blue-400 dark:ring-slate-700">{icon}</span>
              <span className="leading-tight">
                {a}
                <br />
                {b}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {/* Decorative drawing (no photo): a graduation cap over a laptop. */}
      <svg viewBox="0 0 220 160" aria-hidden="true" className="pointer-events-none absolute top-1/2 right-6 hidden h-40 -translate-y-1/2 text-blue-300 lg:block dark:text-blue-800">
        <circle cx="150" cy="80" r="78" className="fill-blue-100/70 dark:fill-blue-900/40" />
        <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M60 52 120 26l60 26-60 26-60-26Z" />
          <path d="M84 63v22c0 9 16 16 36 16s36-7 36-16V63M180 52v30" />
          <rect x="78" y="108" width="84" height="36" rx="4" />
          <path d="M66 150h108" />
        </g>
      </svg>
    </section>
  );
}

// Left panel: a campus photo an admin added, else the university's official logo, else a neutral placeholder.
function Media({ college }: { college: OnlineCollege }) {
  const [failed, setFailed] = useState<string | null>(null);
  const photo = imageSrc(college.photoUrl);
  const logo = imageSrc(college.logoUrl);
  const src = photo && failed !== photo ? photo : logo && failed !== logo ? logo : null;
  const box = "flex h-24 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line sm:h-28 sm:w-36";
  if (!src) {
    return (
      <div className={`${box} flex-col gap-1 bg-slate-50 text-slate-400 dark:bg-slate-800`}>
        <BuildingIcon className="size-8" />
        <span className="px-1 text-center text-[10px] font-medium">Logo not available</span>
      </div>
    );
  }
  const isPhoto = src === photo;
  return (
    <div className={`${box} ${isPhoto ? "" : "bg-white p-2.5"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- official logos and admin photos from varied hosts */}
      <img
        src={src}
        alt={isPhoto ? `${college.name ?? college.label} campus` : `${college.name ?? college.label} logo`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(src)}
        className={isPhoto ? "size-full object-cover" : "max-h-full max-w-full object-contain"}
      />
    </div>
  );
}

function ViewCollege({ college }: { college: OnlineCollege }) {
  const href = safeHref(college.website);
  if (!href) return <span className="text-[11px] text-muted">Official website not verified</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:outline-none">
      View College <span aria-hidden="true">↗</span>
      <span className="sr-only">: {college.name ?? college.label} official website (opens in a new tab)</span>
    </a>
  );
}

// "UG: BBA, BCA, BA" and "PG: MBA, MCA, MA" chips, then the full list (specializations and durations) on request.
function Courses({ college, level }: { college: OnlineCollege; level: "" | ProgramLevel }) {
  const shown = college.courses.filter((c) => !level || c.level === level);
  if (college.status !== "catalogue") return <p className="text-[11px] text-muted">Online courses are listed once this university is added to the college catalogue.</p>;
  if (!shown.length) return <p className="text-[11px] text-muted">No online UG/PG courses in the catalogue yet.</p>;
  const levels = (["ug", "pg"] as const).filter((l) => shown.some((c) => c.level === l));
  return (
    <div className="space-y-1.5">
      {levels.map((l) => (
        <p key={l} className={`inline-flex max-w-full rounded-md px-2 py-0.5 text-[11px] font-medium ${l === "ug" ? "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200" : "bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-200"} mr-1.5`}>
          <span className="truncate">
            <span className="font-semibold">{LEVEL_LABEL[l]}:</span> {[...new Set(shown.filter((c) => c.level === l).map((c) => shortName(c.name)))].join(", ")}
          </span>
        </p>
      ))}
      <details className="group text-xs">
        <summary className="cursor-pointer text-[11px] font-medium text-blue-700 hover:underline dark:text-blue-300">All {shown.length} online courses</summary>
        <ul className="mt-1.5 space-y-1" aria-label={`Online courses at ${college.name}`}>
          {shown.map((c) => (
            <li key={c.id}>
              <span className="font-semibold text-muted">{LEVEL_LABEL[c.level]}</span> <span className="font-medium">{c.name}</span>
              {c.specialization && <span className="text-muted"> · {c.specialization}</span>}
              <span className="text-muted"> · {durationLabel(c.durationMonths)}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function CollegeTile({ college, level, onRetry }: { college: OnlineCollege; level: "" | ProgramLevel; onRetry: () => void }) {
  const place = [college.city, college.state].filter(Boolean).join(", ");
  const found = college.status === "catalogue" || college.status === "finder";
  const verified = college.status === "catalogue" && college.verifiedAt;
  const logo = imageSrc(college.logoUrl);
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-sm transition-shadow hover:shadow-md" aria-label={college.label}>
      <div className="flex gap-4">
        <Media college={college} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            {/* With a campus photo on the left, the logo sits above the name as in the design. */}
            {imageSrc(college.photoUrl) && logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- official logo from the university's website
              <img src={logo} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-7 max-w-[60%] object-contain" />
            ) : (
              <p className="pt-0.5 text-[10px] font-semibold tracking-wide text-muted uppercase">{college.label}</p>
            )}
            {verified && (
              <span title={`Details last verified ${fmtDay(college.verifiedAt)}`} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200 ring-inset dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800">
                <svg viewBox="0 0 16 16" className="size-3" fill="currentColor" aria-hidden="true">
                  <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm3.2 5.3-3.7 3.9a.8.8 0 0 1-1.1 0L4.8 8.6a.8.8 0 1 1 1.1-1.1l1 1 3.2-3.3a.8.8 0 0 1 1.1 1.1Z" />
                </svg>
                Verified
              </span>
            )}
          </div>
          <h2 className="mt-1.5 text-[15px] leading-snug font-semibold">{college.name ?? college.label}</h2>
          {place && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
              <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="currentColor" aria-hidden="true">
                <path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
              </svg>
              {place}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex-1 space-y-2.5">
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
            <p className={`text-xs leading-relaxed ${college.about ? "line-clamp-2" : "text-muted"}`}>{college.about || "Description not yet added in the college catalogue."}</p>
            <Courses college={college} level={level} />
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        {SOURCE[college.status] ? <span className="text-[10px] text-muted">Source: {SOURCE[college.status]}</span> : <span />}
        {found && <ViewCollege college={college} />}
      </div>
    </article>
  );
}

const control = "h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-foreground focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 focus:outline-none";

export default function OnlinePrograms() {
  const [q, setQ] = useState("");
  const [level, setLevel] = useState<"" | ProgramLevel>("");
  const [course, setCourse] = useState("");
  const [state, setState] = useState("");
  const data = useApiData((signal) => loadOnlineColleges(signal), []);
  const items = data.data ?? [];
  const shown = filterOnline(items, q, level, course, state);
  const found = items.filter((c) => c.status === "catalogue" || c.status === "finder").length;
  const withCourses = items.filter((c) => c.courses.length > 0).length;
  // Filter choices come from the loaded data only.
  const courseOptions = [...new Set(items.flatMap((c) => c.courses.filter((x) => !level || x.level === level).map((x) => x.name)))].sort();
  const stateOptions = [...new Set(items.map((c) => c.state).filter(Boolean))].sort();

  return (
    <div>
      <Hero />

      <form role="search" aria-label="Filter online universities" onSubmit={(e) => e.preventDefault()} className="mb-2 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_auto] xl:items-center">
        <label className="relative block md:col-span-2 xl:col-span-1">
          <span className="sr-only">Search</span>
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search university, course or location..." maxLength={80} className={`${control} pl-10`} />
        </label>
        <label>
          <span className="sr-only">Course level</span>
          <select
            value={level}
            onChange={(e) => {
              setLevel(e.target.value as "" | ProgramLevel);
              setCourse("");
            }}
            className={control}
          >
            <option value="">All Programs</option>
            <option value="ug">UG (undergraduate)</option>
            <option value="pg">PG (postgraduate)</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Course</span>
          <select value={course} onChange={(e) => setCourse(e.target.value)} className={control}>
            <option value="">All Courses</option>
            {courseOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Location</span>
          <select value={state} onChange={(e) => setState(e.target.value)} className={control}>
            <option value="">All Locations</option>
            {stateOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm whitespace-nowrap text-muted md:col-span-2 md:text-right xl:col-span-1" aria-live="polite">
          <span className="text-lg font-bold text-blue-700 dark:text-blue-300">{data.data ? shown.length : "–"}</span> Universities Found
        </p>
      </form>
      {data.data && (
        <p className="mb-4 text-xs text-muted">
          {found} of {ONLINE_UNIVERSITIES.length} universities found · {withCourses} with online UG/PG courses in the catalogue · showing {shown.length}
        </p>
      )}

      {data.status === "error" && (
        <div className="space-y-3">
          <Alert title="Could not load the universities">{data.error?.message ?? "Please try again."}</Alert>
          <Button size="sm" variant="secondary" onClick={data.reload}>
            Try again
          </Button>
        </div>
      )}

      {data.status === "loading" && !data.data && (
        <div role="status" aria-label="Loading universities" className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      )}

      {data.data &&
        (shown.length === 0 ? (
          <EmptyState title="No universities match">
            {level && withCourses === 0 ? "No online courses have been added to the college catalogue for these universities yet." : "Try another search, programme, course or location."}
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((c) => (
              <CollegeTile key={c.key} college={c} level={level} onRetry={data.reload} />
            ))}
          </div>
        ))}
    </div>
  );
}
