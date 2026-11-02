"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Alert, Badge, Card, EmptyState } from "@/components/ui/Feedback";
import { LoadState, PageTitle, Pager, fmtDate } from "@/features/admin/shared";
import { CoverageNote } from "@/features/catalog/CollegeDirectory";
import { useApiData } from "@/hooks/useApiData";
import { api, apiGet, apiPost, apiUpload } from "@/services/api";
import type { ApiError, PageMeta } from "@/types/api";
import type { DirectoryCoverage } from "@/types/catalog";

// Mirrors backend/src/services/directory/{importJob,directoryAdmin}.service.ts.
type Importer = { id: string; label: string; sourceName: string; sourceUrl: string; licence: string; howToGet: string; formats: string[]; requiredColumns: string[] };
type Counts = { processed: number; created: number; updated: number; unchanged: number; skipped: number; rejected: number; duplicates: number; conflicts: number };
export type ImportJob = {
  id: string;
  importer: string;
  sourceName: string;
  fileName: string;
  sourceDataDate: string | null;
  fullSnapshot: boolean;
  status: "queued" | "running" | "completed" | "completed_with_errors" | "failed" | "interrupted";
  attempts: number;
  totalRows: number;
  progress: number;
  counts: Counts;
  rowErrors: Array<{ row: number; code: string; message: string }>;
  failure: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};
type Brief = { id: string; name: string; slug: string; aisheCode: string | null; state: string; district: string; status: string; source: string } | null;
type ReviewItem = { id: string; kind: "possible_duplicate" | "field_conflict"; college: Brief; otherCollege: Brief; field: string; currentValue: unknown; incomingValue: unknown; reason: string; status: "open" | "resolved"; resolution: string; note: string; createdAt: string };
type StaleItem = NonNullable<Brief> & { lastVerifiedAt: string | null; lastSeenAt: string | null; reason: "not_in_source" | "verification_due" };
type StateCoverage = { state: string; total: number; universities: number; colleges: number; standalone: number; basicListings: number; needsReview: number; withVerifiedFees: number };

const errMsg = (e: unknown) => (e as ApiError)?.message ?? "Something went wrong";
const STATUS: Record<ImportJob["status"], [string, "neutral" | "success" | "warning" | "danger" | "gold"]> = {
  queued: ["Queued", "neutral"],
  running: ["Running", "gold"],
  completed: ["Completed", "success"],
  completed_with_errors: ["Completed with rejected rows", "warning"],
  failed: ["Failed", "danger"],
  interrupted: ["Interrupted", "warning"],
};
const active = (j: ImportJob) => j.status === "queued" || j.status === "running";
const show = (v: unknown) => (v == null || v === "" ? "(empty)" : typeof v === "object" ? JSON.stringify(v) : String(v));

const TABS = [
  ["imports", "Imports"],
  ["reviews", "Review queue"],
  ["stale", "Stale records"],
  ["coverage", "Coverage"],
] as const;
type Tab = (typeof TABS)[number][0];

export function CollegeData() {
  const [tab, setTab] = useState<Tab>("imports");
  return (
    <>
      <PageTitle title="College data" subtitle="Import institutions from authorised sources, resolve duplicates and conflicts, and see what the directory covers." />
      <div role="tablist" aria-label="College data" className="mb-6 flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" type="button" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)} className={`min-h-10 rounded-lg px-3 text-sm ${tab === id ? "bg-surface font-semibold shadow-sm" : "text-muted hover:text-foreground"}`}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "imports" && <Imports />}
        {tab === "reviews" && <Reviews />}
        {tab === "stale" && <Stale />}
        {tab === "coverage" && <Coverage />}
      </div>
    </>
  );
}

// ---- Imports ----

