"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Alert, Badge, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { useApiData } from "@/hooks/useApiData";
import { safeHref } from "@/lib/safeUrl";
import { api, apiGet } from "@/services/api";
import type { ApiError } from "@/types/api";
import type { CollegeCard as Card, ExternalCollege, ExternalSearch } from "@/types/catalog";
import { CollegeCard, CompareTray } from "./CatalogUi";
import TopColleges from "./TopColleges";

const MIN = 3; // letters before a live search starts (each new search uses the provider's small daily quota)
const EXAMPLES = ["IIT Bombay", "Anna University", "University of Delhi", "NIT Trichy", "Jadavpur University"];

// Where the website button goes: the official website when known (verified by us, or Wikidata's exact match),
// otherwise a web search for the college. We never make up a website address.
export function websiteFor(c: Pick<ExternalCollege, "name" | "city" | "website">) {
  const official = safeHref(c.website?.url);
  if (official) return { href: official, official: true, source: c.website!.source };
  return { href: `https://www.google.com/search?q=${encodeURIComponent([c.name, c.city, "official website"].filter(Boolean).join(" "))}`, official: false, source: null };
}

export function enquireFor(c: Pick<ExternalCollege, "name" | "city" | "local">) {
  return c.local ? `/enquire?college=${encodeURIComponent(c.local.slug)}&source=live_search` : `/enquire?collegeName=${encodeURIComponent([c.name, c.city].filter(Boolean).join(", "))}&source=live_search`;
}

function LiveCard({ c }: { c: ExternalCollege }) {
  const site = websiteFor(c);
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg">
          <svg viewBox="0 0 64 40" className="h-6 w-8" fill="currentColor">
            <path d="M32 2 4 14v4h56v-4L32 2Zm-22 18v14h6V20h-6Zm10 0v14h6V20h-6Zm12 0v14h6V20h-6Zm10 0v14h6V20h-6ZM4 36v4h56v-4H4Z" />
          </svg>
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold leading-snug break-words">
            <Link href={`/colleges/live/${c.id}`} className="hover:underline">
              {c.name}
            </Link>
          </h3>
          <p className="mt-0.5 text-sm text-muted">{[c.city, c.state].filter(Boolean).join(", ") || "Location not given"}</p>
          {c.local?.hasVerifiedFees && (
            <span className="mt-1.5 inline-block">
              <Badge tone="success">Verified fees available</Badge>
            </span>
          )}
        </div>
      </div>
      <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
        <a href={site.href} target="_blank" rel="noopener noreferrer nofollow" className="col-span-2 inline-flex min-h-11 items-center justify-center gap-1 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
          {site.official ? "Visit official website" : "Search for website"} <span aria-hidden="true">↗</span>
          <span className="sr-only">for {c.name} (opens in a new tab)</span>
        </a>
        <ButtonLink href={c.local ? `/colleges/${c.local.slug}` : `/colleges/live/${c.id}`} size="sm" variant="secondary">
          View details
        </ButtonLink>
        <ButtonLink href={enquireFor(c)} size="sm" variant="gold" className="text-center leading-tight">
          Enquire
        </ButtonLink>
      </div>
      <p className="mt-2 text-xs text-muted">{site.official ? (site.source === "wikidata" ? "Website as listed on Wikidata." : "Website verified by our team.") : "Official website not known yet – opens a web search."}</p>
    </article>
  );
}

