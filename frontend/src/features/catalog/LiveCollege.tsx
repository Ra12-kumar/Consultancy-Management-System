"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { Alert, Badge, Card, Skeleton } from "@/components/ui/Feedback";
import { fmtDate } from "@/features/admin/shared";
import { useApiData } from "@/hooks/useApiData";
import { apiGet } from "@/services/api";
import type { ApiError } from "@/types/api";
import type { ExternalCollegeDetail } from "@/types/catalog";
import { enquireFor, websiteFor } from "./CollegeSearch";

// The live record of one college (fetched through our backend from CollegeDB).
export default function LiveCollege() {
  const { id } = useParams<{ id: string }>();
  const d = useApiData((signal) => apiGet<ExternalCollegeDetail>(`/colleges/external/${encodeURIComponent(id)}`, { signal }), [id]);
  const shell = (children: React.ReactNode) => (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/colleges" className="hover:underline">
          Colleges
        </Link>
        {d.data && (
          <>
            {" "}
            / <span aria-current="page">{d.data.name}</span>
          </>
        )}
      </nav>
      <div className="mt-4">{children}</div>
    </main>
  );

  if (d.status === "error") {
    const e = d.error as ApiError | null;
    return shell(
      <Alert title={e?.status === 404 ? "College not found" : "Could not load this college"}>
        {e?.message ?? ""}{" "}
        <Link href="/colleges" className="font-semibold underline">
          Back to search
        </Link>
      </Alert>,
    );
  }
  if (!d.data) return shell(<Skeleton className="h-64" />);
  const c = d.data;
  const site = websiteFor(c);
  return shell(
    <>
      <Card>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{c.name}</h1>
        <p className="mt-1 text-muted">{[c.city, c.state].filter(Boolean).join(", ")}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge>{c.typeLabel}</Badge>
          {c.local?.hasVerifiedFees && <Badge tone="success">Verified fees available</Badge>}
        </div>
        {c.aliases.length > 0 && <p className="mt-3 text-sm"><span className="text-muted">Also known as: </span>{c.aliases.join(", ")}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={site.href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-fg hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
            {site.official ? "Visit official website" : "Search for website"} <span aria-hidden="true">↗</span>
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <ButtonLink href={enquireFor(c)} variant="gold">
            Enquire for Admission
          </ButtonLink>
          {c.local && (
            <ButtonLink href={`/colleges/${c.local.slug}`} variant="secondary">
              Courses and fees
            </ButtonLink>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">{site.official ? (site.source === "wikidata" ? "Website as listed on Wikidata." : "Website verified by our team.") : "Official website not known yet – the button opens a web search."}</p>
      </Card>
      <p className="mt-4 text-xs text-muted">
        Source: CollegeDB{c.providerUpdatedAt ? `, record updated ${fmtDate(c.providerUpdatedAt).split(",")[0]}` : ""}
        {c.source.cached ? `; fetched ${fmtDate(c.source.fetchedAt)}` : ""}. Courses and fees are not part of this data – ask our counsellors through an enquiry.
      </p>
    </>,
  );
}
