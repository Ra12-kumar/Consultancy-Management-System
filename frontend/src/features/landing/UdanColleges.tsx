"use client";

/* eslint-disable @next/next/no-img-element -- local photos and SVG icons from the client design */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useApiData } from "@/hooks/useApiData";
import { safeHref } from "@/lib/safeUrl";
import { apiGet } from "@/services/api";
import type { ApiError } from "@/types/api";
import { FINDER_KEYS, type FinderCollege, type FinderResult } from "@/features/catalog/CollegeFinder";
import { UdanFooter, UdanHeader, hideSiteChrome, udanDisplay, udanFonts, udanGutter } from "./UdanChrome";

// /colleges in the Udaan design ("Udaan · Colleges in Bengaluru"): the real-time college finder
// (GET /api/colleges/explore) with a search card, study-area filter, result cards, a side-by-side
// comparison of up to three colleges and numbered pages.

export const UDAN_FINDER_KEYS = [...FINDER_KEYS, "order", "teacher"];
// Teacher-education courses (the finder recognises them from the college name).
export const TEACHER_COURSES = { deled: "D.El.Ed", bed: "B.Ed", med: "M.Ed" } as const;
const PER_PAGE = 24;
const MAX_PAGE = 500; // the API's page limit
const COMPARE_MAX = 3;
const COMPARE_KEY = "udan.compare";
const nf = new Intl.NumberFormat("en-IN");

const ink = "text-[#142b41]";
const muted = "text-[#5c6974]";
const field = "mt-1.5 h-11 w-full rounded-md border border-[#dfe3e5] bg-white px-3 text-sm text-[#142b41] focus:border-[#10283f] focus:ring-2 focus:ring-[#edbf54]/40 focus:outline-none disabled:bg-[#f7f5ef] disabled:text-[#8a949c]";
const label = "block text-[11px] font-semibold text-[#5c6974]";

// Photos for the places the design covers; other searches use the general campus photo.
const PLACES: Record<string, { image: string; caption: string }> = {
  bengaluru: { image: "/udan/bengaluru.jpg", caption: "Bengaluru, Karnataka" },
  bangalore: { image: "/udan/bengaluru.jpg", caption: "Bengaluru, Karnataka" },
  "bengaluru urban": { image: "/udan/bengaluru.jpg", caption: "Bengaluru, Karnataka" },
  pune: { image: "/udan/pune.jpg", caption: "Pune, Maharashtra" },
  delhi: { image: "/udan/delhi-ncr.jpg", caption: "Delhi NCR" },
  "new delhi": { image: "/udan/delhi-ncr.jpg", caption: "Delhi NCR" },
};
const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

export function udanQuery(p: URLSearchParams) {
  const q = new URLSearchParams();
  for (const k of UDAN_FINDER_KEYS) {
    const v = p.get(k)?.trim();
    if (v) q.set(k, v);
  }
  return q;
}

// "Bengaluru Institute of Technology, Bengaluru" → "BIT"; longer names use their first and last words.
export function initials(name: string) {
  const words = name
    .split(",")[0]!
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !/\./.test(w) && !/^(of|and|the|for|in|at|&)$/i.test(w));
  const pick = words.length > 3 ? [words[0]!, words[words.length - 1]!] : words;
  return pick.map((w) => w[0]!.toUpperCase()).join("") || "C";
}

// Page links: first, last and the neighbours of the current page, with gaps shown as "…".
export function pageList(current: number, total: number): Array<number | "gap"> {
  const set = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 2) [2, 3].forEach((n) => set.add(n));
  if (current >= total - 1) [total - 2, total - 1].forEach((n) => set.add(n));
  const pages = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  pages.forEach((n, i) => {
    if (i > 0 && n - pages[i - 1]! > 1) out.push("gap");
    out.push(n);
  });
  return out;
}

function Landmark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M3 21h18M5 21V10M19 21V10M9 21v-7M15 21v-7M2 10l10-6 10 6" />
    </svg>
  );
}

function Check({ checked }: { checked: boolean }) {
  return (
    <span aria-hidden="true" className={`flex size-4 shrink-0 items-center justify-center rounded-[3px] border ${checked ? "border-[#10283f] bg-[#10283f]" : "border-[#b9c1c7] bg-white"}`}>
      {checked && (
        <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.2 5 8.5l4.5-5" />
        </svg>
      )}
    </span>
  );
}

