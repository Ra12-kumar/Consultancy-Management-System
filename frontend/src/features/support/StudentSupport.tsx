"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField } from "@/components/ui/Field";
import { Alert, Avatar, Badge, Card, EmptyState } from "@/components/ui/Feedback";
import { LoadState, PageTitle, fmtDate } from "@/features/admin/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { useApiData } from "@/hooks/useApiData";
import { api, apiGet, apiPatch, apiPost, apiUpload } from "@/services/api";
import type { ApiError, User } from "@/types/api";

const errMsg = (e: unknown) => (e as ApiError)?.message ?? "Something went wrong";
export const FEEDBACK_CATEGORIES: Record<string, string> = { counselling: "Counselling", service: "Overall service", website: "Website", college_information: "College information", admission_process: "Admission process", other: "Other" };

// ---- Profile photo ----

export function PhotoCard() {
  const { user, setUser } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  if (!user) return null;
  async function choose(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setState({ busy: false, error: "Choose a photo smaller than 2 MB" });
    setState({ busy: true });
    try {
      setUser(await apiUpload<User>("PUT", "/students/me/photo", file, file.name));
      setState({ busy: false });
    } catch (e) {
      setState({ busy: false, error: errMsg(e) });
    } finally {
      if (input.current) input.current.value = "";
    }
  }
  return (
    <Card>
      <h2 className="font-semibold">Profile photo</h2>
      <div className="mt-3 flex items-center gap-4">
        <Avatar name={user.name} size="lg" src={user.photoUrl} />
        <div className="space-y-2">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a profile photo" className="block text-sm" onChange={(e) => void choose(e.target.files?.[0])} disabled={state.busy} />
          <p className="text-xs text-muted">JPG, PNG or WebP, up to 2 MB. Only you and our team can see it.</p>
          {user.photoUrl && (
            <Button size="sm" variant="ghost" disabled={state.busy} onClick={async () => setUser(await api<User>("DELETE", "/students/me/photo").then((r) => r.data))}>
              Remove photo
            </Button>
          )}
        </div>
      </div>
      {state.error && (
        <div className="mt-3">
          <Alert>{state.error}</Alert>
        </div>
      )}
    </Card>
  );
}

// ---- Personal data requests ----

type DataRequest = { reference: string; type: "correction" | "deletion"; details: string; status: string; resolutionNote: string; createdAt: string; handledAt: string | null };

export function DataRequestsCard() {
  const list = useApiData((signal) => apiGet<DataRequest[]>("/students/me/data-requests", { signal }), []);
  const [form, setForm] = useState<{ type: "" | "correction" | "deletion"; details: string; confirm: boolean }>({ type: "", details: "", confirm: false });
  const [state, setState] = useState<{ busy: boolean; error?: string; ok?: string }>({ busy: false });
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.type) return;
    setState({ busy: true });
    try {
      const r = await apiPost<DataRequest>("/students/me/data-requests", { type: form.type, details: form.details.trim() });
      setState({ busy: false, ok: `Request ${r.reference} sent. We will email you when it is handled.` });
      setForm({ type: "", details: "", confirm: false });
      list.reload();
    } catch (err) {
      setState({ busy: false, error: errMsg(err) });
    }
  }
  return (
    <Card>
      <h2 className="font-semibold">Your personal data</h2>
      <p className="mt-1 text-sm text-muted">Ask us to correct your details or to delete your account. Deleting removes your name, contact details, profile, photo and uploaded documents; enquiry records are kept without anything that identifies you.</p>
      {list.data && list.data.length > 0 && (
        <ul className="mt-3 divide-y divide-line text-sm">
          {list.data.map((r) => (
            <li key={r.reference} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-mono text-xs">{r.reference}</span> · {r.type === "deletion" ? "Delete my account" : "Correct my details"}
                {r.resolutionNote && <span className="block text-xs text-muted">{r.resolutionNote}</span>}
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={r.status === "completed" ? "success" : r.status === "pending" ? "gold" : "neutral"}>{r.status}</Badge>
                {r.status === "pending" && (
                  <Button size="sm" variant="ghost" onClick={async () => { await apiPost(`/students/me/data-requests/${r.reference}/cancel`); list.reload(); }}>
                    Cancel
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="mt-4 space-y-3">
        <SelectField label="What would you like?" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type, confirm: false })}>
          <option value="">Choose…</option>
          <option value="correction">Correct my details</option>
          <option value="deletion">Delete my account</option>
        </SelectField>
        {form.type && <TextAreaField label={form.type === "correction" ? "What should be corrected?" : "Anything we should know? (optional)"} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} maxLength={2000} required={form.type === "correction"} />}
        {form.type === "deletion" && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.checked })} />I understand that once approved this cannot be undone, and I will no longer be able to sign in.
          </label>
        )}
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="success">{state.ok}</Alert>}
        {form.type && (
          <Button type="submit" variant={form.type === "deletion" ? "danger" : "primary"} disabled={state.busy || (form.type === "deletion" && !form.confirm) || (form.type === "correction" && form.details.trim().length < 5)}>
            Send request
          </Button>
        )}
      </form>
    </Card>
  );
}