export default function CollegeSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const [text, setText] = useState({ value: q, key: q });
  if (text.key !== q) setText({ value: q, key: q });

  const go = (value: string) => {
    const v = value.trim().slice(0, 80);
    router.replace(v ? `${pathname}?q=${encodeURIComponent(v)}` : pathname, { scroll: false });
  };
  // Searches as the student types, after a pause.
  useEffect(() => {
    const v = text.value.trim();
    if (v === q || (v.length > 0 && v.length < MIN)) return;
    const t = setTimeout(() => go(v), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only typing starts a search
  }, [text.value]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    go(text.value);
  };

  const ready = q.length >= MIN;
  const live = useApiData(async (signal) => (ready ? apiGet<ExternalSearch>(`/colleges/search?q=${encodeURIComponent(q)}`, { signal }) : null), [q]);
  // Colleges in our own directory (with verified details) that match too.
  const ours = useApiData(async (signal) => (ready ? (await api<Card[]>("GET", `/colleges?q=${encodeURIComponent(q)}&limit=6`, { signal })).data : []), [q]);
  const liveError = live.error as ApiError | null;
  const quietError = liveError && ["COLLEGEDB_QUOTA_EXHAUSTED", "COLLEGEDB_NOT_CONFIGURED"].includes(liveError.code);
  const ourItems = Array.isArray(ours.data) ? ours.data : [];
  const liveItems = live.data?.results ?? [];

  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <section aria-labelledby="search-heading" className="relative isolate overflow-hidden rounded-3xl">
        {/* eslint-disable-next-line @next/next/no-img-element -- local decorative illustration */}
        <img src="/images/campus-hero.svg" alt="" aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full object-cover" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-b from-black/75 via-black/60 to-black/80" />
        <div className="px-4 py-10 text-white sm:px-10 sm:py-14">
          <h1 id="search-heading" className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Discover the Best Colleges for Your Future
          </h1>
          <p className="mt-3 max-w-2xl text-base text-white/90 sm:text-lg">Search any college in India by name and go straight to its website.</p>
          <form onSubmit={submit} role="search" aria-label="Search colleges" className="mt-6 flex max-w-3xl flex-col gap-2 rounded-2xl bg-surface p-2 shadow-xl sm:flex-row">
            <label htmlFor="college-q" className="sr-only">
              College name
            </label>
            <input
              id="college-q"
              type="search"
              autoComplete="off"
              placeholder="Type a college name, e.g. IIT Bombay"
              value={text.value}
              onChange={(e) => setText({ ...text, value: e.target.value })}
              maxLength={80}
              className="min-h-12 flex-1 rounded-xl border border-line bg-surface px-4 text-base text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            <Button type="submit" className="min-h-12 px-6">
              Search
            </Button>
          </form>
          <p className="mt-3 text-sm text-white/80">
            Need course, state or budget filters?{" "}
            <Link href="/colleges?view=all" className="font-semibold text-white underline underline-offset-2">
              Browse with filters
            </Link>
          </p>
        </div>
      </section>

      <section aria-label="Search results" className="mt-8" aria-live="polite">
        {!ready ? (
          <div>
            <p className="text-sm text-muted">{q ? `Type at least ${MIN} letters.` : "Try a search:"}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <li key={e}>
                  <button type="button" onClick={() => go(e)} className="inline-flex min-h-10 items-center rounded-full bg-surface px-4 text-sm ring-1 ring-line hover:bg-surface-2">
                    {e}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            {ourItems.length > 0 && (
              <div className="mb-8">
                <h2 className="text-lg font-bold">In our directory (verified by our team)</h2>
                <div className="mt-3 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {ourItems.map((c) => (
                    <CollegeCard key={c.id} college={c} />
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold">Colleges matching “{q}”</h2>
              {live.data && <p className="text-xs text-muted">Live data from CollegeDB{live.data.source.cached ? " (recent search, saved for a few hours)" : ""}</p>}
            </div>
            <div className="mt-3">
              {live.status === "error" ? (
                quietError ? (
                  <Alert tone="info" title="Live college search is resting">
                    {liveError?.message} {ourItems.length ? "Results from our own directory are shown above." : ""}
                  </Alert>
                ) : (
                  <div className="space-y-3">
                    <Alert>{liveError?.message ?? "The college search is not available right now."}</Alert>
                    <Button size="sm" variant="secondary" onClick={live.reload}>
                      Try again
                    </Button>
                  </div>
                )
              ) : !live.data ? (
                <div role="status" aria-label="Searching colleges" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 3 }, (_, i) => (
                    <Skeleton key={i} className="h-44" />
                  ))}
                </div>
              ) : liveItems.length === 0 ? (
                <EmptyState title={`No college named like “${q}”`}>Check the spelling, or try a shorter name (for example “Anna” instead of “Anna University Chennai”).</EmptyState>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {liveItems.map((c) => (
                    <LiveCard key={c.id} c={c} />
                  ))}
                </div>
              )}
            </div>
            {live.data && liveItems.length >= 5 && <p className="mt-3 text-sm text-muted">Showing the 5 closest matches. Add more of the name to narrow it down.</p>}
          </>
        )}
      </section>
      <TopColleges />
      <CompareTray />
    </main>
  );
}
