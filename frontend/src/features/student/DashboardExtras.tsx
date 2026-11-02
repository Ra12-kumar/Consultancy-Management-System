"use client";

import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Card, Skeleton } from "@/components/ui/Feedback";
import { CollegeCard } from "@/features/catalog/CatalogUi";
import CallbackRequest from "@/features/enquiry/CallbackRequest";
import { EligibilityBadge, FINISHED, MODE_LABELS, StatusBadge } from "@/features/enquiry/shared";
import SocialLinks from "@/features/content/SocialLinks";
import { useApiData } from "@/hooks/useApiData";
import { apiGet } from "@/services/api";
import type { CollegeCard as Card_ } from "@/types/catalog";
import type { Eligibility, EnquirySummary, StudentAppointment, StudentEnquiry } from "@/types/enquiry";

type Recommendations = { basis: string[]; items: Array<Card_ & { eligibility: { result: Eligibility; course: string; reasons: string[] } | null }>; deadlines: Array<{ name: string; slug: string; deadline: string; academicSession: string }> };

const BASIS: Record<string, string> = { course: "your course", location: "your preferred location", budget: "your budget", featured: "colleges featured by our team" };
const fmt = (iso: string, time = false) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata", ...(time && { hour: "numeric", minute: "2-digit" }) });

// Counsellor, callback request and next appointment for the latest open enquiry.
export function CounsellorCard({ enquiries }: { enquiries: EnquirySummary[] | null }) {
  const latest = enquiries?.find((e) => !FINISHED.includes(e.status)) ?? null;
  const detail = useApiData(async (signal) => (latest ? apiGet<StudentEnquiry>(`/enquiries/${latest.reference}`, { signal }) : null), [latest?.reference]);
  const appts = useApiData((signal) => apiGet<StudentAppointment[]>("/appointments", { signal }).catch(() => [] as StudentAppointment[]), []);
  const next = (appts.data ?? []).filter((a) => ["scheduled", "confirmed", "reschedule_requested"].includes(a.status)).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  return (
    <Card>
      <h2 className="font-semibold">Your counsellor</h2>
      {!enquiries ? (
        <Skeleton className="mt-3 h-16" />
      ) : !latest ? (
        <p className="mt-2 text-sm text-muted">Submit an enquiry and a counsellor will be assigned to help you.</p>
      ) : !detail.data ? (
        <Skeleton className="mt-3 h-16" />
      ) : (
        <div className="mt-2 space-y-3 text-sm">
          <p>
            {detail.data.counsellor ? (
              <>
                <span className="font-medium">{detail.data.counsellor}</span> is handling{" "}
              </>
            ) : (
              "A counsellor will be assigned soon to "
            )}
            <Link href={`/student/enquiries/${latest.reference}`} className="font-mono font-semibold underline">
              {latest.reference}
            </Link>{" "}
            <StatusBadge status={latest.status} />
          </p>
          {next && (
            <p className="rounded-lg bg-surface-2 px-3 py-2">
              Next session: <span className="font-semibold">{fmt(next.startsAt, true)}</span> · {MODE_LABELS[next.mode]}{" "}
              <Link href="/student/appointments" className="underline">
                details
              </Link>
            </p>
          )}
          <CallbackRequest reference={latest.reference} current={detail.data.callbackRequest} onDone={() => detail.reload()} />
        </div>
      )}
    </Card>
  );
}

// Suggested colleges and admission deadlines for shortlisted colleges.
export function Recommended() {
  const r = useApiData((signal) => apiGet<Recommendations>("/students/me/recommendations", { signal }), []);
  if (r.status === "error") return null;
  if (!r.data) return <Skeleton className="h-40" />;
  const { items, deadlines, basis } = r.data;
  return (
    <div className="space-y-4">
      {deadlines.length > 0 && (
        <Card>
          <h2 className="font-semibold">Admission deadlines coming up</h2>
          <p className="text-sm text-muted">For colleges on your shortlist. Always confirm dates on the college&apos;s official site.</p>
          <ul className="mt-3 divide-y divide-line text-sm">
            {deadlines.map((d) => (
              <li key={d.slug} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/colleges/${d.slug}`} className="font-medium hover:underline">
                  {d.name}
                </Link>
                <span>
                  Apply by <span className="font-semibold">{fmt(d.deadline)}</span>
                  {d.academicSession && <span className="text-muted"> · {d.academicSession}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <section aria-labelledby="recommended-heading">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="recommended-heading" className="text-lg font-bold">
              Recommended for you
            </h2>
            <p className="text-sm text-muted">{items.length ? `Based on ${basis.map((b) => BASIS[b] ?? b).join(", ")}.` : "Add the course and location you want in your profile to see suggestions."}</p>
          </div>
          <div className="flex gap-2">
            <ButtonLink href="/student/shortlist" size="sm" variant="secondary">
              My shortlist
            </ButtonLink>
            <ButtonLink href="/colleges" size="sm" variant="secondary">
              Search colleges
            </ButtonLink>
          </div>
        </div>
        {items.length > 0 && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((c) => (
              <div key={c.id} className="space-y-2">
                {c.eligibility && (
                  <p className="flex flex-wrap items-center gap-2 text-xs" title={c.eligibility.reasons.join(" · ")}>
                    <EligibilityBadge value={c.eligibility.result} />
                    <span className="text-muted">for {c.eligibility.course}</span>
                  </p>
                )}
                <CollegeCard college={c} source="recommended" />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function SupportCard() {
  return (
    <Card>
      <h2 className="font-semibold">Need help?</h2>
      <p className="mt-1 text-sm text-muted">Questions about admissions, fees or your account? We are here to help.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <ButtonLink href="/contact" size="sm" variant="secondary">
          Contact us
        </ButtonLink>
        <ButtonLink href="/student/feedback" size="sm" variant="secondary">
          Send feedback
        </ButtonLink>
        <ButtonLink href="/student/notifications" size="sm" variant="secondary">
          Notifications
        </ButtonLink>
        <ButtonLink href="/courses/browse" size="sm" variant="secondary">
          Browse courses
        </ButtonLink>
      </div>
      <SocialLinks />
    </Card>
  );
}
