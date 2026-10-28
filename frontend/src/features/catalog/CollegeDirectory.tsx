"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Alert, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { Pager } from "@/features/admin/shared";
import { useApiData } from "@/hooks/useApiData";
import { COLLEGE_TYPES } from "@/lib/format";
import { api, apiGet } from "@/services/api";
import type { PageMeta } from "@/types/api";
import type { CollegeCard as Card, Course, Location } from "@/types/catalog";
import { CollegeCard, CompareTray, SAMPLE_LABEL } from "./CatalogUi";

const BUDGETS = [
  ["", "Any budget"],
  ["300000", "Up to ₹3 lakh"],
  ["600000", "Up to ₹6 lakh"],
  ["1000000", "Up to ₹10 lakh"],
  ["2000000", "Up to ₹20 lakh"],
  ["5000000", "Up to ₹50 lakh"],
] as const;
const SORTS = [
  ["featured", "Featured first"],
  ["name", "Name (A–Z)"],
  ["fee_low", "Fees: low to high"],
  ["fee_high", "Fees: high to low"],
  ["recently_verified", "Recently verified"],
] as const;
// URL parameters (budget is in rupees in the URL; the API takes paise).
const KEYS = ["q", "course", "location", "type", "budget", "percentage", "scholarship", "sort", "page"] as const;
type Filters = Record<(typeof KEYS)[number], string>;

export function readFilters(params: URLSearchParams): Filters {
  return Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? ""])) as Filters;
}

// The API query for the current filters. Invalid values are dropped rather than sent.
export function apiQuery(f: Filters) {
  const q = new URLSearchParams();
  if (f.q.trim()) q.set("q", f.q.trim().slice(0, 80));
  if (/^[a-z0-9-]+$/.test(f.course)) q.set("course", f.course);
  if (/^[a-z0-9-]+$/.test(f.location)) q.set("location", f.location);
  if (f.type in COLLEGE_TYPES) q.set("type", f.type);
  if (/^\d+$/.test(f.budget)) q.set("maxBudget", String(Number(f.budget) * 100));
  if (/^\d+(\.\d+)?$/.test(f.percentage) && Number(f.percentage) <= 100) q.set("percentage", f.percentage);
  if (f.scholarship === "yes") q.set("scholarship", "yes");
  if (SORTS.some(([v]) => v === f.sort)) q.set("sort", f.sort);
  if (/^\d+$/.test(f.page) && Number(f.page) > 1) q.set("page", f.page);
  q.set("limit", "12");
  return q.toString();
}

const control = "w-full min-h-11 rounded-xl border border-line bg-surface px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