function UploadForm({ importers, onQueued }: { importers: Importer[]; onQueued: () => void }) {
  const [importer, setImporter] = useState(importers[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [full, setFull] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ busy: boolean; error?: string; details?: string[]; done?: string }>({ busy: false });
  const def = importers.find((i) => i.id === importer);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setState({ busy: false, error: "Choose the file you downloaded from the source." });
    setState({ busy: true });
    try {
      await apiUpload<ImportJob>("POST", "/admin/college-imports", file, file.name, { importer, fullSnapshot: full ? "yes" : "no", ...(date && { sourceDataDate: date }) });
      if (fileRef.current) fileRef.current.value = "";
      setState({ busy: false, done: `${file.name} is queued. Progress appears below.` });
      onQueued();
    } catch (err) {
      const e2 = err as ApiError;
      setState({ busy: false, error: errMsg(err), details: e2.details?.map((d) => d.message) });
    }
  }

  return (
    <Card>
      <h2 className="font-semibold">Import a file</h2>
      <form onSubmit={submit} className="mt-3 grid gap-4 md:grid-cols-2">
        <SelectField label="Data source" value={importer} onChange={(e) => setImporter(e.target.value)} required>
          {importers.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </SelectField>
        <TextField label="Source data date (optional)" hint="When the source published this dataset." type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <label className="block text-sm font-medium md:col-span-2">
          File ({def?.formats.map((f) => f.toUpperCase()).join(" or ")}, up to 60 MB)
          <input ref={fileRef} type="file" accept=".xlsx,.csv" className="mt-1.5 block w-full text-sm file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:font-semibold" />
        </label>
        <label className="flex items-start gap-2 text-sm md:col-span-2">
          <input type="checkbox" className="mt-0.5 size-4" checked={full} onChange={(e) => setFull(e.target.checked)} />
          <span>
            This is the complete list from the source
            <span className="block text-xs text-muted">Records from this source that are missing from the file are then flagged as stale (they are never deleted). Untick for a partial file.</span>
          </span>
        </label>
        {def && (
          <div className="rounded-xl bg-surface-2 p-3 text-xs text-muted md:col-span-2">
            <p>
              <strong className="text-foreground">How to get it:</strong> {def.howToGet}
            </p>
            <p className="mt-1">
              <strong className="text-foreground">Source:</strong>{" "}
              <a href={def.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                {def.sourceName}
              </a>{" "}
              · {def.licence}
            </p>
            <p className="mt-1">
              <strong className="text-foreground">Required columns:</strong> AISHE code, name, state. District, year of establishment, management and type are read when present.
            </p>
          </div>
        )}
        <div className="md:col-span-2">
          {state.error && (
            <div className="mb-3">
              <Alert title={state.error}>
                {state.details && state.details.length > 0 && (
                  <ul className="list-disc pl-5">
                    {state.details.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                )}
              </Alert>
            </div>
          )}
          {state.done && (
            <div className="mb-3">
              <Alert tone="success">{state.done}</Alert>
            </div>
          )}
          <Button type="submit" disabled={state.busy}>
            {state.busy ? "Checking the file…" : "Upload and import"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function JobRow({ job, onRetry }: { job: ImportJob; onRetry: (id: string) => void }) {
  const [label, tone] = STATUS[job.status];
  const c = job.counts;
  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold break-words">{job.fileName}</p>
          <p className="text-xs text-muted">
            {job.sourceName} · uploaded {fmtDate(job.createdAt)}
            {job.sourceDataDate && ` · data of ${fmtDate(job.sourceDataDate).split(",")[0]}`}
            {job.fullSnapshot ? " · complete list" : " · partial file"}
          </p>
        </div>
        <Badge tone={tone}>{label}</Badge>
      </div>
      {active(job) && (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={`Import progress for ${job.fileName}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress}>
            <div className="h-full bg-accent transition-all" style={{ width: `${job.progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {job.totalRows ? `${c.processed.toLocaleString("en-IN")} of ${job.totalRows.toLocaleString("en-IN")} rows` : "Waiting to start"}
          </p>
        </div>
      )}
      {c.processed > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          {(
            [
              ["New", c.created],
              ["Updated", c.updated],
              ["Unchanged", c.unchanged],
              ["Rejected", c.rejected],
              ["Skipped", c.skipped],
              ["Possible duplicates", c.duplicates],
              ["Conflicts", c.conflicts],
              ["Rows read", c.processed],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2">
              <dt className="text-muted">{k}</dt>
              <dd className="tabular-nums">{v.toLocaleString("en-IN")}</dd>
            </div>
          ))}
        </dl>
      )}
      {job.failure && <p className={`mt-3 text-sm ${job.status === "failed" || job.status === "interrupted" ? "text-danger" : "text-muted"}`}>{job.failure}</p>}
      {job.rowErrors.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Rejected rows ({job.rowErrors.length}
            {c.rejected + c.skipped > job.rowErrors.length ? `, first ${job.rowErrors.length} shown` : ""})
          </summary>
          <div className="mt-2 max-h-64 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-muted">
                  <th scope="col" className="py-1 pr-3">
                    Row
                  </th>
                  <th scope="col" className="py-1 pr-3">
                    Problem
                  </th>
                </tr>
              </thead>
              <tbody>
                {job.rowErrors.map((r) => (
                  <tr key={`${r.row}-${r.code}`} className="border-t border-line">
                    <td className="py-1 pr-3 tabular-nums">{r.row}</td>
                    <td className="py-1">{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {(job.status === "failed" || job.status === "interrupted") && (
        <div className="mt-3">
          <Button size="sm" variant="secondary" onClick={() => onRetry(job.id)}>
            Retry from last checkpoint
          </Button>
        </div>
      )}
    </li>
  );
}

function Imports() {
  const importers = useApiData((signal) => apiGet<Importer[]>("/admin/college-importers", { signal }), []);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const jobs = useApiData(async (signal) => {
    const { data, meta } = await api<ImportJob[]>("GET", `/admin/college-imports?page=${page}&limit=10`, { signal });
    return { items: data, meta: meta as PageMeta };
  }, [page]);
  const running = jobs.data?.items.some(active) ?? false;
  const { reload } = jobs;
  // Poll while an import is queued or running.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [running, reload]);

  async function retry(id: string) {
    setError("");
    try {
      await apiPost(`/admin/college-imports/${id}/retry`);
      reload();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <div className="space-y-6">
      <Alert tone="info" title="Only authorised, openly licensed sources">
        Imports read files published by official sources (currently the AISHE lists from the Ministry of Education). Imported institutions are published as basic listings without courses or fees; add and verify those under Colleges &amp; fees. Imports never delete records, and fields an administrator has edited are not overwritten.
      </Alert>
      {importers.data ? <UploadForm importers={importers.data} onQueued={reload} /> : <LoadState status={importers.status} error={importers.error} reload={importers.reload} rows={1} />}
      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 font-semibold">
          Import history
        </h2>
        {error && (
          <div className="mb-3">
            <Alert>{error}</Alert>
          </div>
        )}
        {!jobs.data ? (
          <LoadState status={jobs.status} error={jobs.error} reload={reload} />
        ) : jobs.data.items.length === 0 ? (
          <EmptyState title="No imports yet">Upload a file from an authorised source to start.</EmptyState>
        ) : (
          <>
            <ul className="space-y-3">
              {jobs.data.items.map((j) => (
                <JobRow key={j.id} job={j} onRetry={retry} />
              ))}
            </ul>
            <Pager meta={jobs.data.meta} onPage={setPage} />
          </>
        )}
      </section>
    </div>
  );
}

// ---- Review queue ----

const ACTIONS: Record<ReviewItem["kind"], Array<[string, string]>> = {
  possible_duplicate: [
    ["not_duplicate", "Not a duplicate – publish"],
    ["archive_existing", "Same institution – keep the imported record, archive the other"],
    ["archive_new", "Same institution – archive the imported record"],
  ],
  field_conflict: [
    ["keep_current", "Keep our value"],
    ["accept_incoming", "Use the source’s value"],
  ],
};

function CollegeLink({ c }: { c: Brief }) {
  if (!c) return <span className="text-muted">(removed)</span>;
  return (
    <>
      <Link href={`/admin/colleges/${c.id}`} className="font-semibold underline-offset-2 hover:underline">
        {c.name}
      </Link>
      <span className="text-xs text-muted">
        {" "}
        · {[c.district, c.state].filter(Boolean).join(", ")}
        {c.aisheCode ? ` · ${c.aisheCode}` : " · no AISHE code"} · {c.status}
      </span>
    </>
  );
}

function Reviews() {
  const [f, setF] = useState({ kind: "", status: "open", page: 1 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const list = useApiData(async (signal) => {
    const { data, meta } = await api<ReviewItem[]>("GET", `/admin/directory/reviews?status=${f.status}&page=${f.page}${f.kind ? `&kind=${f.kind}` : ""}`, { signal });
    return { items: data, meta: meta as PageMeta };
  }, [f.kind, f.status, f.page]);

  async function resolve(id: string, action: string) {
    setError("");
    setBusy(id);
    try {
      await apiPost(`/admin/directory/reviews/${id}/resolve`, { action });
      list.reload();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <SelectField label="Kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, page: 1 })}>
          <option value="">All</option>
          <option value="possible_duplicate">Possible duplicates</option>
          <option value="field_conflict">Field conflicts</option>
        </SelectField>
        <SelectField label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
        </SelectField>
      </div>
      {error && <Alert>{error}</Alert>}
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title={f.status === "open" ? "Nothing to review" : "No resolved items"}>Possible duplicates and conflicts found during imports appear here.</EmptyState>
      ) : (
        <>
          <ul className="space-y-3">
            {list.data.items.map((i) => (
              <li key={i.id} className="rounded-xl border border-line p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={i.kind === "possible_duplicate" ? "warning" : "gold"}>{i.kind === "possible_duplicate" ? "Possible duplicate" : `Conflict: ${i.field}`}</Badge>
                  <span className="text-xs text-muted">{fmtDate(i.createdAt)}</span>
                </div>
                <p className="mt-2">
                  <CollegeLink c={i.college} />
                </p>
                {i.kind === "possible_duplicate" ? (
                  <p className="mt-1">
                    <span className="text-muted">May be the same as: </span>
                    <CollegeLink c={i.otherCollege} />
                  </p>
                ) : (
                  <dl className="mt-2 grid gap-1 sm:grid-cols-[10rem_1fr]">
                    <dt className="text-muted">Our value (verified)</dt>
                    <dd className="break-words">{show(i.currentValue)}</dd>
                    <dt className="text-muted">Source’s value</dt>
                    <dd className="break-words">{show(i.incomingValue)}</dd>
                  </dl>
                )}
                <p className="mt-1 text-xs text-muted">{i.reason}</p>
                {i.status === "open" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ACTIONS[i.kind].map(([action, label]) => (
                      <Button key={action} size="sm" variant="secondary" disabled={busy === i.id} onClick={() => resolve(i.id, action)}>
                        {label}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs">Resolved: {ACTIONS[i.kind].find(([a]) => a === i.resolution)?.[1] ?? i.resolution}</p>
                )}
              </li>
            ))}
          </ul>
          <Pager meta={list.data.meta} onPage={(p) => setF({ ...f, page: p })} />
        </>
      )}
    </div>
  );
}

// ---- Stale records ----

function Stale() {
  const [f, setF] = useState({ reason: "", page: 1 });
  const list = useApiData(async (signal) => {
    const { data, meta } = await api<StaleItem[]>("GET", `/admin/directory/stale?page=${f.page}${f.reason ? `&reason=${f.reason}` : ""}`, { signal });
    return { items: data, meta: meta as PageMeta };
  }, [f.reason, f.page]);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Records missing from the latest complete import of their source, and detailed records last verified more than a year ago. Nothing is changed automatically: check each one, then update, re-verify or archive it.</p>
      <SelectField label="Reason" value={f.reason} onChange={(e) => setF({ reason: e.target.value, page: 1 })}>
        <option value="">All</option>
        <option value="not_in_source">Not in the latest source file</option>
        <option value="verification_due">Verification over a year old</option>
      </SelectField>
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="No stale records">Everything was seen in its latest source file and verified within the year.</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr>
                  <th scope="col" className="p-2">
                    Institution
                  </th>
                  <th scope="col" className="p-2">
                    Reason
                  </th>
                  <th scope="col" className="p-2">
                    Last seen in source
                  </th>
                  <th scope="col" className="p-2">
                    Last verified
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((s) => (
                  <tr key={s.id} className="border-t border-line">
                    <td className="p-2">
                      <Link href={`/admin/colleges/${s.id}`} className="font-medium underline-offset-2 hover:underline">
                        {s.name}
                      </Link>
                      <span className="block text-xs text-muted">{[s.aisheCode, s.district, s.state].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td className="p-2">{s.reason === "not_in_source" ? "Not in latest file" : "Verification due"}</td>
                    <td className="p-2">{fmtDate(s.lastSeenAt)}</td>
                    <td className="p-2">{fmtDate(s.lastVerifiedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager meta={list.data.meta} onPage={(p) => setF({ ...f, page: p })} />
        </>
      )}
    </div>
  );
}

// ---- Coverage ----

function Coverage() {
  const data = useApiData((signal) => apiGet<{ overall: DirectoryCoverage; byState: StateCoverage[] }>("/admin/directory/coverage", { signal }), []);
  if (!data.data) return <LoadState status={data.status} error={data.error} reload={data.reload} />;
  const { overall, byState } = data.data;
  const n = (v: number) => v.toLocaleString("en-IN");
  return (
    <div className="space-y-4">
      <CoverageNote coverage={overall} />
      {overall.partial && <p className="text-sm text-muted">Coverage is marked partial until all three AISHE lists (colleges, universities and standalone institutions) have been imported.</p>}
      {byState.length === 0 ? (
        <EmptyState title="No institutions yet">Import a file to see coverage by state.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">Institutions by state or union territory</caption>
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                {["State / UT", "Total", "Universities", "Colleges", "Standalone", "Basic listings", "With verified fees", "Needs review"].map((h, i) => (
                  <th key={h} scope="col" className={`p-2 ${i ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byState.map((s) => (
                <tr key={s.state} className="border-t border-line">
                  <th scope="row" className="p-2 font-medium">
                    {s.state}
                  </th>
                  {[s.total, s.universities, s.colleges, s.standalone, s.basicListings, s.withVerifiedFees, s.needsReview].map((v, i) => (
                    <td key={i} className="p-2 text-right tabular-nums">
                      {n(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
