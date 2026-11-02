"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Alert, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { Pager } from "@/features/admin/shared";
import { useApiData } from "@/hooks/useApiData";
import { CATEGORIES, COLLEGE_TYPES, OWNERSHIP, fmtDay, formatLakh } from "@/lib/format";
import { api, apiGet } from "@/services/api";
import type { CollegeCard as Card, Course, DirectoryCoverage, DirectoryFilters, DirectoryMeta, District, Location } from "@/types/catalog";
import { CollegeCard, CompareTray, SAMPLE_LABEL } from "./CatalogUi";
import { ExternalResults } from "./ExternalResults";
import { useRecent } from "./recent";

// Budget presets in rupees, per basis.
const BUDGETS = {
  total: [300000, 600000, 1000000, 2000000, 5000000],
  annual: [100000, 200000, 300000, 500000, 1000000],
} as const;
const HOSTEL = [50000, 100000, 150000, 200000] as const;
const SORTS = [
  ["featured", "Most detailed first"],
  ["name", "Name (A–Z)"],
  ["fee_low", "Fees: low to high"],
  ["fee_high", "Fees: high to low"],
  ["recently_verified", "Recently verified"],
  ["recently_updated", "Recently updated"],
] as const;
// URL parameters. Money is in rupees in the URL; the API takes paise.
const KEYS = ["q", "course", "location", "state", "district", "type", "ownership", "category", "approval", "basis", "min", "budget", "maxHostel", "unverified", "percentage", "scholarship", "hostel", "sort", "page", "view"] as const;
type Key = (typeof KEYS)[number];
type Filters = Record<Key, string>;

export function readFilters(params: URLSearchParams): Filters {
  return Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? ""])) as Filters;
}

const isSlug = (v: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v);
const isRupees = (v: string) => /^\d{1,9}$/.test(v);

// The API query for the current filters. Invalid values are dropped rather than sent.
export function apiQuery(f: Filters) {
  const q = new URLSearchParams();
  if (f.q.trim()) q.set("q", f.q.trim().slice(0, 80));
  if (isSlug(f.course)) q.set("course", f.course);
  if (isSlug(f.location)) q.set("location", f.location);
  if (isSlug(f.state)) q.set("state", f.state);
  if (isSlug(f.state) && /^[a-z0-9-]{2,80}$/.test(f.district)) q.set("district", f.district);
  if (f.type in COLLEGE_TYPES) q.set("type", f.type);
  if (f.ownership in OWNERSHIP) q.set("ownership", f.ownership);
  if (f.category in CATEGORIES) q.set("category", f.category);
  if (/^[A-Z]{2,10}$/.test(f.approval)) q.set("approval", f.approval);
  if (f.basis === "annual") q.set("feeBasis", "annual");
  const max = isRupees(f.budget) ? Number(f.budget) : null;
  const min = isRupees(f.min) && Number(f.min) > 0 && (max == null || Number(f.min) <= max) ? Number(f.min) : null;
  if (min != null) q.set("minBudget", String(min * 100));
  if (max != null) q.set("maxBudget", String(max * 100));
  if (isRupees(f.maxHostel)) q.set("maxHostel", String(Number(f.maxHostel) * 100));
  if (f.unverified === "yes" && (min != null || max != null || isRupees(f.maxHostel))) q.set("includeUnverified", "yes");
  if (/^\d+(\.\d+)?$/.test(f.percentage) && Number(f.percentage) <= 100) q.set("percentage", f.percentage);
  if (f.scholarship === "yes") q.set("scholarship", "yes");
  if (f.hostel === "yes") q.set("hostel", "yes");
  if (SORTS.some(([v]) => v === f.sort)) q.set("sort", f.sort);
  if (/^\d+$/.test(f.page) && Number(f.page) > 1) q.set("page", f.page);
  q.set("limit", "12");
  return q.toString();
}

const control = "w-full min-h-11 rounded-xl border border-line bg-surface px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60";
const lakh = (rupees: number) => formatLakh(rupees * 100);

