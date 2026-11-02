"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert, Badge, EmptyState } from "@/components/ui/Feedback";
import { LoadState, PageTitle } from "@/features/admin/shared";
import { useApiData } from "@/hooks/useApiData";
import { api, apiGet, fieldErrors } from "@/services/api";
import type { FeaturedCollege } from "@/types/catalog";
import { move } from "./CollegeGallery";

type Pick = { id: string; name: string; status: string; city?: string; state?: string };

// The featured colleges on the public site, in display order. Drag to reorder (or use the arrows), add or
// remove colleges, then save.
export default function FeaturedColleges() {
  const current = useApiData((signal) => apiGet<FeaturedCollege[]>("/admin/colleges/featured", { signal }), []);
  if (!current.data) return <LoadState status={current.status} error={current.error} reload={current.reload} rows={4} />;
  return <FeaturedEditor key={current.data.map((c) => c.id).join()} initial={current.data} />;
}

function FeaturedEditor({ initial }: { initial: FeaturedCollege[] }) {
  const [list, setList] = useState<Pick[]>(initial);
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState<number | null>(null);
  const [state, setState] = useState<{ busy: boolean; tone?: "success" | "error"; text?: string }>({ busy: false });
  const search = useApiData(
    async (signal) => (q.trim().length < 2 ? [] : (await api<Pick[]>("GET", `/admin/colleges?q=${encodeURIComponent(q.trim())}&limit=8`, { signal })).data),
    [q],
  );
  const dirty = list.map((c) => c.id).join() !== initial.map((c) => c.id).join();

  async function save() {
    setState({ busy: true });
    try {
      const saved = (await api<FeaturedCollege[]>("PUT", "/admin/colleges/featured", { body: { ids: list.map((c) => c.id) } })).data;
      setList(saved);
      setState({ busy: false, tone: "success", text: "Featured colleges saved. The public site shows them in this order." });
    } catch (err) {
      setState({ busy: false, tone: "error", text: Object.values(fieldErrors(err)).join(" ") || (err as { message?: string }).message });
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm">
        <Link href="/admin/colleges" className="text-muted hover:underline">
          ← All colleges
        </Link>
      </p>
      <PageTitle title="Featured colleges" subtitle="Choose the colleges highlighted on the home page and in the directory, and their order." />
      <div className="rounded-2xl border border-line bg-surface p-4">
        <label htmlFor="featured-add" className="text-sm font-semibold">
          Add a college
        </label>
        <input id="featured-add" type="search" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm" />
        {(search.data ?? []).length > 0 && (
          <ul className="mt-2 divide-y divide-line text-sm">
            {search.data!.map((c) => {
              const added = list.some((x) => x.id === c.id);
              return (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {c.name} {c.status !== "published" && <Badge tone="warning">{c.status}</Badge>}
                  </span>
                  <Button size="sm" variant="secondary" disabled={added || c.status === "archived"} onClick={() => setList([...list, c])}>
                    {added ? "Added" : "Add"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {list.length === 0 ? (
        <EmptyState title="No featured colleges">Add colleges above to highlight them on the public site.</EmptyState>
      ) : (
        <ol className="space-y-2" aria-label="Featured order">
          {list.map((c, i) => (
            <li
              key={c.id}
              draggable={!state.busy}
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (drag != null) setList(move(list, drag, i));
                setDrag(null);
              }}
              className={`flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3 ${drag === i ? "opacity-50" : ""}`}
            >
              <span aria-hidden="true" className="cursor-grab text-muted">
                ⋮⋮
              </span>
              <span className="w-6 text-right font-semibold tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{c.name}</span>
                <span className="text-xs text-muted">{[c.city, c.state].filter(Boolean).join(", ")}</span>
              </span>
              {c.status !== "published" && <Badge tone="warning">Not published – hidden from students</Badge>}
              <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => setList(move(list, i, i - 1))} aria-label={`Move ${c.name} up`}>
                ↑
              </Button>
              <Button size="sm" variant="ghost" disabled={i === list.length - 1} onClick={() => setList(move(list, i, i + 1))} aria-label={`Move ${c.name} down`}>
                ↓
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setList(list.filter((x) => x.id !== c.id))} aria-label={`Remove ${c.name} from featured`}>
                Remove
              </Button>
            </li>
          ))}
        </ol>
      )}
      {state.text && <Alert tone={state.tone}>{state.text}</Alert>}
      <Button onClick={save} disabled={state.busy || !dirty}>
        {state.busy ? "Saving…" : "Save order"}
      </Button>
    </div>
  );
}
