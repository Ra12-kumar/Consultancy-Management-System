"use client";

import { useState } from "react";
import type { CallbackLead } from "@/features/admin/enquiries/CallbackLeads";
import { telHref } from "@/features/admin/enquiries/PhoneActions";
import { Icon } from "@/features/admin/workspace/icons";
import { useApiData } from "@/hooks/useApiData";
import { waHref } from "@/lib/whatsapp";
import { api, apiPatch } from "@/services/api";
import type { ApiError } from "@/types/api";

// "Website Callback Requests" for the counsellor, in the client design. Same data and actions as before
// (GET/PATCH /api/counsellor/callback-leads): only requests assigned to this counsellor; status and note.

type Meta = { total: number; totalPages: number; page: number; new: number };
const EDUCATION: Record<string, string> = { class_10: "Class 10", class_12: "Class 12", diploma: "Diploma", undergraduate: "Undergraduate", postgraduate: "Postgraduate", other: "Other" };
const STATUS = { new: "New", contacted: "Contacted", closed: "Closed" } as const;
const PILL = { new: "bg-violet-100 text-violet-700", contacted: "bg-amber-100 text-amber-700", closed: "bg-slate-100 text-slate-600" } as const;
const FILTERS = [
  ["new", "New"],
  ["contacted", "Contacted"],
  ["closed", "Closed"],
  ["", "All"],
] as const;
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
// "+917323891747" → "+91 7323891747" for reading.
const showPhone = (m: string) => (m.startsWith("+91") && m.length === 13 ? `+91 ${m.slice(3)}` : m);

