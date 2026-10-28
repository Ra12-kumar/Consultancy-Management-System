"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Alert, Badge, Skeleton } from "@/components/ui/Feedback";
import type { ApiError, PageMeta } from "@/types/api";

export const fmtDate = (d: string | null | undefined) => (d ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(d)) : "—");

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function LoadState({ status, error, reload, rows = 3 }: { status: string; error: ApiError | null; reload: () => void; rows?: number }) {
  if (status === "error") {
    return (
      <div className="space-y-3">
        <Alert>{error?.status === 403 ? "You do not have permission to view this." : error?.message}</Alert>
        <Button size="sm" variant="secondary" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }
  return (
    <div role="status" aria-label="Loading" className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}

export function Pager({ meta, onPage }: { meta?: PageMeta; onPage: (p: number) => void }) {
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-2 text-sm">
      <span className="text-muted">
        Page {meta.page} of {meta.totalPages} · {meta.total} total
      </span>
      <span className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
          Previous
        </Button>
        <Button size="sm" variant="secondary" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>
          Next
        </Button>
      </span>
    </nav>
  );
}

const EMAIL_TONES: Record<string, "success" | "warning" | "danger" | "neutral" | "gold"> = { sent: "success", queued: "gold", sending: "gold", retrying: "warning", failed: "danger", not_sent_unconfigured: "neutral" };
const EMAIL_LABELS: Record<string, string> = { sent: "Sent", queued: "Queued", sending: "Sending", retrying: "Retrying", failed: "Failed", not_sent_unconfigured: "Not sent (email not set up)" };
export const EmailStatusBadge = ({ status }: { status: string }) => <Badge tone={EMAIL_TONES[status] ?? "neutral"}>{EMAIL_LABELS[status] ?? status}</Badge>;
