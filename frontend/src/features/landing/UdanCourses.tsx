"use client";

/* eslint-disable @next/next/no-img-element -- local photos and SVG icons from the client design */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useApiData } from "@/hooks/useApiData";
import { COURSE_LEVELS, durationLabel, fmtDay, formatINR } from "@/lib/format";
import { api } from "@/services/api";
import type { ApiError, PageMeta } from "@/types/api";
import type { BrowseOffering } from "@/types/catalog";
import { enquiryHref } from "@/features/catalog/CatalogUi";
import { MODE_LABELS, QUALIFICATION_LABELS } from "@/features/catalog/CollegeExtras";
import { browseQuery } from "@/features/catalog/CourseBrowser";
import { pageList } from "./UdanColleges";
import { UdanFooter, UdanHeader, hideSiteChrome, udanDisplay, udanFonts, udanGutter } from "./UdanChrome";
import { STATES } from "./UdanSearch";

// /courses in the Udaan design ("Udaan · Browse courses"): every active course at published colleges
// (GET /api/courses/offerings) with the degree, mode, place, fee and qualification filters.

const FEE_STEPS = [
  ["50000", "₹50,000"],
  ["100000", "₹1 lakh"],
  ["200000", "₹2 lakh"],
  ["500000", "₹5 lakh"],
  ["1000000", "₹10 lakh"],
] as const;
const DEBOUNCE_MS = 400;

const ink = "text-[#142b41]";
const muted = "text-[#5c6974]";
const field = "mt-1.5 h-10 w-full rounded-md border border-[#dfe3e5] bg-white px-2.5 text-sm text-[#142b41] focus:border-[#10283f] focus:ring-2 focus:ring-[#edbf54]/40 focus:outline-none";
const label = "block text-[11px] font-semibold text-[#142b41]";

function Icon({ d, size = 16, className = "" }: { d: ReactNode; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {d}
    </svg>
  );
}
const searchIcon = (
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>
);
const resetIcon = <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />;

function OfferingCard({ o }: { o: BrowseOffering }) {
  const yearly = o.fee?.yearlyMinor ?? null;
  const place = [o.college.city, o.college.state].filter(Boolean).join(", ");
  const eligibility = [o.minQualification && QUALIFICATION_LABELS[o.minQualification], o.minPercentage != null && `${o.minPercentage}%+`].filter(Boolean).join(", ");
  return (
    <article className="flex flex-col rounded-[10px] border border-[#dfe3e5] bg-white p-4 sm:p-5">
      <h3 className="text-[15px] leading-snug font-semibold">
        {o.course.name}
        {o.specialization && <span className={`font-normal ${muted}`}> · {o.specialization}</span>}
      </h3>
      <p className="mt-1 text-sm">
        <Link href={`/colleges/${o.college.slug}`} className="hover:underline">
          {o.college.name}
        </Link>
      </p>
      {place && (
        <p className={`mt-1 flex items-center gap-1 text-xs ${muted}`}>
          <img src="/udan/map-pin.svg" alt="" width={14} height={14} />
          {place}
        </p>
      )}
      <p className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-medium">
        {[COURSE_LEVELS[o.course.level] ?? o.course.level, MODE_LABELS[o.mode], durationLabel(o.durationMonths)].map((t) => (
          <span key={t} className="rounded bg-[#edf1f4] px-2 py-0.5">
            {t}
          </span>
        ))}
        {o.college.isSample && <span className="rounded bg-[#faf0d6] px-2 py-0.5 text-[#6b5114]">Sample data</span>}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className={muted}>Fees</dt>
          <dd className="font-semibold">{o.fee ? (yearly != null ? `${formatINR(yearly)} / year` : `${formatINR(o.fee.totalMinor)} total`) : "Not published"}</dd>
        </div>
        <div>
          <dt className={muted}>Eligibility</dt>
          <dd>{eligibility || "Ask us"}</dd>
        </div>
        {o.entranceExams.length > 0 && (
          <div>
            <dt className={muted}>Entrance exams</dt>
            <dd>{o.entranceExams.join(", ")}</dd>
          </div>
        )}
        {o.applicationDeadline && (
          <div>
            <dt className={muted}>Apply by</dt>
            <dd>{fmtDay(o.applicationDeadline)}</dd>
          </div>
        )}
      </dl>
      <div className="mt-auto flex flex-wrap gap-2 pt-4 text-xs font-semibold">
        <Link href={`/colleges/${o.college.slug}`} className="inline-flex h-9 items-center rounded-md border border-[#dfe3e5] px-3 hover:bg-[#f7f5ef]">
          View details<span className="sr-only"> of {o.college.name}</span>
        </Link>
        <Link href={enquiryHref(o.college.slug, o.course.slug)} className="inline-flex h-9 items-center gap-2 rounded-md bg-[#edbf54] px-3 hover:bg-[#e5b23d]">
          Enquire now
          <img src="/udan/arrow-gold-btn.svg" alt="" width={14} height={14} />
          <span className="sr-only">
            about {o.course.name} at {o.college.name}
          </span>
        </Link>
      </div>
    </article>
  );
}

