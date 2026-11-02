"use client";

/* eslint-disable @next/next/no-img-element -- small local SVG icons from the client design */
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { apiPost, fieldErrors } from "@/services/api";

const EDUCATION: Array<[string, string]> = [
  ["class_10", "Class 10"],
  ["class_12", "Class 12"],
  ["diploma", "Diploma"],
  ["undergraduate", "Undergraduate degree"],
  ["postgraduate", "Postgraduate degree"],
  ["other", "Other"],
];
const INTERESTS = ["Engineering", "Management", "Medicine", "Arts & science", "Law", "Design", "Not sure yet"];

const field = "h-[50px] w-full rounded-md border border-[#dfe3e5] bg-white px-3.5 text-[13px] text-[#142b41] outline-none focus:border-[#10283f]";
const label = "text-xs font-semibold text-[#142b41]";

// The landing page's callback request: saved by POST /api/leads/callback, which emails the enquiry team.
export default function UdanCallbackForm() {
  const [role, setRole] = useState<"student" | "parent">("student");
  const [state, setState] = useState<{ busy: boolean; done?: boolean; error?: string; fields?: Record<string, string> }>({ busy: false });

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState({ busy: true });
    try {
      await apiPost("/leads/callback", { name: String(f.get("name") ?? ""), mobile: String(f.get("mobile") ?? ""), role, education: String(f.get("education") ?? ""), interest: String(f.get("interest") ?? ""), consent: f.get("consent") === "on" });
      setState({ busy: false, done: true });
    } catch (err) {
      setState({ busy: false, error: (err as { message?: string }).message ?? "Something went wrong. Please try again.", fields: fieldErrors(err) });
    }
  }

  const err = (k: string) =>
    state.fields?.[k] ? (
      <p id={`lead-${k}-error`} className="text-xs text-[#b91c1c]">
        {state.fields[k]}
      </p>
    ) : null;

  return (
    <div className="rounded-[10px] border border-[#dfe3e5] bg-white p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-[family-name:var(--font-udan-serif)] text-2xl text-[#142b41]">Let’s talk about your plans.</h3>
        <img src="/udan/message-circle.svg" alt="" width={24} height={24} />
      </div>
      {state.done ? (
        <div role="status" className="mt-6 rounded-md bg-[#f7f5ef] p-5 text-sm leading-relaxed text-[#142b41]">
          <p className="font-semibold">Thank you, we’ve received your request.</p>
          <p className="mt-1 text-[#5c6974]">A counsellor will call you back. Want to start right away? <Link href="/register" className="font-semibold text-[#142b41] underline">Create a free account</Link> to send a full enquiry.</p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="mt-6 space-y-6">
          <fieldset className="flex flex-wrap items-center gap-2.5">
            <legend className="sr-only">I’m a</legend>
            <span aria-hidden="true" className="text-xs text-[#5c6974]">
              I’m a
            </span>
            {(["student", "parent"] as const).map((r) => (
              <label key={r} className={`flex h-8 cursor-pointer items-center rounded-full px-3.5 text-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#edbf54] ${role === r ? "bg-[#10283f] text-white" : "border border-[#dfe3e5] text-[#5c6974]"}`}>
                <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
                {r === "student" ? "Student" : "Parent / guardian"}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-[18px] sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="lead-name" className={label}>
                Full name *
              </label>
              <input id="lead-name" name="name" required maxLength={80} autoComplete="name" placeholder="Your name" aria-invalid={Boolean(state.fields?.name)} aria-describedby={state.fields?.name ? "lead-name-error" : undefined} className={field} />
              {err("name")}
            </div>
            <div className="space-y-2">
              <label htmlFor="lead-mobile" className={label}>
                Mobile number *
              </label>
              <div className="flex h-[50px] items-center gap-3 rounded-md border border-[#dfe3e5] px-3.5 focus-within:border-[#10283f]">
                <span className="border-r border-[#dfe3e5] pr-2.5 text-[13px] text-[#142b41]">+91</span>
                <input id="lead-mobile" name="mobile" required inputMode="tel" autoComplete="tel-national" maxLength={15} placeholder="10-digit number" aria-invalid={Boolean(state.fields?.mobile)} aria-describedby={state.fields?.mobile ? "lead-mobile-error" : undefined} className="min-w-0 flex-1 bg-transparent text-[13px] text-[#142b41] outline-none" />
              </div>
              {err("mobile")}
            </div>
            <div className="space-y-2">
              <label htmlFor="lead-education" className={label}>
                Current education *
              </label>
              <select id="lead-education" name="education" required defaultValue="" className={field}>
                <option value="" disabled>
                  Select your level
                </option>
                {EDUCATION.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              {err("education")}
            </div>
            <div className="space-y-2">
              <label htmlFor="lead-interest" className={label}>
                Interested in
              </label>
              <select id="lead-interest" name="interest" defaultValue="" className={field}>
                <option value="">Course or not sure yet</option>
                {INTERESTS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="flex items-start gap-3 text-[11px] leading-[1.7] text-[#5c6974]">
              <input type="checkbox" name="consent" required className="mt-0.5 size-4 shrink-0 accent-[#10283f]" />
              <span>
                I agree to be contacted by Udaan about my enquiry and have read the{" "}
                <Link href="/privacy" className="underline">
                  Privacy Policy
                </Link>
                . I can withdraw my consent at any time.
              </span>
            </label>
            {err("consent")}
          </div>
          {state.error && !state.fields?.name && !state.fields?.mobile && (
            <p role="alert" className="text-sm text-[#b91c1c]">
              {state.error}
            </p>
          )}
          <button type="submit" disabled={state.busy} className="inline-flex h-[50px] items-center gap-4 rounded-md bg-[#edbf54] px-[22px] text-sm font-semibold text-[#142b41] hover:bg-[#e5b23d] focus-visible:ring-2 focus-visible:ring-[#10283f] focus-visible:outline-none disabled:opacity-60">
            {state.busy ? "Sending…" : "Request a callback"}
            <img src="/udan/arrow-submit-btn.svg" alt="" width={18} height={18} />
          </button>
          <p className="text-[11px] leading-[1.6] text-[#5c6974]">Your details are for this enquiry. Marketing updates require separate consent.</p>
        </form>
      )}
    </div>
  );
}