function Chip({ children, onRemove, name }: { children: ReactNode; onRemove: () => void; name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#edf1f4] py-1 pr-1.5 pl-3 text-xs">
      {children}
      <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className="flex size-5 items-center justify-center rounded-full hover:bg-[#dfe3e5]">
        ×
      </button>
    </span>
  );
}

function CollegeCard({ c, branchLabels, compared, onCompare, compareFull, courseLabel }: { c: FinderCollege; branchLabels: Record<string, string>; compared: boolean; onCompare: () => void; compareFull: boolean; courseLabel?: string }) {
  const site = safeHref(c.website);
  const place = [c.city, c.state].filter(Boolean).join(", ");
  const first = c.branches[0];
  const subject = courseLabel ? `${courseLabel} programmes` : first === "university" ? "programmes across many subjects" : first && branchLabels[first] ? `${branchLabels[first].toLowerCase()} programmes` : "programmes";
  const enquire = `/enquire?collegeName=${encodeURIComponent(place ? `${c.name}, ${c.city || c.state}` : c.name)}&source=college_search`;
  return (
    <article className="rounded-[10px] border border-[#dfe3e5] bg-white p-4 sm:p-5">
      <div className="flex gap-4">
        <div aria-hidden="true" className="flex size-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md bg-[#f7f5ef] text-[#5c6974]">
          <Landmark />
          <span className="text-[11px] font-bold tracking-wide text-[#142b41]">{initials(c.name)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] leading-snug font-semibold break-words">{c.name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            <span className={`flex items-center gap-1 ${muted}`}>
              <img src="/udan/map-pin.svg" alt="" width={14} height={14} />
              {place || "Location not listed"}
            </span>
            {courseLabel && <span className="rounded bg-[#10283f] px-2 py-0.5 text-[11px] font-semibold text-white">{courseLabel}</span>}
            {c.branches.slice(0, 2).map((b) => (
              <span key={b} className="rounded bg-[#faf0d6] px-2 py-0.5 text-[11px] font-medium text-[#6b5114]">
                {branchLabels[b] ?? b}
              </span>
            ))}
          </div>
          <p className={`mt-2 text-xs leading-relaxed ${muted}`}>Explore {subject} and admission requirements.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3 border-t border-[#edf1f4] pt-3 sm:flex-row sm:items-center sm:justify-between">
        <label className={`flex cursor-pointer items-center gap-2 text-xs ${compareFull && !compared ? "opacity-60" : ""}`}>
          <input type="checkbox" className="sr-only" checked={compared} disabled={compareFull && !compared} onChange={onCompare} />
          <Check checked={compared} />
          Add to compare<span className="sr-only">: {c.name}</span>
        </label>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold">
          {site ? (
            <a href={site} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
              Visit official website ↗<span className="sr-only"> for {c.name} (opens in a new tab)</span>
            </a>
          ) : (
            <a href={`https://www.google.com/search?q=${encodeURIComponent([c.name, c.city, "official website"].filter(Boolean).join(" "))}`} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
              Search for website ↗<span className="sr-only"> of {c.name} (opens in a new tab)</span>
            </a>
          )}
          <a href={c.wikidataUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex h-9 items-center rounded-md border border-[#dfe3e5] px-3 hover:bg-[#f7f5ef]">
            View details<span className="sr-only"> of {c.name} on Wikidata (opens in a new tab)</span>
          </a>
          <Link href={enquire} className="inline-flex h-9 items-center gap-2 rounded-md bg-[#edbf54] px-3 text-[#142b41] hover:bg-[#e5b23d]">
            Enquire now
            <img src="/udan/arrow-gold-btn.svg" alt="" width={14} height={14} />
            <span className="sr-only">about {c.name}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

function GuidanceCard({ className = "" }: { className?: string }) {
  return (
    <aside aria-label="Counselling" className={`rounded-[10px] bg-[#10283f] p-5 text-white ${className}`}>
      <span className="flex size-9 items-center justify-center rounded-md bg-[#edbf54]">
        <img src="/udan/message-circle.svg" alt="" width={20} height={20} />
      </span>
      <p className={`${udanDisplay} mt-4 text-lg leading-snug`}>
        A little guidance.
        <br />A clearer shortlist.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-[#c8d2da]">Talk through your interests, eligibility and budget with a Udaan counsellor.</p>
      <Link href="/#guidance" className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-[#edbf54] px-4 text-xs font-semibold text-[#142b41] hover:bg-[#e5b23d]">
        Talk to a counsellor
        <img src="/udan/arrow-gold-btn.svg" alt="" width={14} height={14} />
      </Link>
      <p className="mt-3 text-[10px] text-[#c8d2da]">Support, not admission promises.</p>
    </aside>
  );
}

export default function UdanColleges() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = udanQuery(new URLSearchParams(params.toString()));
  const key = query.toString();
  const q = query.get("q") ?? "";
  const [text, setText] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [compare, setCompare] = useState<FinderCollege[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);

  // The search box follows the URL (back button, links from the landing page).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the box in step with the URL
  useEffect(() => setText(q), [q]);
  // Chosen colleges stay for this tab only.
  useEffect(() => {
    try {
      const v: unknown = JSON.parse(sessionStorage.getItem(COMPARE_KEY) ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the saved choice once
      if (Array.isArray(v)) setCompare(v.filter((x): x is FinderCollege => typeof x?.id === "string" && typeof x?.name === "string").slice(0, COMPARE_MAX));
    } catch {
      // Storage unavailable: start empty.
    }
  }, []);
  const saveCompare = (next: FinderCollege[]) => {
    setCompare(next);
    try {
      sessionStorage.setItem(COMPARE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable (private mode): the choice still works on this page.
    }
  };

  const set = (changes: Record<string, string>) => {
    const next = udanQuery(new URLSearchParams(params.toString()));
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in changes)) next.delete("page");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: "page" in changes });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    set({ q: text.trim() });
  };

  const branches = useApiData((signal) => apiGet<Record<string, string>>("/colleges/explore/branches", { signal }), []);
  const result = useApiData((signal) => apiGet<FinderResult>(`/colleges/explore?${key}`, { signal }), [key]);
  const data = result.data;
  const branchLabels = branches.data ?? {};
  const branch = query.get("branch") ?? data?.branch ?? "";
  const state = query.get("state") ?? "";
  const city = query.get("city") ?? "";
  const page = data?.page ?? 1;
  const totalPages = Math.min(data?.totalPages ?? 1, MAX_PAGE);
  const from = data && data.total ? (page - 1) * PER_PAGE + 1 : 0;
  const to = data ? from + data.items.length - 1 : 0;

  // Heading and photo follow the place being searched.
  const states = data?.states ?? [];
  const qIsPlace = !!q && (norm(q) in PLACES || states.some((s) => norm(s) === norm(q)));
  const place = city || (qIsPlace ? q : "") || state;
  const teacher = (query.get("teacher") ?? "") as keyof typeof TEACHER_COURSES | "";
  const course = teacher ? `${TEACHER_COURSES[teacher]} colleges` : "Colleges";
  const heading = place ? `${course} in ${place}` : q ? `${course} matching “${q}”` : `${course} across India`;
  const photo = PLACES[norm(city || q || state)];

  const chips: Array<{ name: string; text: string; clear: Record<string, string> }> = [];
  if (q) chips.push({ name: "search", text: `Search: ${q}`, clear: { q: "" } });
  if (teacher) chips.push({ name: "course", text: TEACHER_COURSES[teacher], clear: { teacher: "" } });
  if (branch) chips.push({ name: "study area", text: branchLabels[branch] ?? branch, clear: { branch: "", course: "" } });
  if (state) chips.push({ name: "state", text: state, clear: { state: "", city: "" } });
  if (city) chips.push({ name: "city", text: city, clear: { city: "" } });

  const filters = (
    <div className="rounded-[10px] border border-[#dfe3e5] bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
            <circle cx="16" cy="6" r="2" />
            <circle cx="10" cy="12" r="2" />
            <circle cx="18" cy="18" r="2" />
          </svg>
          Refine search
        </p>
        <button type="button" onClick={() => set({ branch: "", course: "" })} className={`text-xs hover:underline ${muted}`}>
          Reset
        </button>
      </div>
      <fieldset className="mt-4 border-t border-[#edf1f4] pt-4">
        <legend className="sr-only">Study area</legend>
        <p aria-hidden="true" className="text-xs font-semibold">
          Study area
        </p>
        <div className="mt-3 space-y-1">
          {[["", "All branches"] as const, ...Object.entries(branchLabels)].map(([k, v]) => (
            <label key={k || "all"} className="flex min-h-8 cursor-pointer items-center gap-2.5 text-xs">
              <input type="radio" name="udan-branch" className="sr-only" checked={branch === k} onChange={() => set({ branch: k, course: "" })} />
              <Check checked={branch === k} />
              {v}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );

  return (
    <div id="udan" className={`${udanFonts} min-h-screen bg-white ${ink}`}>
      <style>{hideSiteChrome}</style>
      <UdanHeader active="/colleges" />

      <main id="main">
        {/* Search introduction */}
        <section aria-labelledby="udan-colleges-title" className={`bg-[#f7f5ef] pt-6 pb-10 ${udanGutter}`}>
          <nav aria-label="Breadcrumb" className={`text-[11px] ${muted}`}>
            <ol className="flex items-center gap-2">
              <li>
                <Link href="/" className="hover:underline">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">›</li>
              <li aria-current="page" className="font-semibold text-[#142b41]">
                Find colleges
              </li>
            </ol>
          </nav>
          <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className={`text-[11px] font-bold tracking-[1.8px] ${muted}`}>FIND A PLACE TO BECOME YOURSELF</p>
              <h1 id="udan-colleges-title" className={`${udanDisplay} mt-3 text-3xl leading-tight break-words sm:text-[38px]`}>
                {heading}
              </h1>
              <p className={`mt-3 text-sm leading-relaxed ${muted}`}>Explore your options. Compare what matters. Take your next step with clarity.</p>
            </div>
            <figure className="relative hidden h-[124px] w-[220px] shrink-0 overflow-hidden rounded-[10px] sm:block lg:h-[150px] lg:w-[280px]">
              <img src={photo?.image ?? "/udan/campus-life.jpg"} alt="" className="h-full w-full object-cover" />
              {photo && <figcaption className="absolute bottom-2 left-2 rounded bg-white/95 px-2 py-1 text-[10px] font-semibold">{photo.caption}</figcaption>}
            </figure>
          </div>

          <form role="search" aria-label="Search colleges" onSubmit={submit} className="mt-8 grid gap-4 rounded-[10px] bg-white p-4 shadow-[0_8px_30px_rgba(16,40,63,0.08)] sm:grid-cols-2 sm:p-5 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1fr_auto] lg:items-end">
            <label className={label}>
              College name or place
              <span className="relative block">
                <img src="/udan/search.svg" alt="" width={16} height={16} className="pointer-events-none absolute top-1/2 left-3 mt-[3px] -translate-y-1/2" />
                <input type="search" autoComplete="off" placeholder="e.g. IIT Bombay, engineering Pune" value={text} onChange={(e) => setText(e.target.value)} maxLength={80} className={`${field} pl-9`} />
              </span>
            </label>
            <label className={label}>
              Course
              <select value={teacher} onChange={(e) => set({ teacher: e.target.value })} className={field}>
                <option value="">All courses</option>
                {Object.entries(TEACHER_COURSES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Branch
              <select value={branch} onChange={(e) => set({ branch: e.target.value, course: "" })} className={field}>
                <option value="">All branches</option>
                {Object.entries(branchLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              State or UT
              <select value={state} onChange={(e) => set({ state: e.target.value, city: "" })} className={field}>
                <option value="">All states</option>
                {(states.length ? states : state ? [state] : []).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              City or district
              <select value={city} disabled={!state} onChange={(e) => set({ city: e.target.value })} className={field}>
                <option value="">{state ? "All cities" : "Choose a state first"}</option>
                {(data?.cities ?? []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#10283f] px-5 text-sm font-semibold text-white hover:bg-[#1b3a57] focus-visible:ring-2 focus-visible:ring-[#edbf54] focus-visible:outline-none sm:col-span-2 lg:col-span-1">
              Search colleges
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
          </form>
          <p className={`mt-3 text-xs ${muted}`}>
            Want verified fees, approvals and budget filters?{" "}
            <Link href="/colleges?view=all" className="font-semibold text-[#142b41] underline underline-offset-2">
              Browse with filters
            </Link>
          </p>
        </section>

        {/* College discovery */}
        <div className={`grid gap-6 py-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8 lg:py-10 ${udanGutter}`}>
          <div className="space-y-5">
            <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)} className="flex h-11 w-full items-center justify-between rounded-md border border-[#dfe3e5] px-4 text-sm font-semibold lg:hidden">
              Refine search{branch ? " (1)" : ""}
              <img src="/udan/chevron-down-form.svg" alt="" width={16} height={16} className={filtersOpen ? "rotate-180" : ""} />
            </button>
            <div className={filtersOpen ? "block" : "hidden lg:block"}>{filters}</div>
            <GuidanceCard className="hidden lg:block" />
          </div>

          <section aria-label="Search results" aria-live="polite" className="min-w-0">
            {result.status === "error" ? (
              <div role="alert" className="rounded-[10px] border border-[#f1c6c6] bg-[#fdf3f3] p-5 text-sm">
                <p>{(result.error as ApiError | null)?.message ?? "College search is not available right now."}</p>
                <button type="button" onClick={result.reload} className="mt-3 font-semibold underline">
                  Try again
                </button>
              </div>
            ) : !data ? (
              <div role="status" aria-label="Searching colleges" className="space-y-4">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="h-40 animate-pulse rounded-[10px] bg-[#edf1f4]" />
                ))}
              </div>
            ) : data.status === "loading" ? (
              <div role="status" className="rounded-[10px] bg-[#edf1f4] p-5 text-sm">
                We are fetching the list of colleges in India for the first time. This takes a minute or two.{" "}
                <button type="button" onClick={result.reload} className="font-semibold underline">
                  Check again
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {nf.format(data.total)} {data.total === 1 ? "college" : "colleges"}
                    </h2>
                    <p className={`text-xs ${muted}`}>
                      {data.total ? `Showing ${nf.format(from)}–${nf.format(to)} results` : "No results"}
                      {q ? ` for “${q}”` : ""}
                    </p>
                  </div>
                  <label className={`flex items-center gap-2 text-xs ${muted}`}>
                    Sort by
                    <select value={query.get("order") ?? "relevance"} onChange={(e) => set({ order: e.target.value === "relevance" ? "" : e.target.value })} className="h-9 rounded-md border border-[#dfe3e5] bg-white px-2 text-xs text-[#142b41]">
                      <option value="relevance">Best match</option>
                      <option value="name">Name: A–Z</option>
                    </select>
                  </label>
                </div>
                {chips.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {chips.map((c) => (
                      <Chip key={c.name} name={c.name} onRemove={() => set(c.clear)}>
                        {c.text}
                      </Chip>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setText("");
                        router.replace(pathname, { scroll: false });
                      }}
                      className="text-xs font-semibold underline underline-offset-2"
                    >
                      Clear search
                    </button>
                  </div>
                )}

                {data.total === 0 ? (
                  <div className="mt-5 rounded-[10px] border border-dashed border-[#dfe3e5] p-8 text-center">
                    <p className="font-semibold">No colleges match</p>
                    <p className={`mt-1 text-sm ${muted}`}>Try fewer words, another spelling, or clear a filter.</p>
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    {data.items.map((c) => {
                      const compared = compare.some((x) => x.id === c.id);
                      return (
                        <CollegeCard
                          key={c.id}
                          c={c}
                          branchLabels={branchLabels}
                          courseLabel={teacher ? TEACHER_COURSES[teacher] : undefined}
                          compared={compared}
                          compareFull={compare.length >= COMPARE_MAX}
                          onCompare={() => saveCompare(compared ? compare.filter((x) => x.id !== c.id) : [...compare, c])}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Comparison bar */}
                <div className="mt-5 flex flex-col gap-3 rounded-[10px] bg-[#edf1f4] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="mt-0.5 shrink-0">
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <path d="M12 4v16" />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold">Your choices, side by side.</p>
                      <p className={`text-xs ${muted}`}>Select 2–3 colleges to compare location, study areas and official links.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-xs ${muted}`} aria-live="polite">
                      {compare.length} of {COMPARE_MAX} selected
                    </span>
                    <button type="button" disabled={compare.length < 2} onClick={() => dialog.current?.showModal?.()} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#10283f] bg-white px-3 text-xs font-semibold hover:bg-[#f7f5ef] disabled:cursor-not-allowed disabled:opacity-50">
                      Compare colleges →
                    </button>
                  </div>
                </div>

                {/* Pages */}
                {totalPages > 1 && (
                  <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                    <p className={`text-xs ${muted}`}>
                      Showing {nf.format(from)}–{nf.format(to)} of {nf.format(data.total)}
                    </p>
                    <nav aria-label="Pages" className="flex items-center gap-1 text-xs">
                      <button type="button" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })} className="h-9 rounded-md px-2.5 hover:bg-[#edf1f4] disabled:opacity-40">
                        ← Previous
                      </button>
                      <span className={`px-2 sm:hidden ${muted}`}>
                        Page {page} of {nf.format(totalPages)}
                      </span>
                      {pageList(page, totalPages).map((n, i) =>
                        n === "gap" ? (
                          <span key={`gap-${i}`} aria-hidden="true" className="hidden px-1 sm:inline">
                            …
                          </span>
                        ) : (
                          <button
                            key={n}
                            type="button"
                            aria-current={n === page ? "page" : undefined}
                            aria-label={`Page ${n}`}
                            onClick={() => set({ page: String(n) })}
                            className={`hidden size-9 rounded-md sm:inline-block ${n === page ? "bg-[#10283f] font-semibold text-white" : "hover:bg-[#edf1f4]"}`}
                          >
                            {n}
                          </button>
                        ),
                      )}
                      <button type="button" disabled={page >= totalPages} onClick={() => set({ page: String(page + 1) })} className="h-9 rounded-md px-2.5 hover:bg-[#edf1f4] disabled:opacity-40">
                        Next →
                      </button>
                    </nav>
                  </div>
                )}
              </>
            )}
            <p className={`mt-6 flex items-start gap-2 text-[11px] leading-relaxed ${muted}`}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="mt-px shrink-0">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5M12 8h0" />
              </svg>
              A good shortlist starts with current information. Confirm courses, eligibility, fees and deadlines on each institution’s official website before applying.
              {teacher ? ` ${TEACHER_COURSES[teacher]} colleges are recognised from the college name (for example “B.Ed College” or “College of Education”), so the list may be incomplete; check the course with the college.` : ""}
              {data?.source ? " College list from Wikidata (CC0), community-maintained." : ""}
            </p>
          </section>

          <GuidanceCard className="lg:hidden" />
        </div>
      </main>

      <UdanFooter />

      {/* Side-by-side comparison of the chosen colleges */}
      <dialog ref={dialog} aria-labelledby="udan-compare-title" className="m-auto w-[min(960px,calc(100vw-32px))] rounded-[10px] p-0 backdrop:bg-[#10283f]/60">
        <div className="flex items-center justify-between border-b border-[#dfe3e5] p-4">
          <h2 id="udan-compare-title" className={`${udanDisplay} text-xl`}>
            Your choices, side by side
          </h2>
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Close comparison" className="flex size-9 items-center justify-center rounded-md text-lg hover:bg-[#edf1f4]">
            ×
          </button>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[480px] border-collapse text-left text-xs">
            <thead>
              <tr>
                <th scope="col" className="w-28 p-2" />
                {compare.map((c) => (
                  <th key={c.id} scope="col" className="p-2 align-top text-sm font-semibold">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Location", (c: FinderCollege) => [c.city, c.state].filter(Boolean).join(", ") || "Not listed"],
                ["Study areas", (c: FinderCollege) => c.branches.map((b) => branchLabels[b] ?? b).join(", ") || "Not listed"],
                [
                  "Official website",
                  (c: FinderCollege) => {
                    const site = safeHref(c.website);
                    return site ? (
                      <a href={site} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold underline">
                        Visit ↗
                      </a>
                    ) : (
                      "Not listed"
                    );
                  },
                ],
                [
                  "Next step",
                  (c: FinderCollege) => (
                    <Link href={`/enquire?collegeName=${encodeURIComponent(c.city || c.state ? `${c.name}, ${c.city || c.state}` : c.name)}&source=college_search`} className="font-semibold underline">
                      Enquire now
                    </Link>
                  ),
                ],
                [
                  "",
                  (c: FinderCollege) => (
                    <button type="button" onClick={() => saveCompare(compare.filter((x) => x.id !== c.id))} className={`underline ${muted}`}>
                      Remove
                    </button>
                  ),
                ],
              ].map(([rowLabel, cell]) => (
                <tr key={rowLabel as string} className="border-t border-[#edf1f4]">
                  <th scope="row" className={`p-2 align-top font-semibold ${muted}`}>
                    {rowLabel as string}
                  </th>
                  {compare.map((c) => (
                    <td key={c.id} className="p-2 align-top">
                      {(cell as (c: FinderCollege) => ReactNode)(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </dialog>
    </div>
  );
}
