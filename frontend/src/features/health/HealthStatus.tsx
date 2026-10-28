"use client";

import { useApiHealth } from "@/hooks/useApiHealth";
import { publicEnv } from "@/lib/env";

// Live status of the backend API and its database, from GET /api/health/ready.
export default function HealthStatus() {
  const health = useApiHealth();

  let tone = "border-line bg-surface";
  let dot = "bg-muted animate-pulse";
  let title = "Checking the system…";
  let detail = "Contacting the API.";
  if (health.status === "done" && health.data.status === "ready") {
    tone = "border-success/40 bg-success/10";
    dot = "bg-success";
    title = "All systems ready";
    detail = `API and database connected. Email: ${health.data.mail === "smtp" ? "sending through SMTP" : "logged only (no SMTP set up yet)"}.`;
  } else if (health.status === "done") {
    tone = "border-warning/40 bg-warning/10";
    dot = "bg-warning";
    title = "API running, database unavailable";
    detail = "The backend is up but cannot reach MongoDB. Check that MongoDB is running.";
  } else if (health.status === "error") {
    tone = "border-danger/40 bg-danger/10";
    dot = "bg-danger";
    title = "API unreachable";
    detail = `${health.error.message}. Start the backend (npm run dev:backend) and check ${publicEnv.apiBaseUrl}.`;
  }

  return (
    <section aria-labelledby="system-status" className={`rounded-2xl border p-5 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className={`mt-1.5 size-3 shrink-0 rounded-full ${dot}`} />
          <div>
            <h2 id="system-status" className="font-semibold">
              {title}
            </h2>
            <p role="status" className="mt-1 text-sm text-muted">
              {detail}
            </p>
          </div>
        </div>
        <button type="button" onClick={health.refresh} disabled={health.status === "loading"} className="min-h-11 rounded-lg border border-line px-4 text-sm font-semibold hover:bg-foreground/5 disabled:opacity-50">
          Check again
        </button>
      </div>
    </section>
  );
}
