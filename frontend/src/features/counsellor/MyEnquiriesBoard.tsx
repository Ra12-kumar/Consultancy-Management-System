"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Badge, EmptyState } from "@/components/ui/Feedback";
import { LoadState, Pager } from "@/features/admin/shared";
import { telHref } from "@/features/admin/enquiries/PhoneActions";
import { StatusBadge } from "@/features/enquiry/shared";
import { useApiData } from "@/hooks/useApiData";
import { waHref } from "@/lib/whatsapp";
import { api, apiGet } from "@/services/api";
import type { PageMeta } from "@/types/api";
import type { AdminEnquiryRow } from "@/types/enquiry";

type Summary = { assignedOpen: number; assignedTotal: number; converted: number; followUpsToday: number; followUpsOverdue: number };

// The four headline counts double as filters for the table below.
const STATS: Array<{ label: string; key: keyof Summary; quick: string; tone?: string }> = [
  { label: "Assigned", key: "assignedTotal", quick: "" },
  { label: "Follow-ups today", key: "followUpsToday", quick: "today" },
  { label: "Overdue", key: "followUpsOverdue", quick: "overdue", tone: "text-danger" },
  { label: "Converted", key: "converted", quick: "admitted", tone: "text-success" },
];
const MORE: Array<[string, string]> = [
  ["new", "New"],
  ["callback", "Callback requests"],
];

const istDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
const shortDate = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(d);

// "Today", "Overdue 2 days" or a short date, all in India time.
export function followUpLabel(iso: string | null, now = new Date()): { text: string; overdue: boolean } {
  if (!iso) return { text: "—", overdue: false };
  const at = new Date(iso);
  const days = Math.round((Date.parse(istDay(now)) - Date.parse(istDay(at))) / 86_400_000);
  if (days === 0) return { text: "Today", overdue: false };
  if (days > 0) return { text: `Overdue ${days} day${days === 1 ? "" : "s"}`, overdue: true };
  return { text: shortDate(at), overdue: false };
}

const action = "rounded font-semibold text-accent-text hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none";

function RowActions({ e }: { e: AdminEnquiryRow }) {
  const wa = waHref(e.studentMobile);
  return (
    <span className="inline-flex flex-wrap gap-3 text-xs">
      {e.studentMobile ? (
        <a href={telHref(e.studentMobile)} className={action} aria-label={`Call ${e.studentName}`}>
          Call
        </a>
      ) : (
        <span className="text-muted">No phone</span>
      )}
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className={action} aria-label={`Chat on WhatsApp with ${e.studentName}`}>
          WhatsApp
        </a>
      )}
      <Link href={`/counsellor/enquiries/${e.id}`} className={action} aria-label={`Notes for ${e.reference}`}>
        Notes
      </Link>
    </span>
  );
}

function FollowUp({ e }: { e: AdminEnquiryRow }) {
  const f = followUpLabel(e.followUpAt);
  return <span className={f.overdue || e.followUpDue ? "font-semibold text-danger" : ""}>{f.text}</span>;
}

