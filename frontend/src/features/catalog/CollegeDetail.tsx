"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Alert, Badge, Card, Skeleton } from "@/components/ui/Feedback";
import { useApiData } from "@/hooks/useApiData";
import { COLLEGE_TYPES, COURSE_LEVELS, durationLabel, fmtDay } from "@/lib/format";
import { apiGet } from "@/services/api";
import type { CollegeDetail as Detail, PublicOffering } from "@/types/catalog";
import { CollegeLogo, CompareToggle, CompareTray, FeeBreakdown, SAMPLE_LABEL, SampleBadge, ShortlistButton, VerifiedLine } from "./CatalogUi";

const isUrl = (s: string) => /^https:\/\//i.test(s);

function Offering({ o, isSample, open }: { o: PublicOffering; isSample: boolean; open: boolean }) {
  return (
    <details open={open} className="group rounded-2xl border border-line bg-surface">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3">
        <span>
          <span className="font-semibold">{o.course?.name ?? "Course"}</span>
          {o.specialization && <span className="text-muted"> · {o.specialization}</span>}
          <span className="block text-xs text-muted">
            {durationLabel(o.durationMonths)}
            {o.course && ` · ${COURSE_LEVELS[o.course.level] ?? o.course.level}`}
          </span>
        </span>
        <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="space-y-4 border-t border-line px-5 py-4 text-sm">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-muted">Eligibility</dt>
            <dd>{o.eligibilityText || (o.minPercentage != null ? `At least ${o.minPercentage}%` : "Contact us for details")}</dd>
          </div>
          {o.entranceExams.length > 0 && (
            <div>
              <dt className="text-muted">Entrance exams</dt>
              <dd>{o.entranceExams.join(", ")}</dd>
            </div>
          )}
          {o.seats != null && (
            <div>
              <dt className="text-muted">Seats</dt>
              <dd>{o.seats}</dd>
            </div>
          )}
          {o.applicationDeadline && (
            <div>
              <dt className="text-muted">Application deadline</dt>
              <dd>{fmtDay(o.applicationDeadline)}</dd>
            </div>
          )}
        </dl>
        {o.admissionProcess && <p className="whitespace-pre-line">{o.admissionProcess}</p>}
        {o.fees.length === 0 ? (
          <p className="rounded-xl bg-surface-2 p-3 text-muted">Fees for this course have not been published yet. Ask us for the latest figures.</p>
        ) : (
          o.fees.map((f) => (
            <div key={f.id} className="rounded-xl border border-line p-4">
              <h4 className="font-semibold">
                Fees {f.academicYear}
                {f.intake && ` · ${f.intake} intake`}
              </h4>
              <div className="mt-2">
                <FeeBreakdown breakdown={f.breakdown} />
              </div>
              {f.paymentSchedule && <p className="mt-3 whitespace-pre-line text-muted">Payment schedule: {f.paymentSchedule}</p>}
              {f.notes && <p className="mt-2 text-muted">{f.notes}</p>}
              <p className="mt-3 text-xs text-muted">
                {isSample ? (
                  "Sample data – illustrative figures only, not real fees."
                ) : (
                  <>
                    Fees last verified {fmtDay(f.lastVerifiedAt)}
                    {f.sourceRef && (
                      <>
                        {" · Source: "}
                        {isUrl(f.sourceRef) ? (
                          <a href={f.sourceRef} target="_blank" rel="noopener noreferrer nofollow" className="underline">
                            official fee document
                          </a>
                        ) : (
                          f.sourceRef
                        )}
                      </>
                    )}
                    . Colleges can change fees; we confirm the current amount before you pay.
                  </>
                )}
              </p>
            </div>
          ))
        )}
      </div>
    </details>
  );
}

