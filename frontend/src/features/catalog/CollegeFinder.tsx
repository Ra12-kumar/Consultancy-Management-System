"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Alert, Badge, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { useApiData } from "@/hooks/useApiData";
import { safeHref } from "@/lib/safeUrl";
import { apiGet } from "@/services/api";
import type { ApiError } from "@/types/api";
import CampusShowcase from "./CampusShowcase";
import TopColleges from "./TopColleges";

export type FinderCollege = { id: string; name: string; city: string; state: string; website: string | null; branches: string[]; wikidataUrl: string };
export type FinderResult = {
  status: "ready" | "loading";
  branch: string | null;
  items: FinderCollege[];
  total: number;
  page: number;
  totalPages: number;
  states: string[];
  cities: string[];
  source: { name: string; url: string; licence: string; fetchedAt: string | null };
};

// The URL keys this finder owns; /colleges with any other key shows the verified directory instead.
export const FINDER_KEYS = ["q", "course", "branch", "state", "city", "page"];
const DEBOUNCE_MS = 300;
const nf = new Intl.NumberFormat("en-IN");

export function finderQuery(p: URLSearchParams) {
  const q = new URLSearchParams();
  for (const k of FINDER_KEYS) {
    const v = p.get(k)?.trim();
    if (v) q.set(k, v);
  }
  return q;
}

