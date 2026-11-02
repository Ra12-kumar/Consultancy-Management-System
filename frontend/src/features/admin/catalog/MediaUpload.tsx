"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { apiDelete, apiUpload } from "@/services/api";
import type { ApiError } from "@/types/api";

const LIMITS = {
  image: {
    types: ["image/jpeg", "image/png", "image/webp"],
    mb: 5,
    accept: "image/jpeg,image/png,image/webp",
    label: "JPEG, PNG or WebP, up to 5 MB",
  },
  pdf: {
    types: ["application/pdf"],
    mb: 10,
    accept: "application/pdf",
    label: "PDF, up to 10 MB",
  },
} as const;

// A quick check before sending; the server checks the file's real content again.
export function mediaProblem(file: File, kind: keyof typeof LIMITS) {
  const l = LIMITS[kind];
  if (!(l.types as readonly string[]).includes(file.type)) return `Choose a ${l.label.split(",")[0]} file`;
  if (file.size > l.mb * 1024 * 1024) return `The file is larger than ${l.mb} MB`;
  return null;
}

// Upload, replace or remove one logo, picture or brochure.
export default function MediaUpload({ label, kind, path, url, canEdit, onChange }: { label: string; kind: keyof typeof LIMITS; path: string; url: string | null | undefined; canEdit: boolean; onChange: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: "success", text: done });
      onChange();
    } catch (err) {
      setMsg({ tone: "error", text: (err as ApiError).message });
    }
    setBusy(false);
  }

  function pick(file: File | undefined) {
    if (!file) return;
    const problem = mediaProblem(file, kind);
    if (problem) return setMsg({ tone: "error", text: problem });
    void run(() => apiUpload("POST", path, file, file.name), url ? "Replaced." : "Uploaded.");
    if (input.current) input.current.value = "";
  }

  return (
    <div className="rounded-xl border border-line p-4">
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-xs text-muted">{LIMITS[kind].label}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {url ? (
          kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- our own uploaded image
            <img src={url} alt="" className="h-16 w-16 rounded-lg border border-line object-contain" />
          ) : (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline">
              View current brochure
            </a>
          )
        ) : (
          <span className="text-sm text-muted">Nothing uploaded yet</span>
        )}
        {canEdit && (
          <>
            <label className="inline-flex min-h-10 cursor-pointer items-center rounded-xl border border-line px-3 text-sm font-semibold hover:bg-surface-2">
              {url ? "Replace" : "Upload"}
              <input ref={input} type="file" accept={LIMITS[kind].accept} className="sr-only" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
            </label>
            {url && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => window.confirm(`Remove this ${kind === "pdf" ? "brochure" : "picture"}?`) && void run(() => apiDelete(path), "Removed.")}>
                Remove
              </Button>
            )}
          </>
        )}
      </div>
      {busy && <p className="mt-2 text-xs text-muted">Uploading…</p>}
      {msg && (
        <div className="mt-2">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      )}
    </div>
  );
}