export function CollegeProfile({ college: c }: { college: Detail }) {
  const [cover, setCover] = useState(true);
  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/colleges" className="hover:underline">
          Colleges
        </Link>{" "}
        / <span aria-current="page">{c.name}</span>
      </nav>
      {c.isSample && (
        <div className="mt-4">
          <Alert tone="warning" title={SAMPLE_LABEL}>
            This is a fictional example used to demonstrate the directory. Its courses and fees are illustrative only.
          </Alert>
        </div>
      )}
      <header className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
        {c.coverUrl && cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin-provided https URLs from any host
          <img src={c.coverUrl} alt="" onError={() => setCover(false)} className="h-40 w-full object-cover sm:h-56" />
        ) : (
          <div aria-hidden="true" className="h-24 bg-gradient-to-r from-primary to-primary/70 sm:h-32" />
        )}
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:p-6">
          <div className="-mt-14 sm:-mt-16">
            <CollegeLogo name={c.name} logoUrl={c.logoUrl} size="lg" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{c.name}</h1>
            <p className="mt-1 text-muted">{[c.address, c.city, c.state].filter(Boolean).join(", ")}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge>{COLLEGE_TYPES[c.type] ?? c.type}</Badge>
              {c.isSample && <SampleBadge />}
              {c.approvals.map((a) => (
                <Badge key={a} tone="success">
                  {a}
                </Badge>
              ))}
            </div>
            <div className="mt-2">
              <VerifiedLine isSample={c.isSample} lastVerifiedAt={c.lastVerifiedAt} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ShortlistButton collegeId={c.id} size="md" />
            <CompareToggle slug={c.slug} name={c.name} size="md" />
            <ButtonLink href={`/enquire?college=${encodeURIComponent(c.slug)}${c.offerings[0]?.course ? `&course=${c.offerings[0].course.slug}` : ""}`} variant="gold">
              Enquire
            </ButtonLink>
          </div>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="courses-heading" className="min-w-0 space-y-3">
          <h2 id="courses-heading" className="text-xl font-bold">
            Courses and fees
          </h2>
          {c.offerings.length === 0 ? <p className="text-muted">No courses are listed yet.</p> : c.offerings.map((o, i) => <Offering key={o.id} o={o} isSample={c.isSample} open={i === 0} />)}
          {c.admissionProcess && (
            <Card>
              <h2 className="font-semibold">Admission process</h2>
              <p className="mt-2 text-sm whitespace-pre-line">{c.admissionProcess}</p>
            </Card>
          )}
        </section>
        <aside className="space-y-4">
          {c.about && (
            <Card>
              <h2 className="font-semibold">About</h2>
              <p className="mt-2 text-sm whitespace-pre-line">{c.about}</p>
            </Card>
          )}
          {c.accreditations.length > 0 && (
            <Card>
              <h2 className="font-semibold">Accreditation</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {c.accreditations.map((a) => (
                  <li key={a.body}>
                    {a.body}
                    {a.grade && ` – ${a.grade}`}
                    {a.validUntil && <span className="text-muted"> (valid until {fmtDay(a.validUntil)})</span>}
                    {a.sourceUrl && (
                      <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="ml-1 underline">
                        source
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {(c.campusInfo || c.placementInfo) && (
            <Card>
              {c.campusInfo && (
                <>
                  <h2 className="font-semibold">Campus</h2>
                  <p className="mt-2 text-sm whitespace-pre-line">{c.campusInfo}</p>
                </>
              )}
              {c.placementInfo && (
                <>
                  <h2 className="mt-4 font-semibold">Placements</h2>
                  <p className="mt-2 text-sm whitespace-pre-line">{c.placementInfo}</p>
                </>
              )}
            </Card>
          )}
          {(c.website || c.contact.phone || c.contact.email) && (
            <Card>
              <h2 className="font-semibold">Contact</h2>
              <ul className="mt-2 space-y-1 text-sm break-words">
                {c.website && (
                  <li>
                    <a href={c.website} target="_blank" rel="noopener noreferrer nofollow" className="underline">
                      Official website
                    </a>
                  </li>
                )}
                {c.contact.phone && <li>{c.contact.phone}</li>}
                {c.contact.email && <li>{c.contact.email}</li>}
              </ul>
            </Card>
          )}
        </aside>
      </div>
      <CompareTray />
    </main>
  );
}

// /colleges/[slug]: the slug is only known at request time, so the page wraps this in <Suspense>.
export default function CollegeDetail() {
  const { slug } = useParams<{ slug: string }>();
  const d = useApiData((signal) => apiGet<Detail>(`/colleges/${encodeURIComponent(slug)}`, { signal }), [slug]);
  if (d.data) return <CollegeProfile college={d.data} />;
  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      {d.status === "error" ? (
        <Alert title={d.error?.status === 404 ? "College not found" : "Could not load this college"}>
          {d.error?.status === 404 ? "It may have been removed or is not published yet. " : `${d.error?.message ?? ""} `}
          <Link href="/colleges" className="font-semibold underline">
            Back to all colleges
          </Link>
        </Alert>
      ) : (
        <div role="status" aria-label="Loading college" className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-24" />
        </div>
      )}
    </main>
  );
}
