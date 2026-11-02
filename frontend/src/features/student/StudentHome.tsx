"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Alert, Skeleton } from "@/components/ui/Feedback";
import { useAuth } from "@/features/auth/AuthProvider";
import { EligibilityBadge, FINISHED, StatusBadge } from "@/features/enquiry/shared";
import { useApiData } from "@/hooks/useApiData";
import { apiGet } from "@/services/api";
import type { Profile } from "@/types/api";
import type { CollegeCard } from "@/types/catalog";
import type { Eligibility, EnquiryStatus, EnquirySummary, StudentEnquiry } from "@/types/enquiry";
import { CounsellorCard, SupportCard } from "./DashboardExtras";
import { VerifyBanner } from "./StudentDashboard";

type Recommendations = { items: Array<CollegeCard & { eligibility: { result: Eligibility; course: string; reasons: string[] } | null }>; deadlines: Array<{ name: string; slug: string; deadline: string; academicSession: string }> };

// The five milestones shown to students, and which enquiry statuses fall under each.
export const MILESTONES: Array<{ label: string; statuses: EnquiryStatus[] }> = [
  { label: "Submitted", statuses: ["NEW", "CONTACT_PENDING"] },
  { label: "Contacted", statuses: ["CONTACTED", "INTERESTED", "ELIGIBILITY_CHECK"] },
  { label: "Counselling", statuses: ["COUNSELLING_SCHEDULED", "COUNSELLING_COMPLETED"] },
  { label: "Documents", statuses: ["DOCUMENTS_PENDING", "APPLICATION_IN_PROGRESS", "SUBMITTED", "OFFER_RECEIVED"] },
  { label: "Admitted", statuses: ["ADMITTED"] },
];
// -1 for statuses outside the main path (on hold, withdrawn, closed…).
export const milestoneOf = (status: EnquiryStatus) => MILESTONES.findIndex((m) => m.statuses.includes(status));

export function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(now));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

const teal = "bg-teal-700 dark:bg-teal-400";
const link = "text-sm font-semibold text-teal-700 hover:underline dark:text-teal-300";
const panel = "rounded-2xl border border-line bg-surface p-6 sm:p-7";
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

