"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Alert, Badge, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { useApiData } from "@/hooks/useApiData";
import { COURSE_LEVELS, durationLabel, fmtDay, formatINR } from "@/lib/format";
import { api } from "@/services/api";
import type { ApiError, PageMeta } from "@/types/api";
import type { BrowseOffering } from "@/types/catalog";
import { CollegeLogo, enquiryHref } from "./CatalogUi";
import { MODE_LABELS, QUALIFICATION_LABELS } from "./CollegeExtras";

// The URL keys this browser owns (filters stay shareable and survive a reload).
export const BROWSE_KEYS = ["q", "level", "state", "city", "maxFee", "qualification", "mode", "sort", "page"] as const;
const FEE_STEPS = [
  ["50000", "₹50,000"],
  ["100000", "₹1 lakh"],
  ["200000", "₹2 lakh"],
  ["500000", "₹5 lakh"],
  ["1000000", "₹10 lakh"],
] as const;
const DEBOUNCE_MS = 300;

export function browseQuery(p: URLSearchParams) {
  const q = new URLSearchParams();
  for (const k of BROWSE_KEYS) {
    const v = p.get(k)?.trim();
    if (v) q.set(k, v);
  }
  return q;
}

function OfferingCard({ o }: { o: BrowseOffering }) {
  const yearly = o.fee?.yearlyMinor ?? null;
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <CollegeLogo name={o.college.name} logoUrl={o.college.logoUrl} />
        <div className="min-w-0">
          <h3 className="font-semibold leading-snug">
            {o.course.name}
            {o.specialization && <span className="font-normal text-muted"> · {o.specialization}</span>}
          </h3>
          <p className="text-sm">
            <Link href={`/colleges/${o.college.slug}`} className="hover:underline">
              {o.college.name}
            </Link>
          </p>
          <p className="text-xs text-muted">{[o.college.city, o.college.state].filter(Boolean).join(", ")}</p>
        </div>
      </div>
      <p className="mt-3 flex flex-wrap gap-1.5">
        <Badge>{COURSE_LEVELS[o.course.level] ?? o.course.level}</Badge>
        <Badge>{MODE_LABELS[o.mode]}</Badge>
        <Badge>{durationLabel(o.durationMonths)}</Badge>
        {o.college.isSample && <Badge tone="warning">Sample data</Badge>}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted">Fees</dt>
          <dd className="font-semibold">{o.fee ? (yearly != null ? `${formatINR(yearly)} / year` : `${formatINR(o.fee.totalMinor)} total`) : "Not published"}</dd>
        </div>
        <div>
          <dt className="text-muted">Eligibility</dt>
          <dd>{[o.minQualification && QUALIFICATION_LABELS[o.minQualification], o.minPercentage != null && `${o.minPercentage}%+`].filter(Boolean).join(", ") || "Ask us"}</dd>
        </div>
        {o.entranceExams.length > 0 && (
          <div>
            <dt className="text-muted">Entrance exams</dt>
            <dd>{o.entranceExams.join(", ")}</dd>
          </div>
        )}
        {o.applicationDeadline && (
          <div>
            <dt className="text-muted">Apply by</dt>
            <dd>{fmtDay(o.applicationDeadline)}</dd>
          </div>
        )}
        {o.seats != null && (
          <div>
            <dt className="text-muted">Seats</dt>
            <dd>{o.seats}</dd>
          </div>
        )}
      </dl>
      <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
        <ButtonLink href={`/colleges/${o.college.slug}`} size="sm" variant="secondary">
          View details
        </ButtonLink>
        <ButtonLink href={enquiryHref(o.college.slug, o.course.slug)} size="sm" variant="gold">
          Enquire Now
        </ButtonLink>
      </div>
    </article>
  );
}

