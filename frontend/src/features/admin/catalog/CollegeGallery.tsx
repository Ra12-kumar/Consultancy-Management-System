"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Alert, Badge, EmptyState } from "@/components/ui/Feedback";
import { api, apiDelete, apiUpload, fieldErrors } from "@/services/api";
import type { GalleryImage } from "@/types/catalog";

export const MAX_IMAGES = 12;
const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;
const errMsg = (e: unknown) => Object.values(fieldErrors(e)).join(" ") || ((e as { message?: string }).message ?? "Something went wrong");

// Checked again by the server from the file's content; this only gives a quick answer.
export function imageProblem(file: File) {
  if (!ACCEPT.split(",").includes(file.type)) return "Choose a JPEG, PNG or WebP photo";
  if (file.size > MAX_BYTES) return "Photos can be up to 5 MB";
  return null;
}

// Moves one item to a new position (used by drag and drop and the arrow buttons).
export function move<T>(list: T[], from: number, to: number) {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

// The college's photo gallery: upload, choose the photo shown on cards, reorder, caption, replace and remove.
export default function CollegeGallery({ collegeId, initial, canEdit }: { collegeId: string; initial: GalleryImage[]; canEdit: boolean }) {
  const [images, setImages] = useState(initial);
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const base = `/admin/colleges/${collegeId}/images`;

  async function run(fn: () => Promise<GalleryImage[]>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      setImages(await fn());
      setMsg({ tone: "success", text: ok });
    } catch (err) {
      setMsg({ tone: "error", text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }
  function upload(file: File | undefined) {
    if (!file) return;
    const problem = imageProblem(file);
    if (problem) return setMsg({ tone: "error", text: problem });
    void run(() => apiUpload<GalleryImage[]>("POST", base, file, file.name, { alt: alt.trim() }), "Photo added.").then(() => setAlt(""));
    if (addInput.current) addInput.current.value = "";
  }
  function replace(id: string, file: File | undefined) {
    if (!file) return;
    const problem = imageProblem(file);
    if (problem) return setMsg({ tone: "error", text: problem });
    void run(() => apiUpload<GalleryImage[]>("PUT", `${base}/${id}`, file, file.name), "Photo replaced.");
  }
  const save = (body: Record<string, unknown>, ok: string) => run(async () => (await api<GalleryImage[]>("PATCH", base, { body })).data, ok);
  const reorder = (from: number, to: number) => {
    const next = move(images, from, to);
    if (next !== images) void save({ order: next.map((i) => i.id) }, "Order saved.");
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Upload real photos of this college that you have permission to use (JPEG, PNG or WebP, up to 5 MB, at most {MAX_IMAGES}). The primary photo is shown on college cards; drag photos or use the arrows to change the order.
      </p>
      {canEdit && images.length < MAX_IMAGES && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-dashed border-line p-4">
          <div className="min-w-56 flex-1">
            <TextField label="Caption (describe the photo)" placeholder="e.g. Main academic block" value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={160} />
          </div>
          <label className={`inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-fg ${busy ? "pointer-events-none opacity-60" : ""}`}>
            {busy ? "Working…" : "Upload photo"}
            <input ref={addInput} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        </div>
      )}
      {msg && (
        <div aria-live="polite">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      )}
      {images.length === 0 ? (
        <EmptyState title="No photos yet">Students see a neutral placeholder until you add one.</EmptyState>
      ) : (
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img, i) => (
            <li
              key={img.id}
              draggable={canEdit && !busy}
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (drag != null) reorder(drag, i);
                setDrag(null);
              }}
              className={`overflow-hidden rounded-2xl border bg-surface ${img.primary ? "border-accent ring-2 ring-accent/40" : "border-line"} ${drag === i ? "opacity-50" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- our own uploaded photo */}
              <img src={img.url} alt={img.alt} className="aspect-[4/3] w-full object-cover" />
              <div className="space-y-2 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {i + 1}. {img.alt || "No caption"}
                  </span>
                  {img.primary && <Badge tone="gold">Primary</Badge>}
                </div>
                {canEdit && (
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="ghost" disabled={busy || i === 0} onClick={() => reorder(i, i - 1)} aria-label={`Move photo ${i + 1} earlier`}>
                      ←
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy || i === images.length - 1} onClick={() => reorder(i, i + 1)} aria-label={`Move photo ${i + 1} later`}>
                      →
                    </Button>
                    {!img.primary && (
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => save({ primary: img.id }, "Primary photo changed.")}>
                        Make primary
                      </Button>
                    )}
                    <label className={`inline-flex min-h-9 cursor-pointer items-center rounded-xl border border-line px-3 text-sm font-semibold hover:bg-surface-2 ${busy ? "pointer-events-none opacity-60" : ""}`}>
                      Replace
                      <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => replace(img.id, e.target.files?.[0])} aria-label={`Replace photo ${i + 1}`} />
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm("Remove this photo? It is deleted permanently.")) void run(() => apiDelete<GalleryImage[]>(`${base}/${img.id}`), "Photo removed.");
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