function LocationOptions({ locations }: { locations: Location[] }) {
  const groups: Array<[string, Location["kind"]]> = [
    ["Regions", "region"],
    ["States", "state"],
    ["Cities", "city"],
  ];
  return (
    <>
      {groups.map(([label, kind]) => (
        <optgroup key={kind} label={label}>
          {locations
            .filter((l) => l.kind === kind)
            .map((l) => (
              <option key={l.id} value={l.slug}>
                {l.name}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );
}

export default function CollegeDirectory() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = readFilters(new URLSearchParams(params.toString()));
  const query = apiQuery(filters);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState({ q: filters.q, percentage: filters.percentage, key: params.toString() });
  // Keep the typed fields in step when the URL changes (back/forward, hero search).
  if (text.key !== params.toString()) setText({ q: filters.q, percentage: filters.percentage, key: params.toString() });

  const options = useApiData(async (signal) => {
    const [locations, courses] = await Promise.all([apiGet<Location[]>("/locations", { signal }), apiGet<Course[]>("/courses", { signal })]);
    return { locations, courses };
  }, []);
  const results = useApiData(async (signal) => {
    const { data, meta } = await api<Card[]>("GET", `/colleges?${query}`, { signal });
    return { items: data, meta: meta as PageMeta & { hasSamples: boolean } };
  }, [query]);

  function apply(changes: Partial<Filters>) {
    const next = { ...filters, ...changes, page: changes.page ?? "" };
    const q = new URLSearchParams(Object.entries(next).filter(([, v]) => v !== ""));
    router.replace(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false });
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    apply({ q: text.q.trim(), percentage: text.percentage.trim() });
    setOpen(false);
  }
  const active = KEYS.filter((k) => k !== "page" && k !== "sort" && filters[k]).length;

  const panel = (
    <form onSubmit={submit} role="search" aria-label="Filter colleges" className="space-y-4">
      <label className="block text-sm font-medium">
        Search
        <input className={`${control} mt-1.5`} type="search" placeholder="College, city or course" value={text.q} onChange={(e) => setText({ ...text, q: e.target.value })} maxLength={80} />
      </label>
      <label className="block text-sm font-medium">
        Course
        <select className={`${control} mt-1.5`} value={filters.course} onChange={(e) => apply({ course: e.target.value })}>
          <option value="">All courses</option>
          {options.data?.courses.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        Location
        <select className={`${control} mt-1.5`} value={filters.location} onChange={(e) => apply({ location: e.target.value })}>
          <option value="">Anywhere in India</option>
          {options.data && <LocationOptions locations={options.data.locations} />}
        </select>
      </label>
      <label className="block text-sm font-medium">
        College type
        <select className={`${control} mt-1.5`} value={filters.type} onChange={(e) => apply({ type: e.target.value })}>
          <option value="">Any type</option>
          {Object.entries(COLLEGE_TYPES).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        Budget (official fees, whole course)
        <select className={`${control} mt-1.5`} value={filters.budget} onChange={(e) => apply({ budget: e.target.value })}>
          {BUDGETS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        My percentage
        <input className={`${control} mt-1.5`} inputMode="decimal" placeholder="e.g. 72" value={text.percentage} onChange={(e) => setText({ ...text, percentage: e.target.value })} />
        <span className="mt-1 block text-xs font-normal text-muted">Shows colleges whose published minimum you meet.</span>
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="size-4" checked={filters.scholarship === "yes"} onChange={(e) => apply({ scholarship: e.target.checked ? "yes" : "" })} />
        Offers scholarships
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Apply
        </Button>
        {active > 0 && (
          <Button size="sm" variant="ghost" onClick={() => router.replace(pathname, { scroll: false })}>
            Clear all
          </Button>
        )}
      </div>
    </form>
  );

  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <p className="text-sm font-semibold tracking-widest text-accent-text uppercase">Colleges</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Explore colleges</h1>
      <p className="mt-2 max-w-2xl text-muted">Filter by course, location, budget and your marks. Fees shown are the colleges’ official fees; our service charge is always listed separately.</p>

      {results.data?.meta.hasSamples && (
        <div className="mt-5">
          <Alert tone="warning" title="This directory currently includes sample data">
            Colleges marked “{SAMPLE_LABEL}” are fictional examples with illustrative fees. Do not use them to make decisions.
          </Alert>
        </div>
      )}

      <div className="mt-6 lg:grid lg:grid-cols-[17rem_1fr] lg:gap-8">
        <div>
          <Button variant="secondary" className="w-full lg:hidden" aria-expanded={open} aria-controls="filters" onClick={() => setOpen(!open)}>
            {open ? "Hide filters" : `Filters${active ? ` (${active})` : ""}`}
          </Button>
          <div id="filters" className={`${open ? "mt-4 block" : "hidden"} rounded-2xl border border-line bg-surface p-4 lg:sticky lg:top-24 lg:mt-0 lg:block`}>
            {panel}
          </div>
        </div>

        <section aria-label="Results" className="mt-6 min-w-0 lg:mt-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted" aria-live="polite">
              {results.data ? `${results.data.meta.total} college${results.data.meta.total === 1 ? "" : "s"} found` : "Searching…"}
            </p>
            <label className="flex items-center gap-2 text-sm">
              Sort
              <select className={`${control} w-auto`} value={filters.sort || "featured"} onChange={(e) => apply({ sort: e.target.value === "featured" ? "" : e.target.value })}>
                {SORTS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {results.status === "error" ? (
            <div className="space-y-3">
              <Alert>{results.error?.message ?? "Could not load colleges."}</Alert>
              <Button size="sm" variant="secondary" onClick={results.reload}>
                Try again
              </Button>
            </div>
          ) : !results.data ? (
            <div role="status" aria-label="Loading colleges" className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : results.data.items.length === 0 ? (
            <EmptyState title="No colleges match these filters">Try a wider location, a higher budget, or clear some filters.</EmptyState>
          ) : (
            <>
              <div className={`grid gap-4 md:grid-cols-2 ${results.status === "loading" ? "opacity-60" : ""}`}>
                {results.data.items.map((c) => (
                  <CollegeCard key={c.id} college={c} />
                ))}
              </div>
              <Pager meta={results.data.meta} onPage={(p) => apply({ ...filters, page: String(p) })} />
            </>
          )}
        </section>
      </div>
      <CompareTray />
    </main>
  );
}