function NoCourses({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-[10px] border border-[#dfe3e5] bg-white">
      <div className="flex flex-col items-center px-4 py-10 text-center sm:px-10">
        <svg viewBox="0 0 120 80" width="120" height="80" fill="none" stroke="#142b41" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 18c10-4 22-4 32 2v46c-10-6-22-6-32-2zM46 20c10-6 22-6 32-2v46c-10-4-22-4-32 2" />
          <path d="M22 30h16M22 38h16M22 46h12M54 30h16M54 38h10" stroke="#9aa5ae" />
          <circle cx="84" cy="52" r="11" fill="white" />
          <path d="m92 60 9 9" strokeWidth="2.4" />
          <path d="M98 14v6M95 17h6" stroke="#edbf54" />
        </svg>
        <h3 className={`${udanDisplay} mt-4 text-xl`}>No courses match</h3>
        <p className={`mt-2 max-w-md text-xs leading-relaxed ${muted}`}>Try fewer filters or a broader search. Our verified course list is growing; you can also explore colleges across India.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs font-semibold">
          <button type="button" onClick={onClear} className="inline-flex h-9 items-center gap-2 rounded-md bg-[#10283f] px-4 text-white hover:bg-[#1b3a57]">
            Clear filters
            <Icon d={resetIcon} size={14} />
          </button>
          <Link href="/colleges" className="inline-flex h-9 items-center rounded-md border border-[#dfe3e5] px-4 hover:bg-[#f7f5ef]">
            Search all colleges ↗
          </Link>
        </div>
      </div>
      <div className="grid gap-4 border-t border-[#edf1f4] p-4 text-xs sm:grid-cols-2 sm:px-6">
        <p className="flex items-start gap-2">
          <Icon d={searchIcon} size={14} className="mt-0.5 shrink-0" />
          <span>
            <span className="block font-semibold">Keep your search broad</span>
            <span className={muted}>Try a degree name instead of a specialisation.</span>
          </span>
        </p>
        <p className="flex items-start gap-2">
          <Icon d={<path d="M4 6h16M7 12h10M10 18h4" />} size={14} className="mt-0.5 shrink-0" />
          <span>
            <span className="block font-semibold">Give yourself more options</span>
            <span className={muted}>Try another city, study mode or fee limit.</span>
          </span>
        </p>
      </div>
    </div>
  );
}

export default function UdanCourses() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = browseQuery(new URLSearchParams(params.toString()));
  const key = query.toString();
  const q = query.get("q") ?? "";
  const cityParam = query.get("city") ?? "";
  const [text, setText] = useState(q);
  const [city, setCity] = useState(cityParam);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // The boxes follow the URL (back button, links from other pages).
  useEffect(() => setText(q), [q]);
  useEffect(() => setCity(cityParam), [cityParam]);

  const set = (changes: Record<string, string>) => {
    const next = browseQuery(new URLSearchParams(params.toString()));
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in changes)) next.delete("page");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: "page" in changes });
  };
  const clear = () => {
    setText("");
    setCity("");
    router.replace(pathname, { scroll: false });
  };
  // The city filter follows the typing after a short pause.
  useEffect(() => {
    if (city.trim() === cityParam) return;
    const t = setTimeout(() => set({ city: city.trim() }), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the typed city starts a search
  }, [city]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    set({ q: text.trim() });
  };

  const result = useApiData(
    async (signal) => {
      const { data, meta } = await api<BrowseOffering[]>("GET", `/courses/offerings?${key}`, { signal });
      return { items: data, meta: meta as PageMeta };
    },
    [key],
  );
  const data = result.data;
  const activeFilters = ["level", "mode", "state", "city", "maxFee", "qualification"].filter((k) => query.get(k)).length;

  const select = (name: string, labelText: string, options: ReadonlyArray<readonly [string, string]>, any: string) => (
    <label className={label}>
      {labelText}
      <select value={query.get(name) ?? ""} onChange={(e) => set({ [name]: e.target.value })} className={field}>
        <option value="">{any}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div id="udan" className={`${udanFonts} min-h-screen bg-white ${ink}`}>
      <style>{hideSiteChrome}</style>
      <UdanHeader active="/courses" />

      <main id="main">
        {/* Course search */}
        <section aria-labelledby="udan-courses-title" className={`bg-[#f7f5ef] pt-6 pb-10 ${udanGutter}`}>
          <nav aria-label="Breadcrumb" className={`text-[11px] ${muted}`}>
            <ol className="flex items-center gap-2">
              <li>
                <Link href="/" className="hover:underline">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">›</li>
              <li aria-current="page" className="font-semibold text-[#142b41]">
                Explore courses
              </li>
            </ol>
          </nav>
          <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className={`text-[11px] font-bold tracking-[1.8px] ${muted}`}>YOUR INTERESTS. YOUR NEXT CHAPTER.</p>
              <h1 id="udan-courses-title" className={`${udanDisplay} mt-3 text-3xl leading-tight sm:text-[38px]`}>
                Browse courses at colleges
              </h1>
              <p className={`mt-3 text-sm leading-relaxed ${muted}`}>Explore programmes, fees and eligibility. Find a path that feels right for you.</p>
            </div>
            <Link href="/colleges" className="flex shrink-0 items-center gap-3 rounded-md text-xs hover:underline">
              <span className="flex size-9 items-center justify-center rounded-md bg-white">
                <Icon d={<path d="M3 21h18M5 21V10M19 21V10M9 21v-7M15 21v-7M2 10l10-6 10 6" />} size={18} />
              </span>
              <span>
                <span className={`block ${muted}`}>Have a college in mind?</span>
                <span className="font-semibold">Search all colleges ↗</span>
              </span>
            </Link>
          </div>
          <form role="search" aria-label="Search courses" onSubmit={submit} className="mt-8 flex flex-col gap-3 rounded-[10px] bg-white p-3 shadow-[0_8px_30px_rgba(16,40,63,0.08)] sm:flex-row sm:items-center">
            <label className="relative block flex-1">
              <span className="sr-only">Course or college</span>
              <img src="/udan/search.svg" alt="" width={16} height={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" />
              <input type="search" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} maxLength={80} placeholder="Search course or college, e.g. B.Tech, MBA, college name" className="h-11 w-full rounded-md border border-transparent bg-white pr-3 pl-9 text-sm focus:border-[#10283f] focus:ring-2 focus:ring-[#edbf54]/40 focus:outline-none" />
            </label>
            <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#10283f] px-5 text-sm font-semibold text-white hover:bg-[#1b3a57] focus-visible:ring-2 focus-visible:ring-[#edbf54] focus-visible:outline-none">
              Search courses
              <Icon d={searchIcon} />
            </button>
          </form>
        </section>

        {/* Course discovery */}
        <div className={`grid gap-6 py-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8 lg:py-10 ${udanGutter}`}>
          <div>
            <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)} className="flex h-11 w-full items-center justify-between rounded-md border border-[#dfe3e5] px-4 text-sm font-semibold lg:hidden">
              Refine search{activeFilters ? ` (${activeFilters})` : ""}
              <img src="/udan/chevron-down-form.svg" alt="" width={16} height={16} className={filtersOpen ? "rotate-180" : ""} />
            </button>
            <form aria-label="Refine search" onSubmit={(e) => e.preventDefault()} className={`${filtersOpen ? "mt-4 block" : "hidden"} space-y-4 rounded-[10px] border border-[#dfe3e5] bg-white p-4 lg:mt-0 lg:block`}>
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Icon d={<path d="M4 6h16M7 12h10M10 18h4" />} />
                  Refine search
                </p>
                <button type="button" onClick={clear} className={`text-xs hover:underline ${muted}`}>
                  Clear all
                </button>
              </div>
              {select("level", "Degree", Object.entries(COURSE_LEVELS), "All degrees")}
              {select("mode", "Mode of study", Object.entries(MODE_LABELS), "Any mode")}
              {select("state", "State or UT", STATES.map((s) => [s, s] as const), "All states")}
              <label className={label}>
                City
                <span className="relative block">
                  <img src="/udan/map-pin.svg" alt="" width={14} height={14} className="pointer-events-none absolute top-1/2 left-2.5 mt-[3px] -translate-y-1/2" />
                  <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} placeholder="e.g. Pune" className={`${field} pl-7`} />
                </span>
              </label>
              {select("maxFee", "Annual fee limit", FEE_STEPS, "Any fee")}
              {select(
                "qualification",
                "My qualification",
                Object.entries(QUALIFICATION_LABELS).filter(([v]) => v !== "other"),
                "Any",
              )}
              <button type="button" onClick={clear} className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#dfe3e5] text-xs font-semibold hover:bg-[#f7f5ef]">
                <Icon d={resetIcon} size={14} />
                Clear filters
              </button>
            </form>
          </div>

          <section aria-label="Courses found" aria-live="polite" className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{data ? `${data.meta.total} ${data.meta.total === 1 ? "course" : "courses"} found` : "Courses"}</h2>
                <p className={`text-xs ${muted}`}>{data ? (data.meta.total ? "Fees are the colleges’ official published fees; our service charge is separate." : "No matching courses to display right now") : "Loading courses…"}</p>
              </div>
              <label className={`flex items-center gap-2 text-xs ${muted}`}>
                Sort by
                <select value={query.get("sort") ?? "name"} onChange={(e) => set({ sort: e.target.value === "name" ? "" : e.target.value })} className="h-9 rounded-md border border-[#dfe3e5] bg-white px-2 text-xs text-[#142b41]">
                  <option value="name">Name: A–Z</option>
                  <option value="fee">Lowest fee</option>
                  <option value="deadline">Nearest deadline</option>
                </select>
              </label>
            </div>

            {result.status === "error" ? (
              <div role="alert" className="rounded-[10px] border border-[#f1c6c6] bg-[#fdf3f3] p-5 text-sm">
                <p>{(result.error as ApiError | null)?.message ?? "Courses could not be loaded."}</p>
                <button type="button" onClick={result.reload} className="mt-3 font-semibold underline">
                  Try again
                </button>
              </div>
            ) : !data ? (
              <div role="status" aria-label="Loading courses" className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="h-48 animate-pulse rounded-[10px] bg-[#edf1f4]" />
                ))}
              </div>
            ) : data.items.length === 0 ? (
              <NoCourses onClear={clear} />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  {data.items.map((o) => (
                    <OfferingCard key={o.id} o={o} />
                  ))}
                </div>
                {data.meta.totalPages > 1 && (
                  <nav aria-label="Pages" className="flex items-center justify-center gap-1 text-xs">
                    <button type="button" disabled={data.meta.page <= 1} onClick={() => set({ page: String(data.meta.page - 1) })} className="h-9 rounded-md px-2.5 hover:bg-[#edf1f4] disabled:opacity-40">
                      ← Previous
                    </button>
                    <span className={`px-2 sm:hidden ${muted}`}>
                      Page {data.meta.page} of {data.meta.totalPages}
                    </span>
                    {pageList(data.meta.page, data.meta.totalPages).map((n, i) =>
                      n === "gap" ? (
                        <span key={`gap-${i}`} aria-hidden="true" className="hidden px-1 sm:inline">
                          …
                        </span>
                      ) : (
                        <button key={n} type="button" aria-current={n === data.meta.page ? "page" : undefined} aria-label={`Page ${n}`} onClick={() => set({ page: String(n) })} className={`hidden size-9 rounded-md sm:inline-block ${n === data.meta.page ? "bg-[#10283f] font-semibold text-white" : "hover:bg-[#edf1f4]"}`}>
                          {n}
                        </button>
                      ),
                    )}
                    <button type="button" disabled={data.meta.page >= data.meta.totalPages} onClick={() => set({ page: String(data.meta.page + 1) })} className="h-9 rounded-md px-2.5 hover:bg-[#edf1f4] disabled:opacity-40">
                      Next →
                    </button>
                  </nav>
                )}
              </>
            )}

            {/* Counselling banner */}
            <aside aria-label="Counselling" className="flex flex-col overflow-hidden rounded-[10px] bg-[#10283f] text-white sm:flex-row">
              <img src="/udan/counselling.jpg" alt="" className="h-44 w-full object-cover sm:h-auto sm:w-[200px] lg:w-[240px]" />
              <div className="p-5 sm:p-6">
                <p className="text-[10px] font-bold tracking-[1.8px] text-[#edbf54]">LET’S FIND YOUR WAY FORWARD</p>
                <p className={`${udanDisplay} mt-2 text-xl leading-snug`}>Your next step starts with a conversation.</p>
                <p className="mt-2 text-xs text-[#c8d2da]">Get help with course choices, eligibility and the admission process.</p>
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <Link href="/enquire" className="inline-flex h-10 items-center gap-2 rounded-md bg-[#edbf54] px-4 text-xs font-semibold text-[#142b41] hover:bg-[#e5b23d]">
                    Enquire for admission
                    <img src="/udan/arrow-gold-btn.svg" alt="" width={14} height={14} />
                  </Link>
                  <span className="text-[10px] text-[#c8d2da]">Support, not admission promises.</span>
                </div>
              </div>
            </aside>

            <p className={`flex items-start gap-2 text-[11px] leading-relaxed ${muted}`}>
              <Icon d={<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h0" /></>} size={14} className="mt-px shrink-0" />
              Before applying, confirm current courses, eligibility, fees and deadlines on the institution’s official website.
            </p>
          </section>
        </div>
      </main>

      <UdanFooter />
    </div>
  );
}
