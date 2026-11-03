"use client";

/* eslint-disable @next/next/no-img-element -- local photo from the client design */
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import CallbackLeads from "@/features/admin/enquiries/CallbackLeads";
import { telHref } from "@/features/admin/enquiries/PhoneActions";
import { Icon, type IconName } from "@/features/admin/workspace/icons";
import { useAuth } from "@/features/auth/AuthProvider";
import { followUpLabel } from "@/features/counsellor/MyEnquiriesBoard";
import { StatusBadge } from "@/features/enquiry/shared";
import { useApiData } from "@/hooks/useApiData";
import { waHref } from "@/lib/whatsapp";
import { api, apiGet } from "@/services/api";
import type { AdminEnquiryRow } from "@/types/enquiry";
import AddEnquiryDialog, { useAddEnquiry } from "./AddEnquiryDialog";

// Counsellor dashboard from the client design. Every figure is live data from the existing counsellor APIs:
//   /counsellor/summary, /counsellor/enquiries (counts per day, follow-ups, lists) and /counsellor/callback-leads.
// Ticking a task only marks it done on this device for today; it changes nothing on the server.

type Summary = { assignedOpen: number; assignedTotal: number; converted: number; followUpsToday: number; followUpsOverdue: number };
type Lead = { id: string; name: string; mobile: string; requestedAt: string };
type Meta = { total: number; new?: number };

const IST = "Asia/Kolkata";
const istDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(d); // YYYY-MM-DD
const dayStart = (ymd: string) => new Date(`${ymd}T00:00:00+05:30`);
const addDays = (ymd: string, n: number) => istDate(new Date(dayStart(ymd).getTime() + n * 86_400_000 + 3_600_000));
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: IST, ...o }).format(d);
const card = "rounded-2xl border border-violet-100 bg-white shadow-[0_1px_3px_rgba(76,29,149,0.06)]";

function Panel({ title, icon, aside, children, id }: { title: string; icon: IconName; aside?: ReactNode; children: ReactNode; id?: string }) {
  // A heading id without spaces or punctuation (aria-labelledby splits ids on spaces).
  const headingId = `${id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-h`;
  return (
    <section id={id} aria-labelledby={headingId} className={`${card} p-4 sm:p-5`}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={headingId} className="flex items-center gap-2 text-sm font-bold">
          <Icon name={icon} className="text-violet-600" />
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Stat({ icon, tint, value, label, chip, chipTone, href }: { icon: IconName; tint: string; value: string; label: string; chip?: string; chipTone?: string; href: string }) {
  return (
    <Link href={href} className={`${card} block p-4 transition hover:-translate-y-0.5 hover:border-violet-300 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:outline-none`}>
      <span className="flex items-start justify-between gap-2">
        <span className={`flex size-10 items-center justify-center rounded-xl ${tint}`}>
          <Icon name={icon} size={20} />
        </span>
        {chip && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${chipTone ?? "bg-emerald-50 text-emerald-700"}`}>{chip}</span>}
      </span>
      <span className="mt-3 block text-2xl font-bold">{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </Link>
  );
}

// Line chart of new enquiries assigned per day (IST), with the last point labelled.
function TrendChart({ days }: { days: Array<{ day: string; count: number }> }) {
  const W = 560, H = 190, L = 28, R = 12, T = 22, B = 26;
  const max = Math.max(4, ...days.map((d) => d.count));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, days.length - 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const line = days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.count).toFixed(1)}`).join(" ");
  const area = `${line} L${x(days.length - 1)},${H - B} L${x(0)},${H - B} Z`;
  const last = days[days.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`New enquiries per day: ${days.map((d) => `${fmt(dayStart(d.day), { day: "numeric", month: "short" })} ${d.count}`).join(", ")}`}>
      <defs>
        <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((k) => (
        <g key={k}>
          <line x1={L} x2={W - R} y1={y(k * step)} y2={y(k * step)} stroke="#ede9fe" />
          <text x={L - 8} y={y(k * step) + 3} textAnchor="end" fontSize="10" fill="#64748b">
            {k * step}
          </text>
        </g>
      ))}
      <path d={area} fill="url(#trendFill)" />
      <path d={line} fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinejoin="round" />
      {days.map((d, i) => (
        <g key={d.day}>
          <circle cx={x(i)} cy={y(d.count)} r="3.5" fill="white" stroke="#7c3aed" strokeWidth="2">
            <title>{`${fmt(dayStart(d.day), { day: "numeric", month: "short" })}: ${d.count}`}</title>
          </circle>
          {(days.length <= 8 || i % 2 === days.length % 2) && (
            <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#64748b">
              {fmt(dayStart(d.day), { day: "numeric", month: "short" })}
            </text>
          )}
        </g>
      ))}
      {last && (
        <g transform={`translate(${Math.min(x(days.length - 1) - 44, W - 92)}, ${Math.max(0, y(last.count) - 24)})`}>
          <rect width="84" height="18" rx="9" fill="#7c3aed" />
          <text x="42" y="12.5" textAnchor="middle" fontSize="10" fill="white" fontWeight="600">
            {last.count} {last.count === 1 ? "Enquiry" : "Enquiries"}
          </text>
        </g>
      )}
    </svg>
  );
}

function Donut({ pct }: { pct: number }) {
  const r = 46, c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto size-36">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#ede9fe" strokeWidth="12" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="url(#donutGrad)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} />
        <defs>
          <linearGradient id="donutGrad">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{pct}%</span>
        <span className="text-[11px] text-slate-500">Conversion Rate</span>
      </span>
    </div>
  );
}

