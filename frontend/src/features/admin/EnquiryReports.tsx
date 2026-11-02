"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, EmptyState } from "@/components/ui/Feedback";
import { ADMIN_LABELS } from "@/features/enquiry/shared";
import { useApiData } from "@/hooks/useApiData";
import { api, apiGet } from "@/services/api";
import type { AdminCollege, Course } from "@/types/catalog";
import type { Counsellor } from "@/types/enquiry";
import { LoadState, PageTitle } from "./shared";

type Stats = { total: number; new: number; pending: number; converted: number; closed: number; conversionRate: number };
type Row = Stats & { id: string | null; name: string };
type Report = { totals: Stats; byCounsellor: Row[]; byCollege: Row[]; byCourse: Row[] };
const COLS: Array<[keyof Stats, string]> = [
  ["total", "Enquiries"],
  ["new", "New"],
  ["pending", "Pending"],
  ["converted", "Converted"],
  ["closed", "Closed"],
  ["conversionRate", "Conversion %"],
];

// Turns the filters into query strings: the report's own, and the enquiry list/CSV export's (same meaning).
export function reportQueries(f: Record<string, string>) {
  const dates = (k: string, v: string) => (k === "from" ? `${v}T00:00:00+05:30` : k === "to" ? `${v}T23:59:59+05:30` : v);
  const report = new URLSearchParams(Object.entries(f).filter(([, v]) => v).map(([k, v]) => [k, dates(k, v)]));
  const list = new URLSearchParams(Object.entries(f).filter(([, v]) => v).map(([k, v]) => [k === "counsellor" ? "assigned" : k, dates(k, v)]));
  list.set("sort", "newest");
  return { report: report.toString(), list: list.toString() };
}

function Table({ title, rows, link }: { title: string; rows: Row[]; link: (r: Row) => string | null }) {
  return (
    <Card>
      <h2 className="font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No enquiries for these filters.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 pr-3 font-semibold">Name</th>
                {COLS.map(([, l]) => (
                  <th key={l} className="px-2 py-2 text-right font-semibold">
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const href = link(r);
                return (
                  <tr key={r.id ?? "none"} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3">
                      {href ? (
                        <Link href={href} className="hover:underline">
                          {r.name}
                        </Link>
                      ) : (
                        r.name
                      )}
                    </td>
                    {COLS.map(([k]) => (
                      <td key={k} className="px-2 py-2 text-right tabular-nums">
                        {r[k]}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function EnquiryReports() {
  const [f, setF] = useState<Record<string, string>>({ from: "", to: "", college: "", course: "", counsellor: "", status: "" });
  const { report, list } = reportQueries(f);
  const data = useApiData((signal) => apiGet<Report>(`/admin/reports/enquiries${report ? `?${report}` : ""}`, { signal }), [report]);
  const options = useApiData(async (signal) => {
    const [courses, people, colleges] = await Promise.all([apiGet<Course[]>("/courses", { signal }), apiGet<Counsellor[]>("/admin/counsellors", { signal }).catch(() => [] as Counsellor[]), api<AdminCollege[]>("GET", "/admin/colleges?limit=100", { signal }).then((r) => r.data).catch(() => [] as AdminCollege[])]);
    return { courses, people, colleges };
  }, []);
  const ctl = "mt-1 min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm";
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const t = data.data?.totals;
  return (
    <div className="space-y-6">
      <PageTitle
        title="Enquiry reports"
        subtitle="Counsellor-, college- and course-wise results. Converted means admission confirmed with evidence."
        action={
          <a href={`/api/admin/enquiries/export?${list}`} download className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold hover:bg-surface-2">
            Export CSV (opens in Excel)
          </a>
        }
      />
      <Card>
        <div role="search" aria-label="Report filters" className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <label className="block text-sm font-medium">
            From
            <input type="date" className={ctl} value={f.from} onChange={set("from")} />
          </label>
          <label className="block text-sm font-medium">
            To
            <input type="date" className={ctl} value={f.to} onChange={set("to")} />
          </label>
          <label className="block text-sm font-medium">
            College
            <select className={ctl} value={f.college} onChange={set("college")}>
              <option value="">All colleges</option>
              {options.data?.colleges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Course
            <select className={ctl} value={f.course} onChange={set("course")}>
              <option value="">All courses</option>
              {options.data?.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Counsellor
            <select className={ctl} value={f.counsellor} onChange={set("counsellor")}>
              <option value="">Everyone</option>
              <option value="unassigned">Unassigned</option>
              {options.data?.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Status
            <select className={ctl} value={f.status} onChange={set("status")}>
              <option value="">Any status</option>
              {Object.entries(ADMIN_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>
      {!data.data ? (
        <LoadState status={data.status} error={data.error} reload={data.reload} rows={3} />
      ) : t && t.total === 0 ? (
        <EmptyState title="No enquiries match">Change the filters to see results.</EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {COLS.map(([k, l]) => (
              <Card key={k}>
                <p className="text-xs text-muted">{l}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{t![k]}</p>
              </Card>
            ))}
          </div>
          <Table title="By counsellor" rows={data.data.byCounsellor} link={(r) => `/admin/enquiries?assigned=${r.id ?? "unassigned"}`} />
          <Table title="By college" rows={data.data.byCollege} link={(r) => (r.id ? `/admin/enquiries?college=${r.id}` : null)} />
          <Table title="By course" rows={data.data.byCourse} link={(r) => (r.id ? `/admin/enquiries?course=${r.id}` : null)} />
        </>
      )}
    </div>
  );
}