// ---- Feedback and support ----

type Feedback = {
  id: string;
  rating: number;
  category: string;
  message: string;
  status: "open" | "responded" | "resolved";
  thread: Array<{ role: string; name: string; body: string; at: string }>;
  publishConsent: boolean;
  testimonial: { status: string; displayName: string };
  createdAt: string;
};

function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <span role={onChange ? "radiogroup" : undefined} aria-label={onChange ? "Rating" : `${value} out of 5`} className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => onChange(n)} className={`text-2xl leading-none ${n <= value ? "text-accent" : "text-line"}`}>
            ★
          </button>
        ) : (
          <span key={n} aria-hidden="true" className={n <= value ? "text-accent" : "text-line"}>
            ★
          </span>
        ),
      )}
    </span>
  );
}

export function FeedbackScreen() {
  const list = useApiData((signal) => apiGet<Feedback[]>("/feedback", { signal }), []);
  const [form, setForm] = useState({ rating: 0, category: "service", message: "", publishConsent: false });
  const [reply, setReply] = useState<Record<string, string>>({});
  const [state, setState] = useState<{ busy: boolean; error?: string; ok?: string }>({ busy: false });
  async function submit(e: FormEvent) {
    e.preventDefault();
    setState({ busy: true });
    try {
      await apiPost("/feedback", { rating: form.rating, category: form.category, message: form.message.trim(), publishConsent: form.publishConsent });
      setForm({ rating: 0, category: "service", message: "", publishConsent: false });
      setState({ busy: false, ok: "Thank you! We read every message." });
      list.reload();
    } catch (err) {
      setState({ busy: false, error: errMsg(err) });
    }
  }
  return (
    <div className="space-y-6">
      <PageTitle title="Feedback and support" subtitle="Tell us how we are doing, or ask for help. Replies appear here and by email." />
      <Card>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <p className="text-sm font-medium">How was your experience?</p>
            <Stars value={form.rating} onChange={(rating) => setForm({ ...form, rating })} />
          </div>
          <SelectField label="About" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {Object.entries(FEEDBACK_CATEGORIES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </SelectField>
          <TextAreaField label="Your message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength={2000} required />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={form.publishConsent} onChange={(e) => setForm({ ...form, publishConsent: e.target.checked })} />
            You may publish this on the Udaan website with my first name and city, if your team approves it. (Optional – you can change this later.)
          </label>
          {state.error && <Alert>{state.error}</Alert>}
          {state.ok && <Alert tone="success">{state.ok}</Alert>}
          <Button type="submit" disabled={state.busy || form.rating === 0 || form.message.trim().length < 5}>
            Send feedback
          </Button>
        </form>
      </Card>
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} rows={2} />
      ) : list.data.length === 0 ? (
        <EmptyState title="No feedback yet" />
      ) : (
        <ul className="space-y-3">
          {list.data.map((f) => (
            <li key={f.id} className="rounded-2xl border border-line bg-surface p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Stars value={f.rating} /> {FEEDBACK_CATEGORIES[f.category]} · {fmtDate(f.createdAt)}
                </span>
                <span className="flex items-center gap-2">
                  {f.testimonial.status === "approved" && f.publishConsent && <Badge tone="success">Published</Badge>}
                  <Badge tone={f.status === "resolved" ? "neutral" : f.status === "responded" ? "gold" : "warning"}>{f.status}</Badge>
                </span>
              </div>
              <p className="mt-2 whitespace-pre-line">{f.message}</p>
              {f.thread.map((t, i) => (
                <p key={i} className={`mt-2 rounded-xl p-3 ${t.role === "admin" ? "bg-accent/10" : "bg-surface-2"}`}>
                  <span className="block text-xs text-muted">
                    {t.name} · {fmtDate(t.at)}
                  </span>
                  {t.body}
                </p>
              ))}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={f.publishConsent} onChange={async (e) => { await apiPatch(`/feedback/${f.id}/consent`, { publishConsent: e.target.checked }); list.reload(); }} />
                  Allow publishing
                </label>
              </div>
              {f.status !== "resolved" && (
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await apiPost(`/feedback/${f.id}/messages`, { body: (reply[f.id] ?? "").trim() });
                      setReply({ ...reply, [f.id]: "" });
                      list.reload();
                    } catch (err) {
                      setState({ busy: false, error: errMsg(err) });
                    }
                  }}
                >
                  <input aria-label="Reply" placeholder="Add a reply" className="min-h-10 flex-1 rounded-xl border border-line bg-surface px-3" value={reply[f.id] ?? ""} onChange={(e) => setReply({ ...reply, [f.id]: e.target.value })} maxLength={2000} />
                  <Button type="submit" size="sm" variant="secondary" disabled={!(reply[f.id] ?? "").trim()}>
                    Send
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
