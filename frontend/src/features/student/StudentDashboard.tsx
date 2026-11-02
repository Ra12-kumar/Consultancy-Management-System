"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Alert, Card, Skeleton } from "@/components/ui/Feedback";
import { useAuth } from "@/features/auth/AuthProvider";
import { hardNavigate } from "@/lib/navigation";
import { useApiData } from "@/hooks/useApiData";
import { apiGet, apiPost } from "@/services/api";
import { StatusBadge } from "@/features/enquiry/shared";
import type { ApiError, Profile } from "@/types/api";
import type { EnquirySummary } from "@/types/enquiry";
import { CounsellorCard, Recommended, SupportCard } from "./DashboardExtras";

export function VerifyBanner({ email }: { email: string }) {
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  return (
    <Alert tone="warning" title="Please verify your email address">
      You need a verified email ({email}) to submit admission enquiries and scholarship applications. We will email you a 6-digit code.
      <div className="mt-3">
        <Button
          size="sm"
          variant="secondary"
          disabled={state.busy}
          onClick={async () => {
            setState({ busy: true });
            try {
              await apiPost<{ message: string }>("/auth/resend-verification", { email });
              hardNavigate(`/verify-email?sent=1&email=${encodeURIComponent(email)}`);
            } catch (err) {
              setState({ busy: false, error: (err as ApiError).message });
            }
          }}
        >
          {state.busy ? "Sending…" : "Send me a code"}
        </Button>
        {state.error && <p className="mt-2 text-danger">{state.error}</p>}
      </div>
    </Alert>
  );
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const profile = useApiData((signal) => apiGet<Profile>("/students/me/profile", { signal }), []);
  const enquiries = useApiData((signal) => apiGet<EnquirySummary[]>("/enquiries", { signal }), []);
  const announcements = useApiData((signal) => apiGet<Array<{ id: string; title: string; body: string }>>("/students/me/announcements", { signal }).catch(() => []), []);
  if (!user) return null;
  const completion = profile.data?.completion ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Welcome, {user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-muted">Plan your higher education step by step.</p>
      </div>
      {!user.emailVerified && <VerifyBanner email={user.email} />}
      {announcements.data?.map((a) => (
        <Alert key={a.id} tone="info" title={a.title}>
          <span className="whitespace-pre-line">{a.body}</span>
        </Alert>
      ))}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Your academic profile</h2>
          {profile.status === "loading" && !profile.data ? (
            <Skeleton className="mt-4 h-16" />
          ) : profile.status === "error" ? (
            <div className="mt-3">
              <Alert>{profile.error?.message}</Alert>
              <Button size="sm" variant="secondary" className="mt-3" onClick={profile.reload}>
                Try again
              </Button>
            </div>
          ) : (
            <>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-muted">Completed</span>
                <span className="font-semibold">{completion}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Profile completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion}>
                <div className="h-full rounded-full bg-accent" style={{ width: `${completion}%` }} />
              </div>
              <p className="mt-3 text-sm text-muted">{completion < 100 ? "Complete your profile so counsellors can suggest suitable colleges and scholarships." : "Your profile is complete."}</p>
              <ButtonLink href="/student/profile" variant={completion < 100 ? "gold" : "secondary"} size="sm" className="mt-4">
                {completion < 100 ? "Complete my profile" : "Review my profile"}
              </ButtonLink>
            </>
          )}
        </Card>
        <Card>
          <h2 className="font-semibold">Next steps</h2>
          <ol className="mt-3 space-y-2 text-sm">
            {[
              [user.emailVerified, "Verify your email address"],
              [completion === 100, "Complete your academic profile"],
              [false, <Link key="c" href="/colleges" className="underline">Explore and compare colleges</Link>],
              [Boolean(enquiries.data?.length), <Link key="e" href="/enquire?source=direct" className="underline">Submit your admission enquiry</Link>],
            ].map(([done, label], i) => (
              <li key={i} className="flex items-center gap-2">
                <span aria-hidden="true" className={`inline-flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${done ? "bg-success text-white" : "bg-surface-2 text-muted"}`}>
                  {done ? "✓" : "•"}
                </span>
                <span className={done ? "text-muted line-through" : ""}>{label}</span>
                {done ? <span className="sr-only">(done)</span> : null}
              </li>
            ))}
          </ol>
        </Card>
        <CounsellorCard enquiries={enquiries.status === "error" ? [] : (enquiries.data ?? null)} />
        <SupportCard />
        <Card className="md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">My enquiries</h2>
            <ButtonLink href="/enquire" size="sm" variant="gold">
              New enquiry
            </ButtonLink>
          </div>
          {enquiries.status === "error" ? (
            <p className="mt-3 text-sm text-muted">Your enquiries could not be loaded right now.</p>
          ) : !enquiries.data ? (
            <Skeleton className="mt-4 h-12" />
          ) : enquiries.data.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No enquiries yet. Tell us what you want to study and a counsellor will get in touch.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {enquiries.data.slice(0, 3).map((e) => (
                <li key={e.reference} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/student/enquiries/${e.reference}`} className="font-mono font-semibold hover:underline">
                    {e.reference}
                  </Link>
                  <span className="min-w-0 flex-1 truncate">{e.courses.map((c) => c.name).join(", ")}</span>
                  <StatusBadge status={e.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Recommended />
    </div>
  );
}
