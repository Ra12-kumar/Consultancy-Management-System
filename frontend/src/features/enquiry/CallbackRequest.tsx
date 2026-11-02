"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { apiPost, fieldErrors } from "@/services/api";
import type { CallbackRequest as Request, CallbackTime, StudentEnquiry } from "@/types/enquiry";
import { CALLBACK_TIME_LABELS, MODE_LABELS } from "./shared";

const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

// The student asks their counsellor for a phone call or a counselling session on one of their open enquiries.
export default function CallbackRequest({ reference, current, onDone }: { reference: string; current: Request | null; onDone: (e: StudentEnquiry) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ kind: "callback" as Request["kind"], preferredDate: "", slot: "any" as CallbackTime, mode: "phone" as Request["mode"], note: "" });
  const [state, setState] = useState<{ busy: boolean; error?: string; ok?: string }>({ busy: false });
  const pending = current && !current.handledAt;

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setState({ busy: true });
    try {
      const e = await apiPost<StudentEnquiry>(`/enquiries/${reference}/callback-request`, {
        kind: f.kind,
        preferredDate: f.preferredDate ? `${f.preferredDate}T10:00:00+05:30` : null,
        slot: f.slot,
        mode: f.kind === "callback" ? "phone" : f.mode,
        note: f.note.trim(),
      });
      setOpen(false);
      setState({ busy: false, ok: "Request sent. Your counsellor will get back to you." });
      onDone(e);
    } catch (err) {
      setState({ busy: false, error: Object.values(fieldErrors(err)).join(" ") || (err as { message?: string }).message });
    }
  }

  return (
    <div className="space-y-3">
      {pending && (
        <Alert tone="info" title={current.kind === "callback" ? "Call requested" : "Counselling session requested"}>
          {current.preferredDate ? new Date(current.preferredDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "As soon as possible"}, {CALLBACK_TIME_LABELS[current.slot].toLowerCase()}. We will contact you soon.
        </Alert>
      )}
      {state.ok && !pending && <Alert tone="success">{state.ok}</Alert>}
      {!open ? (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          {pending ? "Change my request" : "Request a callback or session"}
        </Button>
      ) : (
        <form onSubmit={submit} className="space-y-3" noValidate>
          <SelectField label="What would you like?" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Request["kind"] })}>
            <option value="callback">A phone call</option>
            <option value="counselling">A counselling session</option>
          </SelectField>
          {f.kind === "counselling" && (
            <SelectField label="Session type" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as Request["mode"] })}>
              {(Object.keys(MODE_LABELS) as Array<keyof typeof MODE_LABELS>).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABELS[m]}
                </option>
              ))}
            </SelectField>
          )}
          <TextField label="Preferred date (optional)" type="date" min={today()} value={f.preferredDate} onChange={(e) => setF({ ...f, preferredDate: e.target.value })} />
          <SelectField label="Preferred time" value={f.slot} onChange={(e) => setF({ ...f, slot: e.target.value as CallbackTime })}>
            {(Object.keys(CALLBACK_TIME_LABELS) as CallbackTime[]).map((t) => (
              <option key={t} value={t}>
                {CALLBACK_TIME_LABELS[t]}
              </option>
            ))}
          </SelectField>
          <TextAreaField label="Anything we should know? (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={500} />
          {state.error && <Alert>{state.error}</Alert>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={state.busy}>
              {state.busy ? "Sending…" : "Send request"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
