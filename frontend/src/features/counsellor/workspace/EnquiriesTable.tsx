"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { telHref } from "@/features/admin/enquiries/PhoneActions";
import { Icon, type IconName } from "@/features/admin/workspace/icons";
import { ADMIN_LABELS, PIPELINE, SIDE, SOURCE_LABELS } from "@/features/enquiry/shared";
import { useApiData } from "@/hooks/useApiData";
import { waHref } from "@/lib/whatsapp";
import { api, apiGet } from "@/services/api";
import type { PageMeta } from "@/types/api";
import type { AdminEnquiryRow, EnquiryStatus } from "@/types/enquiry";

// Counsellor "My Enquiries" table in the client design. Same data as before (GET /api/counsellor/enquiries,
// only enquiries assigned to this counsellor). Tabs, search and filters live in the URL, so the side menu
// (Follow-ups, Assigned Students) and the browser's back button stay in step.

type Summary = { assignedOpen: number; assignedTotal: number; converted: number; followUpsToday: number; followUpsOverdue: number };
type Course = { id: string; name: string };

const TABS: Array<{ quick: string; label: string; icon: IconName; tone?: string }> = [
  { quick: "", label: "All Enquiries", icon: "tasks" },
  { quick: "callback", label: "Callback Requests", icon: "phone" },
  { quick: "today", label: "Follow-ups", icon: "calendar" },
  { quick: "overdue", label: "Overdue", icon: "info", tone: "text-rose-600" },
  { quick: "admitted", label: "Converted", icon: "checkCircle", tone: "text-emerald-600" },
];
const PERIODS = [
  ["", "All time"],
  ["7", "Last 7 Days"],
  ["30", "Last 30 Days"],
  ["90", "Last 90 Days"],
] as const;
const IST = "Asia/Kolkata";
const istDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(d);
const requested = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: IST, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const AVATAR = ["bg-violet-100 text-violet-700", "bg-sky-100 text-sky-700", "bg-rose-100 text-rose-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700"];

// One status pill: an overdue or today's follow-up is what the counsellor acts on first; otherwise the stage.
function statusPill(e: AdminEnquiryRow): { text: string; cls: string } {
  const finished = ["ADMITTED", "NOT_INTERESTED", "REJECTED", "WITHDRAWN", "CLOSED"].includes(e.status);
  if (!finished && e.followUpAt) {
    const due = istDay(new Date(e.followUpAt));
    const today = istDay(new Date());
    if (due < today) return { text: "Overdue", cls: "bg-rose-100 text-rose-700" };
    if (due === today) return { text: "• Follow-up", cls: "bg-sky-100 text-sky-700" };
  }
  if (e.status === "NEW") return { text: "New", cls: "bg-violet-100 text-violet-700" };
  if (e.status === "ADMITTED") return { text: ADMIN_LABELS.ADMITTED, cls: "bg-emerald-100 text-emerald-700" };
  if (finished) return { text: ADMIN_LABELS[e.status], cls: "bg-slate-100 text-slate-600" };
  return { text: `• ${ADMIN_LABELS[e.status]}`, cls: "bg-amber-100 text-amber-800" };
}

