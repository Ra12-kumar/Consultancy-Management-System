"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert, Badge, Card, Skeleton } from "@/components/ui/Feedback";
import { useApiData } from "@/hooks/useApiData";
import { api, apiGet, apiPatch } from "@/services/api";
import type { ApiError } from "@/types/api";
import type { Counsellor } from "@/types/enquiry";
import PhoneActions from "./PhoneActions";

// Callback requests from the Udaan landing page ("Request a callback"), shown in the Enquiries section.
// Admins see every request and assign it; a counsellor sees the ones assigned to them. Both update the
// status and keep a note. These people have no account yet, so they are not student enquiries.

export type CallbackLead = {
  id: string;
  name: string;
  mobile: string;
  role: "student" | "parent";
  education: string;
  interest: string;
  status: "new" | "contacted" | "closed";
  note: string;
  requestedAt: string;
  contactedAt: string | null;
  assignedTo: { id: string; name: string } | null;
};
type Meta = { total: number; totalPages: number; page: number; new: number };

const EDUCATION: Record<string, string> = { class_10: "Class 10", class_12: "Class 12", diploma: "Diploma", undergraduate: "Undergraduate", postgraduate: "Postgraduate", other: "Other" };
const STATUS = { new: "New", contacted: "Contacted", closed: "Closed" } as const;
const TONE = { new: "warning", contacted: "success", closed: "neutral" } as const;
const FILTERS = [
  ["new", "New"],
  ["contacted", "Contacted"],
  ["closed", "Closed"],
  ["", "All"],
] as const;
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function LeadRow({ lead, role, people, onSaved }: { lead: CallbackLead; role: "admin" | "counsellor"; people: Counsellor[]; onSaved: () => void }) {
  const saved = lead.note ?? "";
  const [note, setNote] = useState(saved);
  const [state, setState] = useState<{ busy: boolean; message?: string; error?: string }>({ busy: false });
  const base = role === "admin" ? "/admin/callback-leads" : "/counsellor/callback-leads";

  async function save(patch: Record<string, unknown>, message: string) {
    setState({ busy: true });
    try {
      await apiPatch(`${base}/${lead.id}`, patch);
      setState({ busy: false, message });
      onSaved();
    } catch (err) {
      setState({ busy: false, error: (err as ApiError).message ?? "Could not save. Please try again." });
    }
  }

  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold break-words">{lead.name}</span>
            <Badge tone={TONE[lead.status]}>{STATUS[lead.status]}</Badge>
            <span className="text-xs text-muted">{lead.role === "parent" ? "Parent / guardian" : "Student"}</span>
          </p>
          <p className="text-sm text-muted">
            {EDUCATION[lead.education] ?? lead.education} · Interested in {lead.interest || "not sure yet"}
          </p>
          <p className="text-xs text-muted">
            Requested {when(lead.requestedAt)}
            {lead.contactedAt ? ` · first contacted ${when(lead.contactedAt)}` : ""}
            {role === "admin" ? ` · ${lead.assignedTo ? `Assigned to ${lead.assignedTo.name}` : "Unassigned"}` : ""}
          </p>
          <div className="pt-1 text-sm">
            <PhoneActions mobile={lead.mobile} />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:w-[420px]">
          <label className="block text-xs font-medium">
            Status
            <select value={lead.status} disabled={state.busy} onChange={(e) => void save({ status: e.target.value }, "Status saved.")} className="mt-1 min-h-10 w-full rounded-xl border border-line bg-surface px-2 text-sm">
              {Object.entries(STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {role === "admin" && (
            <label className="block text-xs font-medium">
              Assigned to
              <select value={lead.assignedTo?.id ?? ""} disabled={state.busy} onChange={(e) => void save({ assignedTo: e.target.value || null }, "Assignment saved.")} className="mt-1 min-h-10 w-full rounded-xl border border-line bg-surface px-2 text-sm">
                <option value="">Unassigned</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.role === "counsellor" ? " (counsellor)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <form
            className="sm:col-span-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save({ note: note.trim() }, "Note saved.");
            }}
          >
            <label className="block text-xs font-medium">
              Note for the team
              <span className="mt-1 flex gap-2">
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="e.g. Call after 6 pm" className="min-h-10 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-sm" />
                <Button type="submit" size="sm" variant="secondary" disabled={state.busy || note.trim() === saved}>
                  Save
                </Button>
              </span>
            </label>
          </form>
          <p className="text-xs sm:col-span-2" role="status">
            {state.error ? <span className="text-danger">{state.error}</span> : state.message}
          </p>
        </div>
      </div>
    </li>
  );
}

export default function CallbackLeads({ role }: { role: "admin" | "counsellor" }) {
  const [status, setStatus] = useState<string>("new");
  const [page, setPage] = useState(1);
  const path = `${role === "admin" ? "/admin" : "/counsellor"}/callback-leads?limit=10&page=${page}${status ? `&status=${status}` : ""}`;
  const list = useApiData((signal) => api<CallbackLead[]>("GET", path, { signal }), [path]);
  const people = useApiData((signal) => (role === "admin" ? apiGet<Counsellor[]>("/admin/counsellors", { signal }) : Promise.resolve([])), [role]);
  const meta = list.data?.meta as Meta | undefined;

  return (
    <Card className="mb-6">
      <section aria-labelledby="callback-leads-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="callback-leads-title" className="text-lg font-bold">
              Website callback requests{meta?.new ? <span className="ml-2 align-middle"><Badge tone="warning">{meta.new} new</Badge></span> : null}
            </h2>
            <p className="text-sm text-muted">
              {role === "admin" ? "From “Request a callback” on the website. Assign each one so a counsellor calls back." : "Website callback requests assigned to you. Call back, then update the status."}
            </p>
          </div>
          <div role="group" aria-label="Show callback requests" className="flex flex-wrap gap-1.5">
            {FILTERS.map(([k, label]) => (
              <button
                key={k || "all"}
                type="button"
                aria-pressed={status === k}
                onClick={() => {
                  setStatus(k);
                  setPage(1);
                }}
                className={`min-h-9 rounded-full border px-3 text-sm ${status === k ? "border-primary bg-primary font-semibold text-primary-fg" : "border-line hover:bg-surface-2"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          {list.status === "error" ? (
            <div className="space-y-2">
              <Alert>{(list.error as ApiError | null)?.message ?? "Callback requests could not be loaded."}</Alert>
              <Button size="sm" variant="secondary" onClick={list.reload}>
                Try again
              </Button>
            </div>
          ) : !list.data ? (
            <Skeleton className="h-28" />
          ) : list.data.data.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-muted">{status ? `No ${STATUS[status as keyof typeof STATUS].toLowerCase()} callback requests.` : "No callback requests yet."}</p>
          ) : (
            <ul className="space-y-3">
              {list.data.data.map((lead) => (
                <LeadRow key={lead.id} lead={lead} role={role} people={people.data ?? []} onSaved={list.reload} />
              ))}
            </ul>
          )}
          {meta && meta.totalPages > 1 && (
            <nav aria-label="Callback request pages" className="mt-4 flex items-center justify-center gap-3 text-sm">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="text-muted">
                Page {meta.page} of {meta.totalPages}
              </span>
              <Button size="sm" variant="secondary" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </nav>
          )}
        </div>
      </section>
    </Card>
  );
}
