"use client";

import Link from "next/link";
import { ButtonLink, Button } from "@/components/ui/Button";
import { Alert, Badge, Skeleton } from "@/components/ui/Feedback";
import { useApiData } from "@/hooks/useApiData";
import { fmtDate } from "@/features/admin/shared";
import { apiGet } from "@/services/api";
import type { ApiError } from "@/types/api";
import type { ExternalSearch } from "@/types/catalog";

// Matches from CollegeDB, a third-party name search (via our backend; the key never reaches the browser).
// It returns names and places only: fees, courses and approvals are shown only from our own verified records.
export function ExternalResults({ query }: { query: string }) {
  const q = query.trim();
  const data = useApiData((signal) => apiGet<ExternalSearch>(`/colleges/search?q=${encodeURIComponent(q)}`, { signal }), [q]);
  const code = (data.error as ApiError | null)?.code ?? "";

  return (
    <section aria-labelledby="external-heading" className="mt-8 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="external-heading" className="font-semibold">
          More matches from CollegeDB
        </h2>
        <Badge>Third-party data – not verified by us</Badge>
      </div>
      <p className="mt-1 text-sm text-muted">Up to five colleges matching “{q}” by name, from the CollegeDB search service. It gives names and places only, not fees, courses or approvals.</p>

      <div className="mt-4" aria-live="polite">
        {data.status === "error" ? (
          code === "COLLEGEDB_QUOTA_EXHAUSTED" || code === "COLLEGEDB_NOT_CONFIGURED" || data.error?.status === 429 ? (
            <p className="text-sm text-muted">{data.error?.message ?? "This search is not available right now."}</p>
          ) : (
            <div className="space-y-3">
              <Alert>{data.error?.message ?? "The external search is not available right now."}</Alert>
              <Button size="sm" variant="secondary" onClick={data.reload}>
                Try again
              </Button>
            </div>
          )
        ) : !data.data ? (
          <div role="status" aria-label="Searching CollegeDB" className="space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : data.data.results.length === 0 ? (
          <p className="text-sm text-muted">No colleges named like “{q}” in CollegeDB either. Try a shorter or different name.</p>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {data.data.results.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{c.name}</p>
                    <p className="text-sm text-muted">{[c.city, c.state].filter(Boolean).join(", ") || "Location not given"}</p>
                    <p className="mt-0.5 text-xs text-muted">{c.local?.hasVerifiedFees ? "Verified fees in our directory" : "Fee information unavailable"}
                      {!c.local && " · Official website not available"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {c.local ? (
                      <ButtonLink href={`/colleges/${c.local.slug}`} size="sm" variant="secondary">
                        View in our directory
                      </ButtonLink>
                    ) : null}
                    <ButtonLink href={c.local ? `/enquire?college=${encodeURIComponent(c.local.slug)}&source=live_search` : "/enquire?source=live_search"} size="sm" variant="secondary">
                      Enquire for Admission
                    </ButtonLink>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              Source:{" "}
              <Link href={data.data.source.url} target="_blank" rel="noopener noreferrer" className="underline">
                {data.data.source.name}
              </Link>
              {data.data.source.cached ? `, as fetched ${fmtDate(data.data.source.fetchedAt)}` : ", fetched just now"}. Check details with the college before deciding.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