function Actions({ e }: { e: AdminEnquiryRow }) {
  const wa = waHref(e.studentMobile);
  const btn = "flex size-9 items-center justify-center rounded-lg";
  return (
    <span className="flex items-center gap-1.5">
      {e.studentMobile ? (
        <a href={telHref(e.studentMobile)} aria-label={`Call ${e.studentName}`} className={`${btn} bg-violet-50 text-violet-700 hover:bg-violet-100`}>
          <Icon name="phone" />
        </a>
      ) : (
        <span className={`${btn} bg-slate-50 text-slate-300`} title="No phone number" aria-hidden="true">
          <Icon name="phone" />
        </span>
      )}
      {wa ? (
        <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`Chat on WhatsApp with ${e.studentName}`} className={`${btn} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>
          <Icon name="chat" />
        </a>
      ) : (
        <span className={`${btn} bg-slate-50 text-slate-300`} aria-hidden="true">
          <Icon name="chat" />
        </span>
      )}
      <a href={`mailto:${e.studentEmail}?subject=${encodeURIComponent(`Your enquiry ${e.reference}`)}`} aria-label={`Email ${e.studentName}`} className={`${btn} bg-violet-50 text-violet-700 hover:bg-violet-100`}>
        <Icon name="mail" />
      </a>
      <details className="relative">
        <summary className={`${btn} cursor-pointer list-none text-slate-500 hover:bg-slate-100 [&::-webkit-details-marker]:hidden`} aria-label={`More for ${e.reference}`}>
          <span aria-hidden="true" className="text-lg leading-none">⋮</span>
        </summary>
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-lg">
          <Link href={`/counsellor/enquiries/${e.id}`} className="block rounded-lg px-3 py-2 hover:bg-violet-50">
            Open enquiry (notes, status)
          </Link>
        </div>
      </details>
    </span>
  );
}

export default function EnquiriesTable() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const quick = params.get("quick") ?? "";
  const course = params.get("course") ?? "";
  const status = params.get("status") ?? "";
  const days = params.get("days") ?? "";
  const q = params.get("q") ?? "";
  const [text, setText] = useState(q);
  const [page, setPage] = useState(1);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the box in step with the URL (top-bar search)
  useEffect(() => setText(q), [q]);

  const go = (next: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setPage(1);
    router.replace(`${pathname}${p.size ? `?${p}` : ""}`, { scroll: false });
  };

  // "Last N days" counts from the start of the India-time day N-1 days ago (stable while the page is open).
  const [today] = useState(() => istDay(new Date()));
  const from = days ? new Date(new Date(`${today}T00:00:00+05:30`).getTime() - (Number(days) - 1) * 86_400_000).toISOString() : "";
  const qs = new URLSearchParams({
    sort: quick === "today" || quick === "overdue" ? "follow_up" : "newest",
    page: String(page),
    limit: "10",
    ...(quick && { quick }),
    ...(q && { q }),
    ...(course && { course }),
    ...(status && { status }),
    ...(from && { from }),
  });
  const list = useApiData(async (signal) => {
    const { data, meta } = await api<AdminEnquiryRow[]>("GET", `/counsellor/enquiries?${qs}`, { signal });
    return { items: data, meta: meta as PageMeta };
  }, [qs.toString()]);
  const summary = useApiData((signal) => apiGet<Summary>("/counsellor/summary", { signal }), []);
  const callbacks = useApiData(async (signal) => ((await api<unknown[]>("GET", "/counsellor/enquiries?quick=callback&limit=1", { signal })).meta as PageMeta | undefined)?.total ?? 0, []);
  const courses = useApiData((signal) => apiGet<Course[]>("/courses", { signal }), []);
  const s = summary.data;
  const counts: Record<string, number | undefined> = { "": s?.assignedTotal, callback: callbacks.data, today: s?.followUpsToday, overdue: s?.followUpsOverdue, admitted: s?.converted };
  const select = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-violet-400 focus:ring-2 focus:ring-violet-200 focus:outline-none";
  const start = list.data ? (list.data.meta.page - 1) * 10 : 0;

  return (
    <section aria-label="My enquiries" className="rounded-2xl border border-violet-100 bg-white shadow-sm">
      <div role="tablist" aria-label="Enquiry views" className="flex gap-1 overflow-x-auto border-b border-violet-50 p-2">
        {TABS.map((t) => {
          const on = quick === t.quick;
          return (
            <button
              key={t.quick || "all"}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => go({ quick: t.quick })}
              className={`flex h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold ${on ? "bg-violet-600 text-white shadow" : "text-slate-700 hover:bg-violet-50"}`}
            >
              <Icon name={t.icon} size={17} className={on ? "" : t.tone ?? ""} />
              {t.label}
              <span className={`rounded-full px-2 py-0.5 text-xs ${on ? "bg-white/25" : t.quick === "overdue" ? "bg-rose-100 text-rose-700" : t.quick === "admitted" ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"}`}>{counts[t.quick] ?? "–"}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_180px_180px_170px]">
        <form
          role="search"
          aria-label="Search my enquiries"
          onSubmit={(ev) => {
            ev.preventDefault();
            go({ q: text.trim() });
          }}
          className="relative"
        >
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <input type="search" value={text} onChange={(ev) => setText(ev.target.value)} maxLength={80} aria-label="Reference, name, email or phone" placeholder="Reference, name, email or phone..." className={`${select} pl-9`} />
        </form>
        <label>
          <span className="sr-only">Course</span>
          <select value={course} onChange={(ev) => go({ course: ev.target.value })} className={select}>
            <option value="">Course: All</option>
            {(courses.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Status</span>
          <select value={status} onChange={(ev) => go({ status: ev.target.value })} className={select}>
            <option value="">Status: All</option>
            {[...PIPELINE, ...SIDE].map((st) => (
              <option key={st} value={st}>
                {ADMIN_LABELS[st as EnquiryStatus]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Received</span>
          <select value={days} onChange={(ev) => go({ days: ev.target.value })} className={select}>
            {PERIODS.map(([v, l]) => (
              <option key={v || "all"} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      {list.status === "error" ? (
        <div className="p-4 text-sm">
          <p className="text-rose-600">Enquiries could not be loaded.</p>
          <button type="button" onClick={list.reload} className="mt-2 font-semibold underline">
            Try again
          </button>
        </div>
      ) : !list.data ? (
        <div className="mx-4 mb-4 h-40 animate-pulse rounded-xl bg-violet-50" />
      ) : list.data.items.length === 0 ? (
        <p className="px-4 pb-8 pt-4 text-center text-sm text-slate-500">{quick || q || course || status || days ? "No enquiries match these filters." : "No enquiries are assigned to you yet."}</p>
      ) : (
        <>
          {/* Wide screens: table */}
          <div className="hidden overflow-x-auto px-3 md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-violet-50/70 text-xs font-semibold text-slate-700">
                  <th scope="col" className="rounded-l-xl px-3 py-3">#</th>
                  <th scope="col" className="px-3 py-3">Name</th>
                  <th scope="col" className="px-3 py-3">Course / Interest</th>
                  <th scope="col" className="px-3 py-3">Source</th>
                  <th scope="col" className="px-3 py-3">Requested On</th>
                  <th scope="col" className="px-3 py-3">Status</th>
                  <th scope="col" className="rounded-r-xl px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.data.items.map((e, i) => {
                  const pill = statusPill(e);
                  return (
                    <tr key={e.id} className="hover:bg-violet-50/40">
                      <td className="px-3 py-3 text-slate-500">{start + i + 1}</td>
                      <td className="px-3 py-3">
                        <Link href={`/counsellor/enquiries/${e.id}`} className="flex items-center gap-3 font-semibold hover:underline">
                          <span aria-hidden="true" className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm ${AVATAR[(start + i) % AVATAR.length]}`}>
                            {e.studentName.charAt(0).toUpperCase()}
                          </span>
                          <span>
                            {e.studentName}
                            <span className="block text-[11px] font-normal text-slate-500">{e.reference}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3">{e.courses.join(", ") || "—"}</td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-800">
                          <Icon name="globe" size={13} /> {SOURCE_LABELS[e.source] ?? e.source}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">{requested(e.createdAt)}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${pill.cls}`}>{pill.text}</span>
                      </td>
                      <td className="px-3 py-3">
                        <Actions e={e} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Phones: cards */}
          <ul className="space-y-3 px-3 md:hidden">
            {list.data.items.map((e, i) => {
              const pill = statusPill(e);
              return (
                <li key={e.id} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/counsellor/enquiries/${e.id}`} className="flex min-w-0 items-center gap-3 font-semibold">
                      <span aria-hidden="true" className={`flex size-9 shrink-0 items-center justify-center rounded-full ${AVATAR[(start + i) % AVATAR.length]}`}>
                        {e.studentName.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate">{e.studentName}</span>
                        <span className="block text-[11px] font-normal text-slate-500">{e.reference}</span>
                      </span>
                    </Link>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${pill.cls}`}>{pill.text}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    {e.courses.join(", ") || "Course not chosen"} · {SOURCE_LABELS[e.source] ?? e.source} · {requested(e.createdAt)}
                  </p>
                  <div className="mt-3">
                    <Actions e={e} />
                  </div>
                </li>
              );
            })}
          </ul>
          {list.data.meta.totalPages > 1 && (
            <nav aria-label="Pages" className="flex items-center justify-between gap-2 p-4 text-sm">
              <span className="text-slate-500">
                Page {list.data.meta.page} of {list.data.meta.totalPages} · {list.data.meta.total} total
              </span>
              <span className="flex gap-2">
                <button type="button" disabled={list.data.meta.page <= 1} onClick={() => setPage(page - 1)} className="h-9 rounded-lg border border-slate-200 px-3 disabled:opacity-40">
                  Previous
                </button>
                <button type="button" disabled={list.data.meta.page >= list.data.meta.totalPages} onClick={() => setPage(page + 1)} className="h-9 rounded-lg border border-slate-200 px-3 disabled:opacity-40">
                  Next
                </button>
              </span>
            </nav>
          )}
          <div className="h-2" />
        </>
      )}
    </section>
  );
}