function FinderCard({ c, branchLabels }: { c: FinderCollege; branchLabels: Record<string, string> }) {
  const site = safeHref(c.website);
  const place = [c.city, c.state].filter(Boolean).join(", ");
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
      <h3 className="font-semibold leading-snug break-words">
        {site ? (
          <a href={site} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
            {c.name}
          </a>
        ) : (
          c.name
        )}
      </h3>
      <p className="mt-0.5 text-sm text-muted">{place || "Location not listed"}</p>
      {c.branches.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Subjects">
          {c.branches.slice(0, 3).map((b) => (
            <li key={b}>
              <Badge>{branchLabels[b] ?? b}</Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
        {site ? (
          <a href={site} target="_blank" rel="noopener noreferrer nofollow" className="col-span-2 inline-flex min-h-11 items-center justify-center gap-1 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
            Visit official website <span aria-hidden="true">↗</span>
            <span className="sr-only">for {c.name} (opens in a new tab)</span>
          </a>
        ) : (
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent([c.name, c.city, "official website"].filter(Boolean).join(" "))}`}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="col-span-2 inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-line px-4 text-sm font-semibold hover:bg-surface-2"
          >
            Search for website <span aria-hidden="true">↗</span>
          </a>
        )}
        <a href={c.wikidataUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-line px-3 text-sm hover:bg-surface-2">
          Details
        </a>
        <ButtonLink href={`/enquire?collegeName=${encodeURIComponent(place ? `${c.name}, ${c.city || c.state}` : c.name)}&source=college_search`} size="sm" variant="gold" className="text-center leading-tight">
          Enquire Now
        </ButtonLink>
      </div>
      <p className="mt-2 text-xs text-muted">{site ? "Website as listed on Wikidata." : "Official website not listed yet – opens a web search."}</p>
    </article>
  );
}

// /colleges: search every college in India as you type, by name, branch, state and city.
export default function CollegeFinder() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = finderQuery(new URLSearchParams(params.toString()));
  const [text, setText] = useState(query.get("q") ?? "");

  const set = (changes: Record<string, string>) => {
    const next = finderQuery(new URLSearchParams(params.toString()));
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in changes)) next.delete("page");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  // Results follow the typing after a short pause.
  useEffect(() => {
    if (text.trim() === (query.get("q") ?? "")) return;
    const t = setTimeout(() => set({ q: text.trim() }), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the typed text starts a search
  }, [text]);

  const key = query.toString();
  const branches = useApiData((signal) => apiGet<Record<string, string>>("/colleges/explore/branches", { signal }), []);
  const result = useApiData((signal) => apiGet<FinderResult>(`/colleges/explore?${key}`, { signal }), [key]);
  const data = result.data;
  const branchLabels = branches.data ?? {};
  // A course link (e.g. from the Courses page) selects its branch.
  const branch = query.get("branch") ?? data?.branch ?? "";
  const state = query.get("state") ?? "";
  const page = data?.page ?? 1;
  const from = data && data.total ? (page - 1) * 24 + 1 : 0;

  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <section aria-labelledby="finder-heading" className="relative isolate overflow-hidden rounded-3xl">
        {/* eslint-disable-next-line @next/next/no-img-element -- local decorative illustration */}
        <img src="/images/campus-hero.svg" alt="" aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full object-cover" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-b from-black/75 via-black/60 to-black/80" />
        <div className="px-4 py-8 text-white sm:px-10 sm:py-12">
          <p className="text-sm font-semibold tracking-widest text-accent uppercase">Colleges</p>
          <h1 id="finder-heading" className="mt-1 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Discover the Best Colleges for Your Future
          </h1>
          <p className="mt-3 max-w-2xl text-base text-white/90 sm:text-lg">Search colleges across India by name, branch and location. Results update as you type.</p>
          <div role="search" aria-label="Search colleges" className="mt-6 grid gap-3 rounded-2xl bg-surface p-4 text-foreground shadow-xl sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end">
            <label className="block text-sm font-medium">
              College name or place
              <input
                type="search"
                autoComplete="off"
                placeholder="e.g. IIT Bombay, engineering Pune"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={80}
                className="mt-1 min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none"
              />
            </label>
            <label className="block text-sm font-medium">
              Branch
              <select value={branch} onChange={(e) => set({ branch: e.target.value, course: "" })} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base">
                <option value="">All branches</option>
                {Object.entries(branchLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              State or UT
              <select value={state} onChange={(e) => set({ state: e.target.value, city: "" })} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base">
                <option value="">All states</option>
                {(data?.states ?? (state ? [state] : [])).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              City or district
              <select value={query.get("city") ?? ""} disabled={!state} onChange={(e) => set({ city: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base disabled:opacity-60">
                <option value="">{state ? "All cities" : "Choose a state first"}</option>
                {(data?.cities ?? []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="secondary"
              className="min-h-11"
              onClick={() => {
                setText("");
                router.replace(pathname, { scroll: false });
              }}
            >
              Clear
            </Button>
          </div>
          <p className="mt-3 text-sm text-white/80">
            Want verified fees, approvals and budget filters?{" "}
            <Link href="/colleges?view=all" className="font-semibold text-white underline underline-offset-2">
              Browse with filters
            </Link>
          </p>
        </div>
      </section>

      <section aria-label="Search results" aria-live="polite" className="mt-8">
        {result.status === "error" ? (
          <div className="space-y-3">
            <Alert>{(result.error as ApiError | null)?.message ?? "College search is not available right now."}</Alert>
            <Button size="sm" variant="secondary" onClick={result.reload}>
              Try again
            </Button>
          </div>
        ) : !data ? (
          <div role="status" aria-label="Searching colleges" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        ) : data.status === "loading" ? (
          <Alert tone="info" title="Preparing the college list">
            We are fetching the list of colleges in India for the first time. This takes a minute or two.{" "}
            <button type="button" onClick={result.reload} className="font-semibold underline">
              Check again
            </button>
          </Alert>
        ) : data.total === 0 ? (
          <EmptyState title="No colleges match">Try fewer words, another spelling, or clear a filter.</EmptyState>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold">
                {nf.format(data.total)} {data.total === 1 ? "college" : "colleges"}
                {branch && branchLabels[branch] ? ` · ${branchLabels[branch]}` : ""}
                {state ? ` · ${query.get("city") ? `${query.get("city")}, ` : ""}${state}` : ""}
              </h2>
              <p className="text-sm text-muted">
                Showing {nf.format(from)}–{nf.format(from + data.items.length - 1)}
              </p>
            </div>
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((c) => (
                <FinderCard key={c.id} c={c} branchLabels={branchLabels} />
              ))}
            </div>
            {data.totalPages > 1 && (
              <nav aria-label="Pages" className="mt-6 flex items-center justify-center gap-3">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>
                  Previous
                </Button>
                <span className="text-sm text-muted">
                  Page {page} of {nf.format(data.totalPages)}
                </span>
                <Button size="sm" variant="secondary" disabled={page >= data.totalPages} onClick={() => set({ page: String(page + 1) })}>
                  Next
                </Button>
              </nav>
            )}
          </>
        )}
        {data?.source && (
          <p className="mt-6 text-xs text-muted">
            College list from{" "}
            <a href={data.source.url} target="_blank" rel="noopener noreferrer" className="underline">
              Wikidata
            </a>{" "}
            ({data.source.licence}), community-maintained{data.source.fetchedAt ? `, updated ${new Date(data.source.fetchedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}. Branches are worked out from the college&apos;s type and name; always confirm courses and admissions on the official website.
          </p>
        )}
      </section>
      {!query.size && <TopColleges />}
      <CampusShowcase />
    </main>
  );
}
