"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Feedback";
import { useAuth } from "@/features/auth/AuthProvider";
import { COLLEGE_TYPES, FREQUENCIES, fmtDay, formatINR, formatLakh } from "@/lib/format";
import type { CollegeCard as Card, FeeBreakdown as Breakdown } from "@/types/catalog";
import { COMPARE_MAX, compareStore, useCompare, useShortlist } from "./stores";

export const SAMPLE_LABEL = "Sample data – not a real institution";

export function SampleBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2.5 py-0.5 text-xs font-bold text-accent-text ring-1 ring-accent/50 ring-inset">
      <span aria-hidden="true">⚠</span> {SAMPLE_LABEL}
    </span>
  );
}

export function CollegeLogo({ name, logoUrl, size = "md" }: { name: string; logoUrl: string | null; size?: "md" | "lg" }) {
  const [failed, setFailed] = useState(false);
  const s = size === "lg" ? "size-20 text-2xl" : "size-14 text-lg";
  const initials = name
    .replace(/^Sample\s+/i, "")
    .split(/[\s,]+/)
    .filter((w) => /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  if (logoUrl && !failed) {
    // eslint-disable-next-line @next/next/no-img-element -- admin-provided https URLs from any host
    return <img src={logoUrl} alt="" onError={() => setFailed(true)} className={`${s} shrink-0 rounded-xl border border-line bg-white object-contain p-1`} />;
  }
  return (
    <span aria-hidden="true" className={`${s} inline-flex shrink-0 items-center justify-center rounded-xl bg-primary font-bold text-primary-fg`}>
      {initials || "?"}
    </span>
  );
}

export function VerifiedLine({ isSample, lastVerifiedAt }: { isSample: boolean; lastVerifiedAt: string | null }) {
  if (isSample) return <p className="text-xs text-muted">Sample data – details are illustrative and not verified.</p>;
  if (!lastVerifiedAt) return null;
  return <p className="text-xs text-muted">Details last verified {fmtDay(lastVerifiedAt)}</p>;
}

export function ShortlistButton({ collegeId, size = "sm" }: { collegeId: string; size?: "sm" | "md" }) {
  const { status } = useAuth();
  const pathname = usePathname();
  const list = useShortlist();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (status === "signedOut") {
    return (
      <ButtonLink href={`/login?next=${encodeURIComponent(pathname)}`} size={size} variant="secondary">
        ♡ Save
      </ButtonLink>
    );
  }
  if (!list.isStudent) return null;
  const saved = list.has(collegeId);
  return (
    <span className="inline-flex flex-col">
      <Button
        size={size}
        variant="secondary"
        aria-pressed={saved}
        disabled={!list.ready || busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await list.toggle(collegeId);
          } catch (e) {
            setError((e as { message?: string }).message ?? "Could not update your list");
          } finally {
            setBusy(false);
          }
        }}
      >
        {saved ? "♥ Saved" : "♡ Save"}
      </Button>
      {error && (
        <span role="alert" className="mt-1 text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}

export function CompareToggle({ slug, name, size = "sm" }: { slug: string; name: string; size?: "sm" | "md" }) {
  const items = useCompare();
  const [full, setFull] = useState(false);
  const chosen = items.some((i) => i.slug === slug);
  return (
    <span className="inline-flex flex-col">
      <Button size={size} variant={chosen ? "primary" : "secondary"} aria-pressed={chosen} onClick={() => setFull(compareStore.toggle({ slug, name }) === "full")}>
        {chosen ? "✓ Comparing" : "+ Compare"}
      </Button>
      {full && (
        <span role="alert" className="mt-1 text-xs text-danger">
          You can compare up to {COMPARE_MAX} colleges.
        </span>
      )}
    </span>
  );
}

export function CollegeCard({ college }: { college: Card }) {
  const shown = college.courses.slice(0, 4);
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex gap-4">
        <CollegeLogo name={college.name} logoUrl={college.logoUrl} />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-snug">
            <Link href={`/colleges/${college.slug}`} className="hover:underline">
              {college.name}
            </Link>
          </h3>
          <p className="mt-0.5 text-sm text-muted">{[college.city, college.state].filter(Boolean).join(", ") || "Location to be confirmed"}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge>{COLLEGE_TYPES[college.type] ?? college.type}</Badge>
            {college.featured && <Badge tone="gold">Featured</Badge>}
            {college.accreditations.map((a) => (
              <Badge key={a.body} tone="success">
                {a.body}
                {a.grade ? ` ${a.grade}` : ""}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      {college.isSample && (
        <div className="mt-3">
          <SampleBadge />
        </div>
      )}
      {shown.length > 0 && (
        <p className="mt-3 text-sm">
          <span className="text-muted">Courses: </span>
          {shown.map((c) => c.name).join(" · ")}
          {college.courses.length > shown.length && <span className="text-muted"> +{college.courses.length - shown.length} more</span>}
        </p>
      )}
      <p className="mt-3 text-sm">
        {college.feeFromMinor != null ? (
          <>
            <span className="text-muted">Official course fees from </span>
            <strong className="text-base">{formatLakh(college.feeFromMinor)}</strong>
          </>
        ) : (
          <span className="text-muted">Fees not published yet</span>
        )}
      </p>
      <div className="mt-1">
        <VerifiedLine isSample={college.isSample} lastVerifiedAt={college.lastVerifiedAt} />
      </div>
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <ButtonLink href={`/colleges/${college.slug}`} size="sm">
          View details
        </ButtonLink>
        <CompareToggle slug={college.slug} name={college.name} />
        <ShortlistButton collegeId={college.id} />
      </div>
    </article>
  );
}

// The server's fee breakdown. Official college fees, optional fees and the consultancy's own charge are shown
// as separate sections; nothing is added up in the browser.
export function FeeBreakdown({ breakdown, caption }: { breakdown: Breakdown; caption?: string }) {
  const official = breakdown.lines.filter((l) => l.group === "official");
  const optional = breakdown.lines.filter((l) => l.group === "optional");
  const row = (l: Breakdown["lines"][number]) => (
    <tr key={l.key} className="border-t border-line">
      <th scope="row" className="py-2 pr-3 text-left font-normal">
        {l.label}
      </th>
      <td className="py-2 pr-3 text-right tabular-nums">{formatINR(l.amountMinor)}</td>
      <td className="py-2 pr-3 text-muted">
        {FREQUENCIES[l.frequency]}
        {l.occurrences > 1 && ` × ${l.occurrences}`}
      </td>
      <td className="py-2 text-right tabular-nums">{formatINR(l.courseTotalMinor)}</td>
    </tr>
  );
  const total = (label: string, value: number, strong = false, note?: string) => (
    <tr className={`border-t border-line ${strong ? "font-bold" : "font-semibold"}`}>
      <th scope="row" colSpan={3} className="py-2 pr-3 text-left">
        {label}
        {note && <span className="block text-xs font-normal text-muted">{note}</span>}
      </th>
      <td className="py-2 text-right tabular-nums">{value < 0 ? `− ${formatINR(-value)}` : formatINR(value)}</td>
    </tr>
  );
  const section = (title: string) => (
    <tr>
      <th colSpan={4} scope="colgroup" className="pt-4 pb-1 text-left text-xs font-bold tracking-wide text-accent-text uppercase">
        {title}
      </th>
    </tr>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-sm">
        {caption && <caption className="pb-2 text-left text-sm text-muted">{caption}</caption>}
        <thead>
          <tr className="text-xs text-muted">
            <th scope="col" className="pb-1 text-left font-medium">
              Fee
            </th>
            <th scope="col" className="pb-1 text-right font-medium">
              Amount
            </th>
            <th scope="col" className="pb-1 text-left font-medium">
              Charged
            </th>
            <th scope="col" className="pb-1 text-right font-medium">
              Whole course
            </th>
          </tr>
        </thead>
        <tbody>
          {section("Official college fees")}
          {official.map(row)}
          {total("Official college fees (whole course)", breakdown.officialTotalMinor)}
          {breakdown.discountMinor > 0 && total("Discount on tuition", -breakdown.discountMinor, false, breakdown.discountNote || undefined)}
          {section("Consultancy service charge (separate from college fees)")}
          {total("EduPath service charge", breakdown.consultancyServiceChargeMinor)}
          {total("Estimated total (official fees after discount + service charge)", breakdown.estimatedTotalMinor, true)}
          {optional.length > 0 && section("Optional – only if you choose them")}
          {optional.map(row)}
          {optional.length > 0 && total("Optional fees (whole course, if opted)", breakdown.optionalTotalMinor)}
        </tbody>
      </table>
    </div>
  );
}

// A floating tray listing the colleges picked for comparison.
export function CompareTray() {
  const items = useCompare();
  if (items.length === 0) return null;
  const href = `/compare?colleges=${items.map((i) => i.slug).join(",")}`;
  return (
    <aside aria-label="Colleges to compare" className="sticky bottom-3 z-30 mx-auto mt-6 flex max-w-4xl flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3 shadow-2xl">
      <p className="text-sm font-semibold">
        Compare ({items.length}/{COMPARE_MAX}):
      </p>
      <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {items.map((i) => (
          <li key={i.slug} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pr-1 pl-3 text-xs">
            <span className="max-w-48 truncate">{i.name}</span>
            <button type="button" aria-label={`Remove ${i.name} from comparison`} onClick={() => compareStore.remove(i.slug)} className="inline-flex size-6 items-center justify-center rounded-full hover:bg-foreground/10">
              ×
            </button>
          </li>
        ))}
      </ul>
      <span className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={compareStore.clear}>
          Clear
        </Button>
        {items.length >= 2 ? (
          <ButtonLink href={href} size="sm" variant="gold">
            Compare now
          </ButtonLink>
        ) : (
          <span className="self-center text-xs text-muted">Pick at least 2</span>
        )}
      </span>
    </aside>
  );
}