function LeadCard({ lead, onSaved }: { lead: CallbackLead; onSaved: () => void }) {
  const saved = lead.note ?? "";
  const [status, setStatus] = useState(lead.status);
  const [note, setNote] = useState(saved);
  const [state, setState] = useState<{ busy: boolean; message?: string; error?: string; copied?: boolean }>({ busy: false });
  const changed = status !== lead.status || note.trim() !== saved;
  const wa = waHref(lead.mobile);

  async function save() {
    setState({ busy: true });
    try {
      await apiPatch(`/counsellor/callback-leads/${lead.id}`, { ...(status !== lead.status && { status }), ...(note.trim() !== saved && { note: note.trim() }) });
      setState({ busy: false, message: "Saved." });
      onSaved();
    } catch (err) {
      setState({ busy: false, error: (err as ApiError).message ?? "Could not save. Please try again." });
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(lead.mobile);
      setState((s) => ({ ...s, copied: true }));
      setTimeout(() => setState((s) => ({ ...s, copied: false })), 2000);
    } catch {
      setState((s) => ({ ...s, error: "Could not copy. Select the number instead." }));
    }
  }

  return (
    <li className="flex flex-col gap-5 rounded-2xl border border-violet-200 bg-white p-4 sm:p-5 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 gap-4">
        <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xl font-semibold text-violet-700">
          {lead.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 space-y-1.5">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold break-words">{lead.name}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[lead.status]}`}>{STATUS[lead.status]}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{lead.role === "parent" ? "Parent / guardian" : "Student"}</span>
          </p>
          <p className="flex items-center gap-2 text-sm text-slate-700">
            <Icon name="cap" size={16} className="text-slate-500" />
            {EDUCATION[lead.education] ?? lead.education} • Interested in {lead.interest || "not sure yet"}
          </p>
          <p className="flex items-center gap-2 text-sm text-slate-700">
            <Icon name="calendar" size={16} className="text-slate-500" />
            Requested {when(lead.requestedAt)}
            {lead.contactedAt ? ` · first contacted ${when(lead.contactedAt)}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-sm font-semibold">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-50 px-3">
              <Icon name="phone" size={15} /> {showPhone(lead.mobile)}
            </span>
            <a href={telHref(lead.mobile)} aria-label={`Call ${lead.name}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-white hover:bg-violet-700">
              <Icon name="phone" size={15} /> Call
            </a>
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`Chat on WhatsApp with ${lead.name}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-50 px-3 text-emerald-700 hover:bg-emerald-100">
                <Icon name="chat" size={15} /> WhatsApp
              </a>
            )}
            <button type="button" onClick={() => void copy()} aria-label={`Copy ${lead.mobile}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-100 px-3 hover:bg-slate-200">
              <Icon name="applications" size={15} /> {state.copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>
      <div className="grid gap-3 border-violet-100 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-end lg:w-[500px] lg:border-l lg:pl-5">
        <label className="block text-xs font-semibold text-slate-600">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as CallbackLead["status"])} disabled={state.busy} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900">
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Note for the team
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="e.g. Call after 6 pm" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900" />
        </label>
        <button type="button" onClick={() => void save()} disabled={state.busy || !changed} className="h-10 rounded-lg bg-violet-600 px-5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
          {state.busy ? "Saving…" : "Save"}
        </button>
        <p role="status" className="text-xs sm:col-span-3">
          {state.error ? <span className="text-rose-600">{state.error}</span> : <span className="text-emerald-700">{state.message}</span>}
        </p>
      </div>
    </li>
  );
}

export default function CallbackPanel() {
  const [status, setStatus] = useState<string>("new");
  const [page, setPage] = useState(1);
  const path = `/counsellor/callback-leads?limit=5&page=${page}${status ? `&status=${status}` : ""}`;
  const list = useApiData((signal) => api<CallbackLead[]>("GET", path, { signal }), [path]);
  const meta = list.data?.meta as Meta | undefined;

  return (
    <section aria-labelledby="callback-leads-title" className="overflow-hidden rounded-2xl border border-violet-200 bg-violet-50/40 shadow-sm">
      <div className="flex flex-col gap-4 bg-gradient-to-r from-violet-700 via-violet-600 to-indigo-500 px-4 py-4 text-white sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/20">
            <Icon name="phone" size={22} />
          </span>
          <div>
            <h2 id="callback-leads-title" className="flex flex-wrap items-center gap-3 text-lg font-bold">
              Website Callback Requests
              {meta?.new ? <span className="rounded-full bg-amber-300 px-2.5 py-0.5 text-xs font-bold text-amber-900">{meta.new} New</span> : null}
            </h2>
            <p className="text-sm text-white/85">Website callback requests assigned to you. Call back, then update the status.</p>
          </div>
        </div>
        <div role="group" aria-label="Show callback requests" className="flex flex-wrap gap-2">
          {FILTERS.map(([k, label]) => (
            <button
              key={k || "all"}
              type="button"
              aria-pressed={status === k}
              onClick={() => {
                setStatus(k);
                setPage(1);
              }}
              className={`h-9 rounded-full px-4 text-sm font-semibold ${status === k ? "bg-white text-violet-800" : "border border-white/50 text-white hover:bg-white/15"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-3 sm:p-4">
        {list.status === "error" ? (
          <div className="rounded-xl bg-white p-4 text-sm">
            <p className="text-rose-600">{(list.error as ApiError | null)?.message ?? "Callback requests could not be loaded."}</p>
            <button type="button" onClick={list.reload} className="mt-2 font-semibold underline">
              Try again
            </button>
          </div>
        ) : !list.data ? (
          <div className="h-32 animate-pulse rounded-2xl bg-white" />
        ) : list.data.data.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500">{status ? `No ${STATUS[status as keyof typeof STATUS].toLowerCase()} callback requests.` : "No callback requests assigned to you yet."}</p>
        ) : (
          <ul className="space-y-3">
            {list.data.data.map((lead) => (
              <LeadCard key={lead.id} lead={lead} onSaved={list.reload} />
            ))}
          </ul>
        )}
        {meta && meta.totalPages > 1 && (
          <nav aria-label="Callback request pages" className="mt-3 flex items-center justify-center gap-3 text-sm">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-9 rounded-lg border border-violet-200 bg-white px-3 disabled:opacity-40">
              Previous
            </button>
            <span className="text-slate-600">
              Page {meta.page} of {meta.totalPages}
            </span>
            <button type="button" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)} className="h-9 rounded-lg border border-violet-200 bg-white px-3 disabled:opacity-40">
              Next
            </button>
          </nav>
        )}
      </div>
    </section>
  );
}
