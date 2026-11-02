"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LoadState } from "@/features/admin/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { useApiData } from "@/hooks/useApiData";
import { apiGet } from "@/services/api";
import type { EnquiryStatus } from "@/types/enquiry";

type Summary = {
  totals?: { students: number; activeColleges: number };
  students: { total: number };
  catalog: { colleges: { published: number } };
  conversionRate: number;
  charts: { enquiriesByDay: Array<{ date: string; count: number }>; byStatus: Array<{ status: EnquiryStatus; count: number }> };
};
type CounsellorRow = { id: string; name: string; status?: string; stats: { assigned: number; contacted: number; overdue: number; converted: number } };

// Pipeline stages shown on the dashboard, each grouping the detailed enquiry statuses.
export const PIPELINE_GROUPS: Array<{ label: string; statuses: EnquiryStatus[] }> = [
  { label: "New", statuses: ["NEW", "CONTACT_PENDING"] },
  { label: "Contacted", statuses: ["CONTACTED", "INTERESTED", "ELIGIBILITY_CHECK"] },
  { label: "Counselling", statuses: ["COUNSELLING_SCHEDULED", "COUNSELLING_COMPLETED"] },
  { label: "Documents & applications", statuses: ["DOCUMENTS_PENDING", "APPLICATION_IN_PROGRESS", "SUBMITTED", "OFFER_RECEIVED"] },
  { label: "Admitted", statuses: ["ADMITTED"] },
];

// The last 28 days of the 30-day series, as four 7-day totals (oldest first).
export function weeklyTotals(days: Array<{ date: string; count: number }>) {
  const last = days.slice(-28);
  return Array.from({ length: Math.floor(last.length / 7) }, (_, i) => {
    const week = last.slice(i * 7, i * 7 + 7);
    return { label: `W${i + 1}`, from: week[0]!.date, to: week[week.length - 1]!.date, count: week.reduce((n, d) => n + d.count, 0) };
  });
}

const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const num = (n: number) => n.toLocaleString("en-IN");
const bar = "bg-teal-700 dark:bg-teal-400";

function Panel({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 sm:p-6 ${className}`}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, href }: { label: string; value: string; href?: string }) {
  const body = (
    <>
      <span className="block text-sm text-muted">{label}</span>
      <span className="mt-1 block text-3xl font-bold">{value}</span>
    </>
  );
  const cls = "block rounded-[14px] border border-line bg-surface p-5";
  return href ? (
    <Link href={href} className={`${cls} hover:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function WeeklyChart({ days }: { days: Summary["charts"]["enquiriesByDay"] }) {
  const weeks = weeklyTotals(days);
  const max = Math.max(1, ...weeks.map((w) => w.count));
  return (
    <>
      <p className="text-xs text-muted">New enquiries in each of the last 4 weeks</p>
      <div className="mt-6 flex h-52 items-end justify-around gap-3" role="img" aria-label={`Enquiries by week: ${weeks.map((w) => `${dayLabel(w.from)} to ${dayLabel(w.to)}: ${w.count}`).join("; ")}`}>
        {weeks.map((w) => (
          <div key={w.label} className="group relative flex h-full w-14 flex-col items-center justify-end">
            <span className="mb-1 text-xs font-semibold">{w.count}</span>
            <div className={`w-full rounded-lg ${bar}`} style={{ height: `${Math.max(4, (w.count / max) * 100)}%` }} />
            <span className="mt-2 text-xs text-muted" title={`${dayLabel(w.from)} – ${dayLabel(w.to)}`}>
              {w.label}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">{weeks.length > 0 && `W1 starts ${dayLabel(weeks[0]!.from)} · W${weeks.length} ends ${dayLabel(weeks[weeks.length - 1]!.to)}`}</p>
    </>
  );
}

function Pipeline({ byStatus }: { byStatus: Summary["charts"]["byStatus"] }) {
  const rows = PIPELINE_GROUPS.map((g) => ({ label: g.label, count: byStatus.filter((s) => g.statuses.includes(s.status)).reduce((n, s) => n + s.count, 0) }));
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="mt-5 space-y-5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[7.5rem_1fr] items-center gap-3 text-sm sm:grid-cols-[8.5rem_1fr]">
          <span className="text-muted">{r.label}</span>
          <span className="flex items-center gap-2">
            <span className={`h-[22px] rounded-md ${bar}`} style={{ width: `${Math.max(2, (r.count / max) * 85)}%` }} />
            <span className="font-semibold">{num(r.count)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function CounsellorPerformance() {
  const rows = useApiData((signal) => apiGet<CounsellorRow[]>("/admin/team/counsellors", { signal }), []);
  if (!rows.data) return <LoadState status={rows.status} error={rows.error} reload={rows.reload} rows={2} />;
  if (rows.data.length === 0)
    return (
      <p className="mt-3 text-sm text-muted">
        No counsellors yet.{" "}
        <Link href="/admin/counsellors" className="font-semibold underline">
          Add a counsellor
        </Link>
      </p>
    );
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead className="text-[13px] text-muted">
          <tr>
            {["Counsellor", "Assigned", "Contacted", "Overdue", "Converted"].map((h) => (
              <th key={h} scope="col" className="pb-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line border-b border-line">
          {rows.data.map((c) => (
            <tr key={c.id}>
              <th scope="row" className="py-3 font-semibold">
                {c.name}
                {c.status && c.status !== "active" && <span className="ml-2 text-xs font-normal text-muted">(inactive)</span>}
              </th>
              <td className="py-3">{num(c.stats.assigned)}</td>
              <td className="py-3">{num(c.stats.contacted)}</td>
              <td className={`py-3 ${c.stats.overdue > 0 ? "font-semibold text-danger" : ""}`}>{num(c.stats.overdue)}</td>
              <td className="py-3">{num(c.stats.converted)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Admin dashboard from the client design: four headline figures, enquiries by week, the pipeline and
// counsellor performance. Live data from /admin/dashboard/summary and /admin/team/counsellors.
export default function AdminOverview() {
  const { user } = useAuth();
  const s = useApiData((signal) => apiGet<Summary>("/admin/dashboard/summary", { signal }), []);
  const canTeam = user?.permissions.includes("admins.manage") ?? false;
  const d = s.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Dashboard</h1>
          <p className="text-[15px] text-muted">Live figures for your consultancy.</p>
        </div>
        <Link href="/admin/insights" className="text-sm font-semibold text-accent-text hover:underline">
          Detailed dashboard with filters →
        </Link>
      </div>
      {!d ? (
        <LoadState status={s.status} error={s.error} reload={s.reload} rows={3} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Students" value={num(d.totals?.students ?? d.students.total)} href="/admin/students" />
            <Stat label="Published colleges" value={num(d.totals?.activeColleges ?? d.catalog.colleges.published)} href="/admin/colleges" />
            <Stat label="New enquiries (30 days)" value={num(d.charts.enquiriesByDay.reduce((n, x) => n + x.count, 0))} href="/admin/enquiries" />
            <Stat label="Conversion rate" value={`${d.conversionRate}%`} />
          </div>
          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <Panel title="Enquiries by week">
              <WeeklyChart days={d.charts.enquiriesByDay} />
            </Panel>
            <Panel title="Pipeline">
              <Pipeline byStatus={d.charts.byStatus} />
            </Panel>
          </div>
          {canTeam && (
            <Panel title="Counsellor performance">
              <CounsellorPerformance />
            </Panel>
          )}
          <p className="text-xs text-muted">Conversion rate = admissions confirmed with evidence ÷ all enquiries.</p>
        </>
      )}
    </div>
  );
}