function EnquiryRows({ quick }: { quick: "" | "today" | "overdue" }) {
  const qs = new URLSearchParams({ limit: "5", sort: quick ? "follow_up" : "activity", ...(quick ? { quick } : { open: "yes" }) });
  const list = useApiData((signal) => api<AdminEnquiryRow[]>("GET", `/counsellor/enquiries?${qs}`, { signal }), [qs.toString()]);
  const rows = list.data?.data;
  const more = `/counsellor/enquiries${quick ? `?quick=${quick}` : ""}`;
  if (list.status === "error") return <p className="p-4 text-sm text-rose-600">These enquiries could not be loaded.</p>;
  if (!rows) return <div className="m-4 h-24 animate-pulse rounded-xl bg-violet-50" />;
  if (!rows.length) return <p className="p-6 text-center text-sm text-slate-500">{quick === "overdue" ? "Nothing overdue. Well done." : quick === "today" ? "No follow-ups due today." : "No open enquiries assigned to you yet."}</p>;
  return (
    <>
      <ul className="divide-y divide-violet-50">
        {rows.map((e) => {
          const f = followUpLabel(e.followUpAt);
          const wa = waHref(e.studentMobile);
          return (
            <li key={e.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-100 font-semibold text-violet-700">
                  {e.studentName.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {e.studentName} <StatusBadge status={e.status} />
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {e.reference} · {e.courses.join(", ") || "Course not chosen"} · Follow-up: <span className={f.overdue ? "font-semibold text-rose-600" : ""}>{f.text}</span>
                  </span>
                </span>
              </span>
              <span className="flex flex-wrap gap-2 text-xs font-semibold">
                {e.studentMobile && (
                  <a href={telHref(e.studentMobile)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-violet-50 px-2.5 text-violet-700 hover:bg-violet-100" aria-label={`Call ${e.studentName}`}>
                    <Icon name="phone" size={14} /> Call
                  </a>
                )}
                {wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-50 px-2.5 text-emerald-700 hover:bg-emerald-100" aria-label={`Chat on WhatsApp with ${e.studentName}`}>
                    <Icon name="chat" size={14} /> WhatsApp
                  </a>
                )}
                <Link href={`/counsellor/enquiries/${e.id}`} className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-2.5 hover:bg-slate-50" aria-label={`Open ${e.reference}`}>
                  Open
                </Link>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-violet-50 p-3 text-right text-xs">
        <Link href={more} className="font-semibold text-violet-700 hover:underline">
          View all →
        </Link>
      </p>
    </>
  );
}

const TABS = [
  { key: "callbacks", label: "Website Callbacks", icon: "callback" as IconName },
  { key: "mine", label: "My Enquiries", icon: "enquiries" as IconName },
  { key: "today", label: "Follow-ups", icon: "calendar" as IconName },
  { key: "overdue", label: "Overdue", icon: "info" as IconName },
] as const;

export default function CounsellorDashboard() {
  const { user } = useAuth();
  const today = istDate(new Date());
  const [range, setRange] = useState(7);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("callbacks");
  const [weekStart, setWeekStart] = useState(() => addDays(today, -new Date(`${today}T12:00:00+05:30`).getUTCDay()));
  const [done, setDone] = useState<string[]>([]);
  const add = useAddEnquiry();

  const summary = useApiData((signal) => apiGet<Summary>("/counsellor/summary", { signal }), []);
  const leads = useApiData((signal) => api<Lead[]>("GET", "/counsellor/callback-leads?status=new&limit=10", { signal }), []);
  // Overdue and today's follow-ups (tasks, quick actions), and the follow-ups of the week shown in the calendar.
  const followUps = useApiData(
    async (signal) => {
      const [overdue, todays] = await Promise.all(["overdue", "today"].map((quick) => api<AdminEnquiryRow[]>("GET", `/counsellor/enquiries?quick=${quick}&sort=follow_up&limit=50`, { signal })));
      return { data: [...overdue!.data, ...todays!.data] };
    },
    [],
  );
  const weekList = useApiData(
    (signal) =>
      api<AdminEnquiryRow[]>(
        "GET",
        `/counsellor/enquiries?open=yes&sort=follow_up&limit=50&followUpFrom=${encodeURIComponent(dayStart(weekStart).toISOString())}&followUpTo=${encodeURIComponent(new Date(dayStart(addDays(weekStart, 7)).getTime() - 1).toISOString())}`,
        { signal },
      ),
    [weekStart],
  );
  const openList = useApiData((signal) => api<AdminEnquiryRow[]>("GET", "/counsellor/enquiries?open=yes&sort=activity&limit=1", { signal }), []);
  // New enquiries assigned per IST day: one count per day from the existing date filter.
  const trend = useApiData(
    async (signal) =>
      Promise.all(
        Array.from({ length: range }, (_, i) => addDays(today, i - range + 1)).map(async (day) => {
          const from = dayStart(day).toISOString();
          const to = new Date(dayStart(addDays(day, 1)).getTime() - 1).toISOString();
          const r = await api<unknown[]>("GET", `/counsellor/enquiries?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=1`, { signal });
          return { day, count: (r.meta as Meta | undefined)?.total ?? 0 };
        }),
      ),
    [range, today],
  );

  // Ticks are kept on this device, per counsellor and day.
  const tickKey = `udaan.counsellor.tasks.${user?.id ?? "me"}.${today}`;
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore today's ticks once
      setDone(JSON.parse(localStorage.getItem(tickKey) ?? "[]"));
    } catch {
      // Storage unavailable: start with nothing ticked.
    }
  }, [tickKey]);
  const toggle = (id: string) => {
    const next = done.includes(id) ? done.filter((x) => x !== id) : [...done, id];
    setDone(next);
    try {
      localStorage.setItem(tickKey, JSON.stringify(next));
    } catch {
      // Storage unavailable: the tick lasts for this page view.
    }
  };

  const s = summary.data;
  const leadMeta = leads.data?.meta as Meta | undefined;
  const newLeads = leadMeta?.new ?? 0;
  const due = useMemo(() => (followUps.data?.data ?? []).filter((e) => e.followUpAt), [followUps.data]);
  const dated = useMemo(() => (weekList.data?.data ?? []).filter((e) => e.followUpAt), [weekList.data]);
  const tasks = useMemo(() => {
    return [
      ...(leads.data?.data ?? []).map((l) => ({ id: `lead:${l.id}`, text: `Call back ${l.name} (${l.mobile})`, time: fmt(new Date(l.requestedAt), { hour: "numeric", minute: "2-digit" }), href: "/counsellor/enquiries#callback-leads-title", late: false })),
      ...due.map((e) => ({ id: `enq:${e.id}`, text: `Follow up with ${e.studentName}`, time: istDate(new Date(e.followUpAt!)) < today ? "Overdue" : fmt(new Date(e.followUpAt!), { hour: "numeric", minute: "2-digit" }), href: `/counsellor/enquiries/${e.id}`, late: istDate(new Date(e.followUpAt!)) < today })),
    ];
  }, [due, leads.data, today]);
  const next = due[0] ?? openList.data?.data[0];
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const perDay = (day: string) => dated.filter((e) => istDate(new Date(e.followUpAt!)) === day).length;
  const [picked, setPicked] = useState(today);
  const pickedList = dated.filter((e) => istDate(new Date(e.followUpAt!)) === picked);
  const weekTotal = trend.data?.reduce((n, d) => n + d.count, 0) ?? 0;
  const rate = s && s.assignedTotal ? Math.round((s.converted / s.assignedTotal) * 100) : 0;
  const firstName = user?.name.split(" ")[0] ?? "";
  const tabCount = { callbacks: newLeads, mine: s?.assignedOpen ?? 0, today: s?.followUpsToday ?? 0, overdue: s?.followUpsOverdue ?? 0 };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        {/* Welcome */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-100 via-violet-50 to-indigo-50 p-5 sm:p-6">
          <div className="relative z-10 max-w-md">
            <h1 className="text-xl font-bold sm:text-2xl">
              Welcome back, <span className="text-violet-700">{firstName}</span>! <span aria-hidden="true">👋</span>
            </h1>
            <p className="mt-1 text-sm text-slate-600">Here’s your counselling overview for today.</p>
          </div>
          <span aria-hidden="true" className="absolute top-4 right-[42%] hidden text-violet-300 sm:block">
            <Icon name="cap" size={44} />
          </span>
          <img src="/udan/academic-setting.jpg" alt="" className="absolute inset-y-0 right-0 hidden h-full w-[38%] object-cover [mask-image:linear-gradient(to_right,transparent,black_35%)] sm:block" />
        </section>

        {/* Headline counts */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon="students" tint="bg-violet-100 text-violet-700" value={s ? String(s.assignedTotal) : "–"} label="Total Enquiries" chip={trend.data ? `+${weekTotal} in ${range} days` : undefined} href="/counsellor/enquiries" />
          <Stat icon="phone" tint="bg-sky-100 text-sky-700" value={leads.data ? String(newLeads) : "–"} label="Callback Requests" chip={leadMeta ? `${leadMeta.total} waiting` : undefined} chipTone="bg-sky-50 text-sky-700" href="/counsellor/enquiries#callback-leads-title" />
          <Stat
            icon="calendar"
            tint="bg-purple-100 text-purple-700"
            value={s ? String(s.followUpsToday) : "–"}
            label="Follow-ups Today"
            chip={s ? (s.followUpsOverdue ? `${s.followUpsOverdue} overdue` : "None overdue") : undefined}
            chipTone={s?.followUpsOverdue ? "bg-rose-50 text-rose-700" : undefined}
            href="/counsellor/enquiries?quick=today"
          />
          <Stat icon="checkCircle" tint="bg-emerald-100 text-emerald-700" value={s ? String(s.converted) : "–"} label="Converted" chip={s ? `${rate}% rate` : undefined} href="/counsellor/enquiries?quick=admitted" />
        </div>

        {/* Overview */}
        <section id="overview" aria-labelledby="overview-h" className={`${card} p-4 sm:p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="overview-h" className="flex items-center gap-2 text-sm font-bold">
                <Icon name="insights" className="text-violet-600" /> Enquiry Overview
              </h2>
              <p className="text-xs text-slate-500">New enquiries assigned to you each day, and your conversion rate.</p>
            </div>
            <label className="text-xs">
              <span className="sr-only">Period</span>
              <select value={range} onChange={(e) => setRange(Number(e.target.value))} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold">
                <option value={7}>Last 7 Days</option>
                <option value={14}>Last 14 Days</option>
              </select>
            </label>
          </div>
          <div className="mt-3 grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_170px]">
            {trend.data ? <TrendChart days={trend.data} /> : <div className="h-48 animate-pulse rounded-xl bg-violet-50" />}
            <div className="text-center">
              <Donut pct={rate} />
              <p className="mt-1 text-[11px] text-slate-500">{s ? `${s.converted} of ${s.assignedTotal} admitted` : ""}</p>
            </div>
          </div>
        </section>

        {/* Work lists */}
        <section aria-label="Work lists" className={card}>
          <div role="tablist" aria-label="Work lists" className="flex gap-1 overflow-x-auto border-b border-violet-100 px-3 pt-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-semibold ${tab === t.key ? "border-violet-600 text-violet-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
              >
                <Icon name={t.icon} size={15} />
                {t.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${t.key === "overdue" && tabCount.overdue ? "bg-rose-100 text-rose-700" : "bg-violet-100 text-violet-700"}`}>{tabCount[t.key]}</span>
              </button>
            ))}
            <button type="button" onClick={add.open} className="my-1 ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700">
              <Icon name="plus" size={14} /> Add Enquiry
            </button>
          </div>
          <div role="tabpanel" className="[&_.mb-6]:mb-0 [&_.mb-6]:border-0 [&_.mb-6]:shadow-none">
            {tab === "callbacks" ? <CallbackLeads role="counsellor" /> : <EnquiryRows quick={tab === "mine" ? "" : tab} />}
          </div>
        </section>
      </div>

      {/* Right column */}
      <div className="min-w-0 space-y-5">
        <Panel title="Today’s Tasks" icon="tasks" aside={<span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">{tasks.filter((t) => !done.includes(t.id)).length}</span>}>
          {!followUps.data || !leads.data ? (
            <div className="mt-3 h-24 animate-pulse rounded-xl bg-violet-50" />
          ) : tasks.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">No calls or follow-ups due today.</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {tasks.slice(0, 8).map((t) => {
                const ticked = done.includes(t.id);
                return (
                  <li key={t.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-xs hover:bg-violet-50">
                    <input type="checkbox" checked={ticked} onChange={() => toggle(t.id)} aria-label={`Mark done: ${t.text}`} className="size-4 accent-violet-600" />
                    <Link href={t.href} className={`min-w-0 flex-1 truncate hover:underline ${ticked ? "text-slate-400 line-through" : ""}`}>
                      {t.text}
                    </Link>
                    <span className={`shrink-0 ${t.late ? "font-semibold text-rose-600" : "text-slate-500"}`}>{t.time}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-[10px] text-slate-400">Ticks are saved on this device only.</p>
        </Panel>

        <Panel title="Follow-ups Calendar" icon="calendar">
          <div className="mt-3 flex items-center justify-between text-sm font-semibold">
            <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week" className="flex size-8 items-center justify-center rounded-lg hover:bg-violet-50">
              <span aria-hidden="true">‹</span>
            </button>
            {fmt(dayStart(weekStart), { month: "long", year: "numeric" })}
            <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week" className="flex size-8 items-center justify-center rounded-lg hover:bg-violet-50">
              <span aria-hidden="true">›</span>
            </button>
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px]">
            {week.map((d) => (
              <span key={`h${d}`} className="text-slate-500">
                {fmt(dayStart(d), { weekday: "short" })}
              </span>
            ))}
            {week.map((d) => {
              const n = perDay(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPicked(d)}
                  aria-pressed={picked === d}
                  aria-label={`${fmt(dayStart(d), { day: "numeric", month: "long" })}: ${n} follow-up${n === 1 ? "" : "s"}`}
                  className={`relative mx-auto flex size-9 items-center justify-center rounded-full text-xs font-semibold ${picked === d ? "bg-violet-600 text-white" : d === today ? "ring-1 ring-violet-400" : "hover:bg-violet-50"}`}
                >
                  {fmt(dayStart(d), { day: "numeric" })}
                  {n > 0 && <span aria-hidden="true" className={`absolute bottom-0.5 size-1.5 rounded-full ${picked === d ? "bg-white" : "bg-violet-500"}`} />}
                </button>
              );
            })}
          </div>
          <ul className="mt-3 space-y-1 text-xs">
            {pickedList.length === 0 ? (
              <li className="text-slate-500">No follow-ups on {fmt(dayStart(picked), { day: "numeric", month: "short" })}.</li>
            ) : (
              pickedList.map((e) => (
                <li key={e.id}>
                  <Link href={`/counsellor/enquiries/${e.id}`} className="flex justify-between gap-2 rounded-lg px-1 py-1 hover:bg-violet-50">
                    <span className="truncate">{e.studentName}</span>
                    <span className="text-slate-500">{fmt(new Date(e.followUpAt!), { hour: "numeric", minute: "2-digit" })}</span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </Panel>

        <Panel title="Quick Actions" icon="trendUp">
          <p className="mt-1 text-[11px] text-slate-500">{next ? `Next student: ${next.studentName} (${next.reference})` : "No open enquiries yet."}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs font-semibold">
            {[
              { label: "Call Student", icon: "phone" as IconName, tone: "bg-emerald-50 text-emerald-700", href: next?.studentMobile ? telHref(next.studentMobile) : null },
              { label: "WhatsApp", icon: "chat" as IconName, tone: "bg-green-50 text-green-700", href: waHref(next?.studentMobile), external: true },
              { label: "Send Email", icon: "mail" as IconName, tone: "bg-violet-50 text-violet-700", href: next?.studentEmail ? `mailto:${next.studentEmail}?subject=${encodeURIComponent(`Your enquiry ${next.reference}`)}` : null },
            ].map((a) =>
              a.href ? (
                <a key={a.label} href={a.href} {...(a.external && { target: "_blank", rel: "noopener noreferrer" })} className={`flex flex-col items-center gap-2 rounded-xl p-4 hover:brightness-95 ${a.tone}`}>
                  <span className="flex size-10 items-center justify-center rounded-full bg-white/80">
                    <Icon name={a.icon} size={18} />
                  </span>
                  {a.label}
                </a>
              ) : (
                <span key={a.label} aria-disabled="true" title="No student to contact yet" className={`flex flex-col items-center gap-2 rounded-xl p-4 opacity-50 ${a.tone}`}>
                  <span className="flex size-10 items-center justify-center rounded-full bg-white/80">
                    <Icon name={a.icon} size={18} />
                  </span>
                  {a.label}
                </span>
              ),
            )}
            <button type="button" onClick={add.open} className="flex flex-col items-center gap-2 rounded-xl bg-rose-50 p-4 text-rose-700 hover:brightness-95">
              <span className="flex size-10 items-center justify-center rounded-full bg-white/80">
                <Icon name="userPlus" size={18} />
              </span>
              Add Enquiry
            </button>
          </div>
        </Panel>
      </div>

      <AddEnquiryDialog dialogRef={add.ref} />
    </div>
  );
}
