"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PIPELINE_GROUPS, weeklyTotals } from "@/features/admin/AdminOverview";
import { LoadState } from "@/features/admin/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { useApiData } from "@/hooks/useApiData";
import { apiGet } from "@/services/api";
import type { EnquiryStatus } from "@/types/enquiry";
import { Icon, type IconName } from "./icons";

// Admin dashboard from the client design ("Udaan admin dashboard"): headline figures, enquiries by week,
// the enquiry pipeline, next steps worked out from the figures, and quick links. Live data from
// GET /api/admin/dashboard/summary.

type Summary = {
  totals?: { students: number; activeColleges: number };
  students: { total: number };
  catalog: { colleges: { published: number } };
  conversionRate: number;
  charts: { enquiriesByDay: Array<{ date: string; count: number }>; byStatus: Array<{ status: EnquiryStatus; count: number }> };
};

const num = (n: number) => n.toLocaleString("en-IN");
const plural = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;
const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const card = "rounded-2xl border border-line bg-surface";

function Stat({ label, value, note, icon, href }: { label: string; value: string; note: string; icon: IconName; href?: string }) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="text-xs text-muted">{label}</span>
        <Icon name={icon} className="text-muted" />
      </span>
      <span className="mt-3 block text-3xl font-semibold tracking-tight">{value}</span>
      <span className="mt-3 block text-[11px] text-muted">{note}</span>
    </>
  );
  const cls = `${card} block p-5`;
  return href ? (
    <Link href={href} className={`${cls} transition hover:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Panel({ title, note, aside, children, footer }: { title: string; note?: string; aside?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className={`${card} flex flex-col p-5 sm:p-6`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {note && <p className="mt-0.5 text-[11px] text-muted">{note}</p>}
        </div>
        {aside}
      </div>
      <div className="flex-1">{children}</div>
      {footer && <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-[11px]">{footer}</div>}
    </section>
  );
}

function WeeklyChart({ days }: { days: Summary["charts"]["enquiriesByDay"] }) {
  const weeks = weeklyTotals(days);
  const total = weeks.reduce((n, w) => n + w.count, 0);
  const max = Math.max(1, ...weeks.map((w) => w.count));
  return (
    <>
      <p className="mt-5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold">{num(total)}</span>
        <span className="text-[11px] text-muted">{total === 1 ? "enquiry" : "enquiries"} this period</span>
      </p>
      <div className="mt-4 grid grid-cols-[1.5rem_1fr] gap-2">
        <div aria-hidden="true" className="flex h-48 flex-col justify-between text-right text-[10px] text-muted">
          <span>{num(max)}</span>
          <span>0</span>
        </div>
        <div
          role="img"
          aria-label={`Enquiries by week: ${weeks.map((w, i) => `week ${i + 1} (${dayLabel(w.from)} to ${dayLabel(w.to)}): ${w.count}`).join("; ")}`}
          className="relative flex h-48 items-end justify-around border-b border-line"
        >
          <span aria-hidden="true" className="absolute inset-x-0 top-0 border-t border-dashed border-line" />
          {weeks.map((w, i) => (
            <div key={w.label} className="relative flex h-full w-[16%] max-w-16 flex-col items-center justify-end" title={`${dayLabel(w.from)} – ${dayLabel(w.to)}: ${w.count}`}>
              <span className="mb-1 text-[10px] font-semibold">{w.count}</span>
              <div className={`w-full rounded-t-md ${w.count ? "bg-navy dark:bg-gold" : "bg-line"}`} style={{ height: w.count ? `${(w.count / max) * 88}%` : "3px" }} />
              <span className="absolute -bottom-6 text-[10px] whitespace-nowrap text-muted">Week {i + 1}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-8 text-[10px] text-muted">{weeks.length > 0 && `Week 1 starts ${dayLabel(weeks[0]!.from)} · Week ${weeks.length} ends ${dayLabel(weeks[weeks.length - 1]!.to)}`}</p>
    </>
  );
}

export default function AdminWorkspaceDashboard() {
  const { user } = useAuth();
  const s = useApiData((signal) => apiGet<Summary>("/admin/dashboard/summary", { signal }), []);
  const can = (p: string) => user?.permissions.includes(p) ?? false;
  const d = s.data;
  const firstName = user?.name.split(" ")[0] ?? "Admin";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold tracking-[1.8px] text-muted uppercase">Your consultancy, at a glance</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-[28px]">Dashboard</h1>
          <p className="mt-1 text-xs text-muted">Welcome back, {firstName}. Live figures for your consultancy.</p>
        </div>
        <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs font-semibold" title="Enquiry figures cover the last 30 days">
          <Icon name="calendar" size={14} />
          Last 30 days
        </span>
      </div>

      {!d ? (
        <LoadState status={s.status} error={s.error} reload={s.reload} rows={3} />
      ) : (
        (() => {
          const students = d.totals?.students ?? d.students.total;
          const published = d.totals?.activeColleges ?? d.catalog.colleges.published;
          const newIn30 = d.charts.enquiriesByDay.reduce((n, x) => n + x.count, 0);
          const count = (statuses: EnquiryStatus[]) => d.charts.byStatus.filter((x) => statuses.includes(x.status)).reduce((n, x) => n + x.count, 0);
          const waiting = count(["NEW"]);
          const admitted = count(["ADMITTED"]);
          const pipeline = PIPELINE_GROUPS.map((g) => ({ label: g.label, count: count(g.statuses) }));
          const inPipeline = pipeline.reduce((n, r) => n + r.count, 0);
          const pipeMax = Math.max(1, ...pipeline.map((r) => r.count));
          const steps = [
            waiting > 0 &&
              can("enquiries.manage") && {
                icon: "enquiries" as const,
                title: waiting === 1 ? "Review your new enquiry" : "Review your new enquiries",
                badge: `${num(waiting)} new`,
                text: "Move the conversation forward with a first follow-up.",
                action: "Review",
                href: "/admin/enquiries?quick=new",
              },
            published === 0 &&
              can("catalog.manage") && {
                icon: "colleges" as const,
                title: "Publish your first college",
                badge: null,
                text: "Build your catalogue so students can explore their options.",
                action: "Manage",
                href: "/admin/colleges",
              },
          ].filter((x): x is Exclude<typeof x, false> => Boolean(x));
          const quick = [
            can("students.read") && { icon: "students" as const, title: "Students", note: plural(students, "student record", "student records"), href: "/admin/students" },
            (can("catalog.manage") || can("pricing.manage")) && { icon: "colleges" as const, title: "Colleges", note: `${num(published)} published`, href: "/admin/colleges" },
            can("catalog.manage") && { icon: "courses" as const, title: "Courses", note: "Manage catalogue", href: "/admin/courses" },
            can("scholarships.manage") && { icon: "scholarships" as const, title: "Scholarships", note: "Manage opportunities", href: "/admin/scholarships" },
          ].filter((x): x is Exclude<typeof x, false> => Boolean(x));

          return (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Students" value={num(students)} note="Total student records" icon="students" href={can("students.read") ? "/admin/students" : undefined} />
                <Stat label="Published colleges" value={num(published)} note={published ? "Live on the website" : "No colleges published yet"} icon="colleges" href={can("catalog.manage") ? "/admin/colleges" : undefined} />
                <Stat label="New enquiries" value={num(newIn30)} note="Received in the last 30 days" icon="enquiries" href={can("enquiries.manage") ? "/admin/enquiries" : undefined} />
                <Stat label="Conversion rate" value={`${d.conversionRate}%`} note={admitted ? `${plural(admitted, "admission", "admissions")} confirmed` : "No enquiries admitted yet"} icon="swap" />
              </div>

              <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
                <Panel
                  title="Enquiries by week"
                  note="New enquiries over the last 4 weeks"
                  aside={
                    <span className="flex items-center gap-1.5 text-[10px] text-muted">
                      <span aria-hidden="true" className="size-2 rounded-full bg-navy dark:bg-gold" />
                      Enquiries
                    </span>
                  }
                >
                  <WeeklyChart days={d.charts.enquiriesByDay} />
                </Panel>
                <Panel
                  title="Enquiry pipeline"
                  note="A clear view of the admissions journey"
                  aside={<Icon name="sort" className="text-muted" />}
                  footer={
                    <>
                      <span className="text-muted">{plural(inPipeline, "enquiry", "enquiries")} in your pipeline</span>
                      {can("enquiries.manage") && (
                        <Link href="/admin/enquiries" className="inline-flex items-center gap-1 font-semibold hover:underline">
                          View enquiries <Icon name="arrowRight" size={12} />
                        </Link>
                      )}
                    </>
                  }
                >
                  <ul className="mt-5 space-y-4">
                    {pipeline.map((r) => (
                      <li key={r.label} className="grid grid-cols-[minmax(0,8.5rem)_1fr_2rem] items-center gap-3 text-[11px]">
                        <span className="text-muted">{r.label}</span>
                        <span className="h-1.5 rounded-full bg-line">
                          <span className="block h-full rounded-full bg-gold" style={{ width: `${(r.count / pipeMax) * 100}%` }} />
                        </span>
                        <span className="text-right font-semibold">{num(r.count)}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>

              <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
                <Panel title="Your next steps" aside={<span className="text-[10px] text-muted">{steps.length ? plural(steps.length, "focus area", "focus areas") : "All caught up"}</span>}>
                  {steps.length === 0 ? (
                    <p className="mt-5 text-xs text-muted">Nothing needs your attention right now. New enquiries and catalogue gaps will show here.</p>
                  ) : (
                    <ul className="mt-4 divide-y divide-line">
                      {steps.map((st) => (
                        <li key={st.title} className="flex items-center gap-3 py-4">
                          <span aria-hidden="true" className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-text">
                            <Icon name={st.icon} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                              {st.title}
                              {st.badge && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium">{st.badge}</span>}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-muted">{st.text}</span>
                          </span>
                          <Link href={st.href} className="inline-flex items-center gap-1 text-[11px] font-semibold hover:underline">
                            {st.action}
                            <Icon name="arrowUpRight" size={12} className="text-accent-text" />
                            <span className="sr-only">: {st.title}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
                {quick.length > 0 && (
                  <Panel title="Quick access">
                    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                      {quick.map((q) => (
                        <li key={q.href}>
                          <Link href={q.href} className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
                            <Icon name={q.icon} className="text-muted" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-semibold">{q.title}</span>
                              <span className="block truncate text-[10px] text-muted">{q.note}</span>
                            </span>
                            <Icon name="chevronRight" size={14} className="text-muted" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                )}
              </div>

              <div className="flex flex-col gap-2 text-[10px] text-muted sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-1.5">
                  <Icon name="info" size={12} />
                  Enquiry metrics reflect the last 30 days. Students and colleges show current totals.
                </p>
                <p>Udaan · Admin</p>
              </div>
            </>
          );
        })()
      )}
    </div>
  );
}
