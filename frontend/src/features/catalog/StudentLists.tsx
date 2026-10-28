"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Alert, Badge, EmptyState } from "@/components/ui/Feedback";
import { LoadState, PageTitle, fmtDate } from "@/features/admin/shared";
import { useApiData } from "@/hooks/useApiData";
import { formatLakh } from "@/lib/format";
import { apiDelete, apiGet } from "@/services/api";
import type { SavedComparison, ShortlistItem } from "@/types/catalog";
import { SampleBadge } from "./CatalogUi";
import { compareStore } from "./stores";

// "My Selected Colleges"
export function ShortlistScreen() {
  const list = useApiData((signal) => apiGet<ShortlistItem[]>("/students/me/shortlist", { signal }), []);
  const [error, setError] = useState("");
  async function remove(id: string) {
    setError("");
    try {
      await apiDelete(`/students/me/shortlist/${id}`);
      list.reload();
    } catch (e) {
      setError((e as { message?: string }).message ?? "Could not remove the college");
    }
  }
  const available = list.data?.filter((i) => i.college.available) ?? [];
  return (
    <div>
      <PageTitle
        title="My selected colleges"
        subtitle="Colleges you saved while browsing. Only you can see this list."
        action={
          available.length >= 2 ? (
            <ButtonLink href={`/compare?colleges=${available.slice(0, 4).map((i) => (i.college.available ? i.college.slug : "")).join(",")}`} variant="gold" size="sm">
              Compare {Math.min(4, available.length)}
            </ButtonLink>
          ) : undefined
        }
      />
      {error && <Alert>{error}</Alert>}
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : list.data.length === 0 ? (
        <EmptyState title="No colleges saved yet">
          Use “♡ Save” in the{" "}
          <Link href="/colleges" className="font-semibold underline">
            college directory
          </Link>
          .
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {list.data.map((i) => (
            <li key={i.collegeId} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4">
              <div className="min-w-0 flex-1">
                {i.college.available ? (
                  <>
                    <Link href={`/colleges/${i.college.slug}`} className="font-semibold hover:underline">
                      {i.college.name}
                    </Link>
                    <p className="text-sm text-muted">
                      {[i.college.city, i.college.state].filter(Boolean).join(", ")}
                      {i.college.feeFromMinor != null && ` · official fees from ${formatLakh(i.college.feeFromMinor)}`}
                    </p>
                    {i.college.isSample && (
                      <div className="mt-1">
                        <SampleBadge />
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="font-semibold">{i.college.name}</p>
                    <Badge tone="warning">No longer listed</Badge>
                  </>
                )}
                {i.note && <p className="mt-1 text-sm">{i.note}</p>}
                <p className="mt-1 text-xs text-muted">Saved {fmtDate(i.addedAt)}</p>
              </div>
              <span className="flex gap-2">
                {i.college.available && (
                  <Button size="sm" variant="secondary" onClick={() => i.college.available && compareStore.toggle({ slug: i.college.slug, name: i.college.name })}>
                    + Compare
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => remove(i.collegeId)} aria-label={`Remove ${i.college.name}`}>
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// "My Comparisons"
export function ComparisonsScreen() {
  const list = useApiData((signal) => apiGet<SavedComparison[]>("/students/me/comparisons", { signal }), []);
  const [error, setError] = useState("");
  async function remove(id: string) {
    setError("");
    try {
      await apiDelete(`/students/me/comparisons/${id}`);
      list.reload();
    } catch (e) {
      setError((e as { message?: string }).message ?? "Could not delete the comparison");
    }
  }
  return (
    <div>
      <PageTitle title="My comparisons" subtitle="Comparisons you saved. Fees are always shown as currently published." />
      {error && <Alert>{error}</Alert>}
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : list.data.length === 0 ? (
        <EmptyState title="No saved comparisons">
          Compare colleges from the{" "}
          <Link href="/colleges" className="font-semibold underline">
            directory
          </Link>{" "}
          and choose “Save comparison”.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {list.data.map((c) => {
            const slugs = c.colleges.flatMap((x) => (x.available ? [x.slug] : []));
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-sm text-muted">
                    {c.colleges.map((x) => x.name).join(" · ")}
                    {c.course && ` · ${c.course.name}`}
                  </p>
                  <p className="mt-1 text-xs text-muted">Saved {fmtDate(c.createdAt)}</p>
                </div>
                <span className="flex gap-2">
                  {slugs.length >= 2 ? (
                    <ButtonLink size="sm" href={`/compare?colleges=${slugs.join(",")}${c.course ? `&course=${c.course.slug}` : ""}`}>
                      Open
                    </ButtonLink>
                  ) : (
                    <Badge tone="warning">Colleges no longer listed</Badge>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => remove(c.id)} aria-label={`Delete ${c.name}`}>
                    Delete
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