// /courses/browse: every active course at published colleges, filtered by degree, place, fee, qualification and mode.
export default function CourseBrowser() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = browseQuery(new URLSearchParams(params.toString()));
  const [text, setText] = useState(query.get("q") ?? "");

  const set = (changes: Record<string, string>) => {
    const next = browseQuery(new URLSearchParams(params.toString()));
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in changes)) next.delete("page");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, {
      scroll: false,
    });
  };

  useEffect(() => {
    if (text.trim() === (query.get("q") ?? "")) return;
    const t = setTimeout(() => set({ q: text.trim() }), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the typed text starts a search
  }, [text]);

  const key = query.toString();
  const result = useApiData(
    async (signal) => {
      const { data, meta } = await api<BrowseOffering[]>("GET", `/courses/offerings?${key}`, { signal });
      return { items: data, meta: meta as PageMeta };
    },
    [key],
  );
  const select = "mt-1 min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base";

  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <p className="text-sm font-semibold tracking-widest text-accent-text uppercase">Courses</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Browse courses at colleges</h1>
      <p className="mt-2 max-w-2xl text-muted">Every course listed by our verified colleges, with fees, eligibility and deadlines. Results update as you type.</p>
      <div role="search" aria-label="Filter courses" className="mt-6 grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm font-medium lg:col-span-2">
          Course or college
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} maxLength={80} placeholder="e.g. B.Tech, MBA, college name" className={select} />
        </label>
        <label className="block text-sm font-medium">
          Degree
          <select value={query.get("level") ?? ""} onChange={(e) => set({ level: e.target.value })} className={select}>
            <option value="">All degrees</option>
            {Object.entries(COURSE_LEVELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Mode
          <select value={query.get("mode") ?? ""} onChange={(e) => set({ mode: e.target.value })} className={select}>
            <option value="">Any mode</option>
            {Object.entries(MODE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          State
          <input value={query.get("state") ?? ""} onChange={(e) => set({ state: e.target.value })} maxLength={80} placeholder="e.g. Maharashtra" className={select} />
        </label>
        <label className="block text-sm font-medium">
          City
          <input value={query.get("city") ?? ""} onChange={(e) => set({ city: e.target.value })} maxLength={80} placeholder="e.g. Pune" className={select} />
        </label>
        <label className="block text-sm font-medium">
          Fees up to (per year)
          <select value={query.get("maxFee") ?? ""} onChange={(e) => set({ maxFee: e.target.value })} className={select}>
            <option value="">Any fee</option>
            {FEE_STEPS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          My qualification
          <select value={query.get("qualification") ?? ""} onChange={(e) => set({ qualification: e.target.value })} className={select}>
            <option value="">Any</option>
            {Object.entries(QUALIFICATION_LABELS)
              .filter(([v]) => v !== "other")
              .map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Sort by
          <select value={query.get("sort") ?? "name"} onChange={(e) => set({ sort: e.target.value === "name" ? "" : e.target.value })} className={select}>
            <option value="name">Name</option>
            <option value="fee">Lowest fee</option>
            <option value="deadline">Nearest deadline</option>
          </select>
        </label>
        <div className="flex items-end">
          <Button
            variant="secondary"
            className="min-h-11 w-full"
            onClick={() => {
              setText("");
              router.replace(pathname, { scroll: false });
            }}
          >
            Clear filters
          </Button>
        </div>
      </div>

      <section aria-label="Courses found" aria-live="polite" className="mt-6">
        {result.status === "error" ? (
          <div className="space-y-3">
            <Alert>{(result.error as ApiError | null)?.message ?? "Courses could not be loaded."}</Alert>
            <Button size="sm" variant="secondary" onClick={result.reload}>
              Try again
            </Button>
          </div>
        ) : !result.data ? (
          <div role="status" aria-label="Loading courses" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        ) : result.data.items.length === 0 ? (
          <EmptyState title="No courses match">
            Try fewer filters. Our verified list grows as colleges are added; you can also{" "}
            <Link href="/colleges" className="underline">
              search all colleges in India
            </Link>
            .
          </EmptyState>
        ) : (
          <>
            <p className="text-sm text-muted">
              {result.data.meta.total} {result.data.meta.total === 1 ? "course" : "courses"} found. Fees are the colleges&apos; official published fees; our service charge is separate.
            </p>
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {result.data.items.map((o) => (
                <OfferingCard key={o.id} o={o} />
              ))}
            </div>
            {result.data.meta.totalPages > 1 && (
              <nav aria-label="Pages" className="mt-6 flex items-center justify-center gap-3">
                <Button size="sm" variant="secondary" disabled={result.data.meta.page <= 1} onClick={() => set({ page: String(result.data!.meta.page - 1) })}>
                  Previous
                </Button>
                <span className="text-sm text-muted">
                  Page {result.data.meta.page} of {result.data.meta.totalPages}
                </span>
                <Button size="sm" variant="secondary" disabled={result.data.meta.page >= result.data.meta.totalPages} onClick={() => set({ page: String(result.data!.meta.page + 1) })}>
                  Next
                </Button>
              </nav>
            )}
          </>
        )}
      </section>
    </main>
  );
}