function Milestones({ status }: { status: EnquiryStatus }) {
  const at = milestoneOf(status);
  if (at < 0) return <p className="mt-6 text-sm text-muted">This enquiry is not moving through the admission steps right now. Open it for details.</p>;
  return (
    <ol className="mt-10 grid grid-cols-5" aria-label="Admission progress">
      {MILESTONES.map((m, i) => {
        const done = i <= at;
        return (
          <li key={m.label} className="relative flex flex-col items-center text-center" aria-current={i === at ? "step" : undefined}>
            {i > 0 && <span aria-hidden="true" className={`absolute top-[9px] right-1/2 h-[3px] w-full rounded ${i <= at ? teal : "bg-line"}`} />}
            <span aria-hidden="true" className={`relative size-5 rounded-full ${done ? teal : "border border-line bg-surface"}`} />
            <span className={`mt-3 px-0.5 text-[10px] leading-tight font-semibold break-words sm:text-[13px] ${done ? "" : "text-muted"}`}>
              {m.label}
              <span className="sr-only">{done ? " (done)" : " (not yet)"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function EnquiryPanel({ enquiries }: { enquiries: EnquirySummary[] | null }) {
  const latest = enquiries?.find((e) => !FINISHED.includes(e.status)) ?? enquiries?.[0] ?? null;
  return (
    <section className={panel} aria-labelledby="your-enquiry">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="your-enquiry" className="text-lg font-semibold">
          Your enquiry
        </h2>
        {latest && (
          <Link href="/student/enquiries" className={link}>
            All enquiries
          </Link>
        )}
      </div>
      {!enquiries ? (
        <Skeleton className="mt-4 h-28" />
      ) : !latest ? (
        <>
          <p className="mt-2 text-sm text-muted">No enquiry yet. Tell us what you want to study and a counsellor will get in touch.</p>
          <ButtonLink href="/enquire?source=direct" variant="gold" size="sm" className="mt-4">
            Submit an admission enquiry
          </ButtonLink>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">
            <Link href={`/student/enquiries/${latest.reference}`} className="font-mono hover:underline">
              {latest.reference}
            </Link>
            {[...latest.colleges.map((c) => c.name), ...latest.courses.map((c) => c.name)].map((n) => ` · ${n}`).join("")}
          </p>
          <p className="mt-3">
            <StatusBadge status={latest.status} />
          </p>
          <Milestones status={latest.status} />
        </>
      )}
    </section>
  );
}

function ProfilePanel({ profile, counsellor }: { profile: Profile | undefined; counsellor: ReactNode }) {
  const completion = profile?.completion ?? 0;
  const needsMarks = profile && profile.marks?.class12.percentage == null;
  return (
    <section className={panel} aria-labelledby="profile-completion">
      <h2 id="profile-completion" className="text-lg font-semibold">
        Profile completion
      </h2>
      {!profile ? (
        <Skeleton className="mt-4 h-24" />
      ) : (
        <>
          <p className="mt-2 text-[44px] leading-tight font-bold text-teal-700 dark:text-teal-300">{completion}%</p>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Profile completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion}>
            <div className={`h-full rounded-full ${teal}`} style={{ width: `${completion}%` }} />
          </div>
          <p className="mt-4 text-sm text-muted">
            {needsMarks ? "Add your Class 12 marks to unlock eligibility checks." : completion < 100 ? "Complete your profile so counsellors can suggest suitable colleges." : "Your profile is complete."}{" "}
            {(needsMarks || completion < 100) && (
              <Link href="/student/profile" className={link}>
                Update profile
              </Link>
            )}
          </p>
          <div className="mt-8 text-sm font-semibold">{counsellor}</div>
        </>
      )}
    </section>
  );
}

function CounsellorName({ reference }: { reference: string | null }) {
  const e = useApiData(async (signal) => (reference ? apiGet<StudentEnquiry>(`/enquiries/${reference}`, { signal }) : null), [reference]);
  if (!reference) return null;
  if (!e.data) return <Skeleton className="h-5 w-40" />;
  return <>{e.data.counsellor ? `Counsellor: ${e.data.counsellor}` : "A counsellor will be assigned soon."}</>;
}

function RecommendedCards() {
  const r = useApiData((signal) => apiGet<Recommendations>("/students/me/recommendations", { signal }), []);
  if (r.status === "error") return null;
  return (
    <section aria-labelledby="recommended-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="recommended-heading" className="text-lg font-semibold">
          Recommended for you
        </h2>
        <Link href="/colleges" className={link}>
          Find colleges
        </Link>
      </div>
      {!r.data ? (
        <Skeleton className="h-64" />
      ) : r.data.items.length === 0 ? (
        <p className="text-sm text-muted">Add the course and location you want in your profile to see suggestions.</p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {r.data.items.slice(0, 3).map((c) => (
            <li key={c.id} className="flex flex-col rounded-2xl border border-line bg-surface p-5">
              {c.imageUrl || c.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- college photo from our own image API or an admin-entered https URL
                <img src={(c.imageUrl ?? c.coverUrl)!} alt="" loading="lazy" className="h-32 w-full rounded-xl object-cover" />
              ) : (
                <div aria-hidden="true" className="h-32 rounded-xl bg-teal-100 dark:bg-teal-900/40" />
              )}
              {c.eligibility && (
                <p className="mt-4" title={c.eligibility.reasons.join(" · ")}>
                  <EligibilityBadge value={c.eligibility.result} />
                </p>
              )}
              <h3 className="mt-3 font-semibold">
                {c.name}
                {c.eligibility && ` – ${c.eligibility.course}`}
              </h3>
              <p className="mt-1 text-sm text-muted">
                {[c.city, c.state].filter(Boolean).join(", ")} · {c.feeFromMinor != null ? "Fee verified" : "Fees not yet verified"}
                {c.isSample && " (sample)"}
              </p>
              <Link href={`/colleges/${c.slug}`} className={`${link} mt-auto pt-3`}>
                View details<span className="sr-only"> for {c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {r.data && r.data.deadlines.length > 0 && (
        <div className={panel}>
          <h3 className="font-semibold">Admission deadlines coming up</h3>
          <ul className="mt-2 divide-y divide-line text-sm">
            {r.data.deadlines.map((d) => (
              <li key={d.slug} className="flex flex-wrap justify-between gap-2 py-2">
                <Link href={`/colleges/${d.slug}`} className="font-medium hover:underline">
                  {d.name}
                </Link>
                <span>
                  Apply by <span className="font-semibold">{fmt(d.deadline)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// Student dashboard from the client design: greeting, the latest enquiry with its admission steps, profile
// completion with the counsellor, and recommended colleges. Help, callbacks and sessions stay below.
export default function StudentHome() {
  const { user } = useAuth();
  const profile = useApiData((signal) => apiGet<Profile>("/students/me/profile", { signal }), []);
  const enquiries = useApiData((signal) => apiGet<EnquirySummary[]>("/enquiries", { signal }), []);
  const announcements = useApiData((signal) => apiGet<Array<{ id: string; title: string; body: string }>>("/students/me/announcements", { signal }).catch(() => []), []);
  if (!user) return null;
  const list = enquiries.status === "error" ? [] : (enquiries.data ?? null);
  const open = list?.find((e) => !FINISHED.includes(e.status)) ?? null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">
          {greeting()}, {user.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-[15px] text-muted">Here&apos;s where your college search stands.</p>
      </div>
      {!user.emailVerified && <VerifyBanner email={user.email} />}
      {announcements.data?.map((a) => (
        <Alert key={a.id} tone="info" title={a.title}>
          <span className="whitespace-pre-line">{a.body}</span>
        </Alert>
      ))}
      {profile.status === "error" && <Alert>{profile.error?.message}</Alert>}
      <div className="grid gap-5 lg:grid-cols-[860fr_480fr]">
        <EnquiryPanel enquiries={list} />
        <ProfilePanel profile={profile.data} counsellor={<CounsellorName reference={open?.reference ?? null} />} />
      </div>
      <RecommendedCards />
      <div className="grid gap-4 md:grid-cols-2">
        <CounsellorCard enquiries={list} />
        <SupportCard />
      </div>
    </div>
  );
}
