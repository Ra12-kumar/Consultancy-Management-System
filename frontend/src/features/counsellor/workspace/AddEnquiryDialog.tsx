"use client";

import { useRef, useState, type FormEvent } from "react";
import { apiPost } from "@/services/api";
import type { ApiError } from "@/types/api";

// "Add Enquiry" on the counsellor dashboard: records a phone or walk-in enquiry through the existing callback
// request API (POST /api/leads/callback). It appears in the admin's "Website callback requests" to be assigned;
// a full enquiry is created when the student registers and submits one. Consent is required, as on the website.

const EDUCATION = [
  ["class_10", "Class 10"],
  ["class_12", "Class 12"],
  ["diploma", "Diploma"],
  ["undergraduate", "Undergraduate"],
  ["postgraduate", "Postgraduate"],
  ["other", "Other"],
] as const;
const field = "mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-200 focus:outline-none";

export function useAddEnquiry() {
  const ref = useRef<HTMLDialogElement>(null);
  return { ref, open: () => ref.current?.showModal?.() };
}

export default function AddEnquiryDialog({ dialogRef }: { dialogRef: React.RefObject<HTMLDialogElement | null> }) {
  const [form, setForm] = useState({ name: "", mobile: "", role: "student", education: "class_12", interest: "", consent: false });
  const [state, setState] = useState<{ busy: boolean; done?: boolean; error?: string; fields?: Record<string, string> }>({ busy: false });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const close = () => {
    dialogRef.current?.close();
    setState({ busy: false });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState({ busy: true });
    try {
      await apiPost("/leads/callback", { ...form, name: form.name.trim(), interest: form.interest.trim() });
      setState({ busy: false, done: true });
      setForm({ name: "", mobile: "", role: "student", education: "class_12", interest: "", consent: false });
    } catch (err) {
      const a = err as ApiError & { details?: Array<{ field: string; message: string }> };
      setState({ busy: false, error: a.message ?? "Could not save. Please try again.", fields: Object.fromEntries((a.details ?? []).map((d) => [d.field, d.message])) });
    }
  }

  return (
    <dialog ref={dialogRef} aria-labelledby="add-enquiry-title" className="m-auto w-[min(480px,calc(100vw-32px))] rounded-2xl p-0 backdrop:bg-slate-900/50">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 id="add-enquiry-title" className="text-base font-bold">
          Add enquiry
        </h2>
        <button type="button" onClick={close} aria-label="Close" className="flex size-8 items-center justify-center rounded-lg text-lg hover:bg-slate-100">
          ×
        </button>
      </div>
      {state.done ? (
        <div className="space-y-4 p-5 text-sm">
          <p className="font-semibold text-emerald-700">Enquiry recorded.</p>
          <p className="text-slate-600">It is now in the admin’s “Website callback requests” to be assigned. Ask the student to create an account to track a full enquiry.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setState({ busy: false })} className="h-9 rounded-lg bg-violet-600 px-4 font-semibold text-white hover:bg-violet-700">
              Add another
            </button>
            <button type="button" onClick={close} className="h-9 rounded-lg border border-slate-200 px-4 font-semibold hover:bg-slate-50">
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3 p-5 text-sm" noValidate>
          <p className="text-xs text-slate-500">For a phone or walk-in enquiry. It goes to the enquiry team to be assigned.</p>
          <fieldset className="flex gap-2">
            <legend className="sr-only">Enquiry from</legend>
            {[
              ["student", "Student"],
              ["parent", "Parent / guardian"],
            ].map(([v, l]) => (
              <label key={v} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium ${form.role === v ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200"}`}>
                <input type="radio" name="role" value={v} checked={form.role === v} onChange={() => set({ role: v })} className="sr-only" />
                {l}
              </label>
            ))}
          </fieldset>
          <label className="block font-medium">
            Full name *
            <input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} required className={field} aria-invalid={Boolean(state.fields?.name)} />
            {state.fields?.name && <span className="text-xs text-rose-600">{state.fields.name}</span>}
          </label>
          <label className="block font-medium">
            Mobile number *
            <input value={form.mobile} onChange={(e) => set({ mobile: e.target.value })} inputMode="tel" maxLength={20} placeholder="10-digit number" required className={field} aria-invalid={Boolean(state.fields?.mobile)} />
            {state.fields?.mobile && <span className="text-xs text-rose-600">{state.fields.mobile}</span>}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block font-medium">
              Current education *
              <select value={form.education} onChange={(e) => set({ education: e.target.value })} className={field}>
                {EDUCATION.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="block font-medium">
              Interested in
              <input value={form.interest} onChange={(e) => set({ interest: e.target.value })} maxLength={80} placeholder="e.g. B.Tech" className={field} />
            </label>
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={form.consent} onChange={(e) => set({ consent: e.target.checked })} className="mt-0.5" />
            The student or parent agreed to be contacted about this enquiry.
          </label>
          {state.fields?.consent && <p className="text-xs text-rose-600">{state.fields.consent}</p>}
          {state.error && !state.fields?.name && !state.fields?.mobile && !state.fields?.consent && (
            <p role="alert" className="text-xs text-rose-600">
              {state.error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={close} className="h-10 rounded-lg border border-slate-200 px-4 font-semibold hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={state.busy} className="h-10 rounded-lg bg-violet-600 px-4 font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
              {state.busy ? "Saving…" : "Add enquiry"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