// Counsellor "My enquiries": headline counts, then a table of the enquiries assigned to this counsellor
// with one-tap Call, WhatsApp and Notes. Uses the existing /counsellor/summary and /counsellor/enquiries APIs.
export default function MyEnquiriesBoard() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const quick = params.get("quick") ?? "";
  const [q, setQ] = useState(params.get("q") ?? "");
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ sort: quick === "today" || quick === "overdue" ? "follow_up" : "activity", page: String(page), ...(quick && { quick }), ...(params.get("q") && { q: params.get("q")! }) });
  const summary = useApiData((signal) => apiGet<Summary>("/counsellor/summary", { signal }), []);
  const list = useApiData(async (signal) => {
    const { data, meta } = await api<AdminEnquiryRow[]>("GET", `/counsellor/enquiries?${qs}`, { signal });
    return { items: data, meta: meta as PageMeta };
  }, [qs.toString()]);
  const go = (next: Record<string, string>) => {
    const p = new URLSearchParams({ ...(quick && { quick }), ...(params.get("q") && { q: params.get("q")! }), ...next });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    setPage(1);
    router.replace(`${pathname}${p.size ? `?${p}` : ""}`, { scroll: false });
  };
  const chip = (on: boolean) => `min-h-9 rounded-full px-3 text-xs font-medium ring-1 ring-line ${on ? "bg-primary text-primary-fg" : "bg-surface hover:bg-surface-2"}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My enquiries</h1>
        <p className="text-sm text-muted">Only enquiries assigned to you are shown.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label="Enquiry counts (select one to filter)">
        {STATS.map((s) => (
          <button key={s.key} type="button" aria-pressed={quick === s.quick} onClick={() => go({ quick: s.quick })} className={`rounded-xl border bg-surface p-4 text-left hover:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${quick === s.quick ? "border-accent ring-1 ring-accent" : "border-line"}`}>
            <span className="block text-xs text-muted">{s.label}</span>
            <span className={`mt-1 block text-2xl font-bold ${s.tone ?? ""}`}>{summary.data ? summary.data[s.key] : "–"}</span>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <form
            role="search"
            onSubmit={(ev) => {
              ev.preventDefault();
              go({ q: q.trim() });
            }}
            className="flex min-w-0 flex-1 basis-full gap-2 sm:basis-0"
          >
            <input type="search" aria-label="Search my enquiries" placeholder="Reference, name, email or phone" value={q} onChange={(ev) => setQ(ev.target.value)} className="min-h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm" />
          </form>
          <div className="flex gap-2" role="group" aria-label="More filters">
            {MORE.map(([k, l]) => (
              <button key={k} type="button" aria-pressed={quick === k} onClick={() => go({ quick: quick === k ? "" : k })} className={chip(quick === k)}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {!list.data ? (
          <div className="p-4">
            <LoadState status={list.status} error={list.error} reload={list.reload} />
          </div>
        ) : list.data.items.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Nothing here">{quick || params.get("q") ? "No enquiries match this filter." : "No enquiries are assigned to you yet."}</EmptyState>
          </div>
        ) : (
          <>
            {/* Desktop and tablet: a table. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="px-4 py-2.5 font-medium">Reference</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Student</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Course</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Follow-up</th>
                    <th scope="col" className="px-4 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {list.data.items.map((e) => (
                    <tr key={e.id} className="hover:bg-surface-2">
                      <td className="px-4 py-3.5 font-mono text-xs font-semibold whitespace-nowrap">
                        <Link href={`/counsellor/enquiries/${e.id}`} className="hover:underline">
                          {e.reference}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5">
                        {e.studentName}
                        {e.callbackRequested && (
                          <span className="ml-2">
                            <Badge tone="warning">Callback</Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">{e.courses.join(", ") || "—"}</td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={e.status} admin />
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <FollowUp e={e} />
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <RowActions e={e} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Phones: one card per enquiry. */}
            <ul className="divide-y divide-line md:hidden">
              {list.data.items.map((e) => (
                <li key={e.id} className="space-y-1.5 p-4 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/counsellor/enquiries/${e.id}`} className="font-semibold hover:underline">
                      {e.studentName}
                    </Link>
                    <StatusBadge status={e.status} admin />
                  </div>
                  <p className="text-xs text-muted">
                    <span className="font-mono">{e.reference}</span> · {e.courses.join(", ") || "—"}
                  </p>
                  <p className="text-xs">
                    Follow-up: <FollowUp e={e} />
                  </p>
                  <RowActions e={e} />
                </li>
              ))}
            </ul>
            <div className="border-t border-line p-3">
              <Pager meta={list.data.meta} onPage={setPage} />
            </div>
          </>
        )}
      </div>
      <p className="text-xs text-muted">Internal notes are never shown to students.</p>
    </div>
  );
}