function LocationOptions({ locations }: { locations: Location[] }) {
  const groups: Array<[string, Location["kind"]]> = [
    ["Regions", "region"],
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

// What the directory holds, stated plainly: it never claims to list every institution in India.
export function CoverageNote({ coverage }: { coverage: DirectoryCoverage }) {
  const sources = coverage.sources.map((s) => s.name).join(", ");
  return (
    <Alert tone="info" title={coverage.partial ? "This directory is still growing" : "About this directory"}>
      <p>
        {coverage.total.toLocaleString("en-IN")} institution{coverage.total === 1 ? "" : "s"} across {coverage.statesCovered} of {coverage.statesTotal} states and union territories
        {sources ? `, from ${sources}` : ""}
        {coverage.lastImportAt ? ` (last updated ${fmtDay(coverage.lastImportAt)})` : ""}.{coverage.partial && " Not every institution in India is listed yet."}
      </p>
      <p className="mt-1">Verified fees are available for {coverage.withVerifiedFees.toLocaleString("en-IN")} of them; the rest show “Fee not verified”. Courses and fees of basic listings have not been checked yet.</p>
    </Alert>
  );
}

export default function CollegeDirectory() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = readFilters(new URLSearchParams(params.toString()));
  const query = apiQuery(filters);
  const [open, setOpen] = useState(false);
  const fromUrl = () => ({ q: filters.q, percentage: filters.percentage, min: filters.min, max: filters.budget, key: params.toString() });
  const [text, setText] = useState(fromUrl);
  // Keep the typed fields in step when the URL changes (back/forward, hero search).
  if (text.key !== params.toString()) setText(fromUrl());

  const basis = filters.basis === "annual" ? "annual" : "total";
  const presets: readonly number[] = BUDGETS[basis];
  const [custom, setCustom] = useState(Boolean(filters.min) || Boolean(filters.budget && !presets.includes(Number(filters.budget))));

  const options = useApiData(async (signal) => {
    const [locations, courses, directory] = await Promise.all([
      apiGet<Location[]>("/locations", { signal }),
      apiGet<Course[]>("/courses", { signal }),
      apiGet<DirectoryFilters>("/colleges/filters", { signal }).catch(() => null),
    ]);
    return { locations, courses, directory };
  }, []);
  const districts = useApiData(async (signal) => (isSlug(filters.state) ? apiGet<District[]>(`/colleges/districts?state=${filters.state}`, { signal }) : []), [filters.state]);
  const results = useApiData(async (signal) => {
    const { data, meta } = await api<Card[]>("GET", `/colleges?${query}`, { signal });
    return { items: data, meta: meta as DirectoryMeta };
  }, [query]);

  function apply(changes: Partial<Filters>) {
    const next = { ...filters, ...changes, page: changes.page ?? "" };
    const q = new URLSearchParams(Object.entries(next).filter(([, v]) => v !== ""));
    router.replace(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false });
  }

  // The name search updates the results as the student types, after a short pause.
  useEffect(() => {
    const typed = text.q.trim();
    if (typed === filters.q.trim()) return;
    const t = setTimeout(() => apply({ q: typed }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the typed text starts a search
  }, [text.q]);

  function submit(e: FormEvent) {
    e.preventDefault();
    apply({ q: text.q.trim(), percentage: text.percentage.trim(), ...(custom && { min: text.min.replace(/\D/g, ""), budget: text.max.replace(/\D/g, "") }) });
    setOpen(false);
  }

  const directory = Array.isArray(options.data?.directory) ? null : (options.data?.directory ?? null);
  const states = directory?.states ?? [];
  const budgetSet = Boolean(filters.budget || filters.min || filters.maxHostel);
  const perBasis = basis === "annual" ? "per year" : "whole course";

  // Active filters as removable chips.
  const nameOf = (list: Array<{ slug: string; name: string }> | undefined, slug: string) => (Array.isArray(list) ? list.find((x) => x.slug === slug)?.name : undefined) ?? slug;
  const chips: Array<{ key: string; label: string; clear: Partial<Filters> }> = [];
  const chip = (key: string, label: string, clear: Partial<Filters>) => chips.push({ key, label, clear });
  if (filters.q) chip("q", `“${filters.q}”`, { q: "" });
  if (filters.course) chip("course", nameOf(options.data?.courses, filters.course), { course: "" });
  if (filters.location) chip("location", nameOf(options.data?.locations, filters.location), { location: "" });
  if (filters.state) chip("state", nameOf(states, filters.state), { state: "", district: "" });
  if (filters.district) chip("district", nameOf(districts.data, filters.district), { district: "" });
  if (filters.type) chip("type", COLLEGE_TYPES[filters.type] ?? filters.type, { type: "" });
  if (filters.ownership) chip("ownership", OWNERSHIP[filters.ownership] ?? filters.ownership, { ownership: "" });
  if (filters.category) chip("category", CATEGORIES[filters.category] ?? filters.category, { category: "" });
  if (filters.approval) chip("approval", `${filters.approval} approved`, { approval: "" });
  if (filters.min || filters.budget) {
    const range = filters.min && filters.budget ? `${lakh(Number(filters.min))}–${lakh(Number(filters.budget))}` : filters.budget ? `Up to ${lakh(Number(filters.budget))}` : `From ${lakh(Number(filters.min))}`;
    chip("budget", `${range} ${perBasis}`, { min: "", budget: "" });
  }
  if (filters.maxHostel) chip("maxHostel", `Hostel up to ${lakh(Number(filters.maxHostel))} a year`, { maxHostel: "" });
  if (filters.unverified === "yes" && budgetSet) chip("unverified", "Including colleges without verified fees", { unverified: "" });
  if (filters.percentage) chip("percentage", `My marks: ${filters.percentage}%`, { percentage: "" });
  if (filters.scholarship) chip("scholarship", "Offers scholarships", { scholarship: "" });
  if (filters.hostel) chip("hostel", "Hostel available", { hostel: "" });
  const clearAll = () => {
    setCustom(false);
    router.replace(pathname, { scroll: false });
  };

  const select = (label: string, key: Key, items: Array<[string, string]>, any: string, extra: Partial<Filters> = {}, disabled = false) => (
    <label className="block text-sm font-medium">
      {label}
      <select className={`${control} mt-1.5`} value={filters[key]} disabled={disabled} onChange={(e) => apply({ [key]: e.target.value, ...extra })}>
        <option value="">{any}</option>
        {items.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );

  const coverage = results.data?.meta.coverage ?? directory?.coverage;

  // The budget filter is offered only when the directory holds verified fees to compare (or one is already set).
  const showBudget = (coverage?.withVerifiedFees ?? 0) > 0 || budgetSet;
  const heroInput = "w-full min-h-11 rounded-xl border border-line bg-surface px-3 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60";
  const heroSelect = (label: string, key: Key, items: Array<[string, string]>, any: string, extra: Partial<Filters> = {}, disabled = false) => (
    <label className="block text-sm font-medium">
      {label}
      <select className={`${heroInput} mt-1.5`} value={filters[key]} disabled={disabled} onChange={(e) => apply({ [key]: e.target.value, ...extra })}>
        <option value="">{any}</option>
        {items.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );

  // Main search, in the hero: name, course, state, city/district, ownership and (when fees exist) budget.
  const heroForm = (
    <form onSubmit={submit} role="search" aria-label="Filter colleges" className="grid gap-3 rounded-2xl bg-surface p-4 text-foreground shadow-xl sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
      <label className="block text-sm font-medium sm:col-span-2">
        College name
        <input className={`${heroInput} mt-1.5`} type="search" placeholder="Name, AISHE code, place or course" value={text.q} onChange={(e) => setText({ ...text, q: e.target.value })} maxLength={80} />
      </label>
      {heroSelect("Course", "course", (options.data?.courses ?? []).map((c) => [c.slug, c.name]), "All courses")}
      {heroSelect(
        "State or UT",
        "state",
        states.map((s) => [s.slug, `${s.name} (${s.count.toLocaleString("en-IN")})`]),
        "All states",
        { district: "" },
      )}
      {heroSelect("City or district", "district", (Array.isArray(districts.data) ? districts.data : []).map((d) => [d.slug, `${d.name} (${d.count})`]), filters.state ? "All districts" : "Choose a state first", {}, !filters.state)}
      {heroSelect("Government or private", "ownership", Object.entries(OWNERSHIP), "Any ownership")}
      {showBudget && (
        <label className="block text-sm font-medium sm:col-span-2 lg:col-span-2">
          Budget ({perBasis}, verified fees)
          <select
            className={`${heroInput} mt-1.5`}
            value={custom ? "custom" : filters.budget}
            onChange={(e) => {
              if (e.target.value === "custom") {
                setCustom(true);
                setOpen(true);
              } else {
                setCustom(false);
                apply({ budget: e.target.value, min: "" });
              }
            }}
          >
            <option value="">Any budget</option>
            {presets.map((p) => (
              <option key={p} value={String(p)}>
                Up to {lakh(p)}
              </option>
            ))}
            <option value="custom">Custom range…</option>
          </select>
        </label>
      )}
      <div className={`flex gap-2 ${showBudget ? "sm:col-span-2 lg:col-span-4 lg:justify-end" : "sm:col-span-2 lg:col-span-6 lg:justify-end"}`}>
        <Button type="submit" className="flex-1 sm:flex-none">
          Search colleges
        </Button>
        {chips.length > 0 && (
          <Button variant="secondary" onClick={clearAll}>
            Clear filters
          </Button>
        )}
      </div>
    </form>
  );

  // Everything else, beside the results.
  const moreForm = (
    <form onSubmit={submit} aria-label="More filters" className="space-y-4">
      <label className="block text-sm font-medium">
        Region or city
        <select className={`${control} mt-1.5`} value={filters.location} onChange={(e) => apply({ location: e.target.value })}>
          <option value="">Anywhere in India</option>
          {options.data && <LocationOptions locations={options.data.locations} />}
        </select>
      </label>
      {select("Institution", "category", Object.entries(CATEGORIES), "All institutions")}
      {select("College type", "type", Object.entries(COLLEGE_TYPES), "Any type")}
      {select("Approval or accreditation", "approval", (directory?.approvals ?? []).map((a) => [a, a]), "Any")}

      {showBudget && (
        <fieldset className="space-y-3 rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-medium">Budget (official college fees)</legend>
          <div role="radiogroup" aria-label="Fee basis" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 text-sm">
            {(
              [
                ["total", "Whole course"],
                ["annual", "Per year"],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className={`flex min-h-10 cursor-pointer items-center justify-center rounded-lg px-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${basis === v ? "bg-surface font-semibold shadow-sm" : "text-muted"}`}>
                <input type="radio" name="basis" value={v} className="sr-only" checked={basis === v} onChange={() => apply({ basis: v === "annual" ? "annual" : "", min: "", budget: "" })} />
                {l}
              </label>
            ))}
          </div>
          {custom && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-medium">
                From (₹)
                <input className={`${control} mt-1`} inputMode="numeric" value={text.min} onChange={(e) => setText({ ...text, min: e.target.value })} placeholder="0" />
              </label>
              <label className="block text-xs font-medium">
                To (₹)
                <input className={`${control} mt-1`} inputMode="numeric" value={text.max} onChange={(e) => setText({ ...text, max: e.target.value })} placeholder="Any" />
              </label>
            </div>
          )}
          <label className="block text-sm">
            Hostel, per year
            <select className={`${control} mt-1.5`} value={filters.maxHostel} onChange={(e) => apply({ maxHostel: e.target.value })}>
              <option value="">Any hostel fee</option>
              {HOSTEL.map((h) => (
                <option key={h} value={String(h)}>
                  Up to {lakh(h)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4" disabled={!budgetSet} checked={filters.unverified === "yes"} onChange={(e) => apply({ unverified: e.target.checked ? "yes" : "" })} />
            <span>
              Also show colleges without verified fees
              <span className="block text-xs text-muted">They are labelled “Fee not verified”. Colleges whose verified fee is over budget are never shown.</span>
            </span>
          </label>
        </fieldset>
      )}

      <label className="block text-sm font-medium">
        My percentage
        <input className={`${control} mt-1.5`} inputMode="decimal" placeholder="e.g. 72" value={text.percentage} onChange={(e) => setText({ ...text, percentage: e.target.value })} />
        <span className="mt-1 block text-xs font-normal text-muted">Shows colleges whose published minimum you meet.</span>
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="size-4" checked={filters.scholarship === "yes"} onChange={(e) => apply({ scholarship: e.target.checked ? "yes" : "" })} />
        Offers scholarships
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="size-4" checked={filters.hostel === "yes"} onChange={(e) => apply({ hostel: e.target.checked ? "yes" : "" })} />
        Hostel available
      </label>
      <Button type="submit" size="sm">
        Apply
      </Button>
    </form>
  );

  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <section aria-labelledby="directory-heading" className="relative isolate overflow-hidden rounded-3xl">
        {/* An original illustration (not a photo of any real campus). */}
        {/* eslint-disable-next-line @next/next/no-img-element -- local decorative SVG */}
        <img src="/images/campus-hero.svg" alt="" aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full object-cover" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-b from-black/75 via-black/60 to-black/80" />
        <div className="px-4 pt-10 pb-6 text-white sm:px-8 sm:pt-14 lg:px-10">
          <p className="text-sm font-semibold tracking-widest text-amber-300 uppercase">Colleges</p>
          <h1 id="directory-heading" className="mt-2 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Discover the Best Colleges for Your Future
          </h1>
          <p className="mt-3 max-w-2xl text-base text-white/90 sm:text-lg">Explore colleges across India, compare courses, discover campus facilities, and find the right institution for your goals.</p>
          <div className="mt-6">{heroForm}</div>
          <p className="mt-3 text-xs text-white/80">Fees shown are the colleges’ official fees, only where we have verified them; our service charge is always listed separately.</p>
        </div>
      </section>

      <div className="mt-6 space-y-3">
        {coverage && coverage.total > 0 && <CoverageNote coverage={coverage} />}
        {results.data?.meta.hasSamples && (
          <Alert tone="warning" title="This directory currently includes sample data">
            Colleges marked “{SAMPLE_LABEL}” are fictional examples with illustrative fees. Do not use them to make decisions.
          </Alert>
        )}
      </div>

      {chips.length === 0 && <Discover courses={options.data?.courses ?? []} states={states} onPick={apply} />}

      <div className="mt-8 lg:grid lg:grid-cols-[17rem_1fr] lg:gap-8">
        <div>
          <Button variant="secondary" className="w-full lg:hidden" aria-expanded={open} aria-controls="filters" onClick={() => setOpen(!open)}>
            {open ? "Hide more filters" : "More filters"}
          </Button>
          <div id="filters" className={`${open ? "mt-4 block" : "hidden"} rounded-2xl border border-line bg-surface p-4 lg:sticky lg:top-24 lg:mt-0 lg:block lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto`}>
            <h2 className="mb-3 hidden font-semibold lg:block">More filters</h2>
            {moreForm}
          </div>
        </div>

        <section aria-label="Results" className="mt-6 min-w-0 lg:mt-0">
          {chips.length > 0 && (
            <ul aria-label="Active filters" className="mb-4 flex flex-wrap gap-2">
              {chips.map((c) => (
                <li key={c.key}>
                  <button type="button" onClick={() => apply(c.clear)} className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm ring-1 ring-line hover:bg-foreground/10" aria-label={`Remove filter: ${c.label}`}>
                    <span className="max-w-64 truncate">{c.label}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
              <li>
                <button type="button" onClick={clearAll} className="min-h-9 px-2 text-sm font-semibold text-accent-text underline-offset-2 hover:underline">
                  Clear all
                </button>
              </li>
            </ul>
          )}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted" aria-live="polite">
              {results.data ? `${results.data.meta.total.toLocaleString("en-IN")} ${results.data.meta.total === 1 ? "college" : "colleges"} found` : "Searching…"}
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
            <div role="status" aria-label="Loading colleges" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="overflow-hidden rounded-2xl border border-line">
                  <Skeleton className="aspect-[16/9] rounded-none" />
                  <div className="space-y-2 p-5">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-9" />
                  </div>
                </div>
              ))}
            </div>
          ) : results.data.items.length === 0 ? (
            <EmptyState title="No colleges match these filters">
              {budgetSet && filters.unverified !== "yes" ? "Only colleges with verified fees match a budget. Try “Also show colleges without verified fees”, a wider budget, or clear some filters." : "Try a wider location or clear some filters."}
            </EmptyState>
          ) : (
            <>
              <div className={`grid gap-5 sm:grid-cols-2 xl:grid-cols-3 ${results.status === "loading" ? "opacity-60" : ""}`}>
                {results.data.items.map((c) => (
                  <CollegeCard key={c.id} college={c} course={filters.course || undefined} />
                ))}
              </div>
              <Pager meta={results.data.meta} onPage={(p) => apply({ page: String(p) })} />
            </>
          )}
          {/* Third-party name matches: only for a name search, on the first page, when the backend has the service. */}
          {directory?.externalSearch?.configured && filters.q.trim().length >= 2 && !(Number(filters.page) > 1) && <ExternalResults query={filters.q} />}
        </section>
      </div>
      <CompareTray />
    </main>
  );
}

// Starting points when no filter is set: recently viewed, featured colleges, courses and states.
// Counts are real directory counts; nothing is ranked by invented popularity.
function Discover({ courses, states, onPick }: { courses: Course[]; states: Array<{ name: string; slug: string; count: number }>; onPick: (f: Partial<Filters>) => void }) {
  const recent = useRecent();
  const featured = useApiData(async (signal) => (await api<Card[]>("GET", "/colleges?featured=yes&sort=featured&limit=3", { signal })).data, []);
  const byCategory = new Map<string, Course[]>();
  for (const c of Array.isArray(courses) ? courses : []) byCategory.set(c.category || "Other", [...(byCategory.get(c.category || "Other") ?? []), c]);
  const pill = "inline-flex min-h-9 items-center rounded-full bg-surface-2 px-3 text-sm ring-1 ring-line hover:bg-foreground/10";
  const featuredItems = Array.isArray(featured.data) ? featured.data : [];

  return (
    <div className="mt-8 space-y-8">
      {recent.length > 0 && (
        <section aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="text-lg font-bold">
            Recently viewed
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {recent.map((r) => (
              <li key={r.slug}>
                <Link href={`/colleges/${r.slug}`} className={pill}>
                  <span className="max-w-64 truncate">{r.name}</span>
                  {r.place && <span className="ml-1 text-muted">· {r.place}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {featuredItems.length > 0 && (
        <section aria-labelledby="featured-heading">
          <h2 id="featured-heading" className="text-lg font-bold">
            Featured colleges
          </h2>
          <p className="text-sm text-muted">Chosen by our team; not a ranking.</p>
          <div className="mt-3 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featuredItems.map((c) => (
              <CollegeCard key={c.id} college={c} source="featured_college" />
            ))}
          </div>
        </section>
      )}
      <div className="grid gap-8 lg:grid-cols-2">
        {byCategory.size > 0 && (
          <section aria-labelledby="courses-heading">
            <h2 id="courses-heading" className="text-lg font-bold">
              Browse by course
            </h2>
            <div className="mt-3 space-y-3">
              {[...byCategory.entries()].map(([category, list]) => (
                <div key={category}>
                  <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{category}</h3>
                  <ul className="mt-1.5 flex flex-wrap gap-2">
                    {list.map((c) => (
                      <li key={c.id}>
                        <button type="button" className={pill} onClick={() => onPick({ course: c.slug })}>
                          {c.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}
        {states.length > 0 && (
          <section aria-labelledby="states-heading">
            <h2 id="states-heading" className="text-lg font-bold">
              Colleges by state
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {states.map((s) => (
                <li key={s.slug}>
                  <button type="button" className={pill} onClick={() => onPick({ state: s.slug, district: "" })}>
                    {s.name}
                    <span className="ml-1 text-muted">({s.count.toLocaleString("en-IN")})</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
