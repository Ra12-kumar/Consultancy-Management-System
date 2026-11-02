"use client";

import { useState } from "react";
import { waHref } from "@/lib/whatsapp";

// A tel: link (dials on phones and on computers with a calling app), a WhatsApp chat link (opens a
// conversation, not a call) and a copy button.
export const telHref = (mobile: string) => `tel:${mobile.replace(/[^\d+]/g, "")}`;

export default function PhoneActions({ mobile, compact = false }: { mobile: string | null; compact?: boolean }) {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  if (!mobile) return <span className="text-muted">No phone number</span>;
  async function copy() {
    try {
      await navigator.clipboard.writeText(mobile!);
      setCopied("yes");
    } catch {
      setCopied("no");
    }
    setTimeout(() => setCopied(null), 2000);
  }
  const btn = "inline-flex min-h-9 items-center gap-1 rounded-lg border border-line px-2.5 text-xs font-semibold hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {!compact && <span className="font-mono">{mobile}</span>}
      <a href={telHref(mobile)} className={btn} aria-label={`Call ${mobile}`}>
        <span aria-hidden="true">📞</span> Call
      </a>
      {waHref(mobile) && (
        <a href={waHref(mobile)!} target="_blank" rel="noopener noreferrer" className={btn} aria-label={`Chat on WhatsApp with ${mobile}`}>
          WhatsApp
        </a>
      )}
      <button type="button" onClick={copy} className={btn} aria-label={`Copy ${mobile}`}>
        {copied === "yes" ? "Copied" : copied === "no" ? "Copy failed" : "Copy"}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied === "yes" ? "Phone number copied" : ""}
      </span>
    </span>
  );
}
