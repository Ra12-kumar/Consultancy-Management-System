"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Feedback";
import { useAuth } from "@/features/auth/AuthProvider";
import { CATEGORIES, COLLEGE_TYPES, FREQUENCIES, OWNERSHIP, fmtDay, formatINR, formatLakh } from "@/lib/format";
import { safeHref } from "@/lib/safeUrl";
import type { CollegeCard as Card, FeeBreakdown as Breakdown } from "@/types/catalog";
import type { LeadSource } from "@/types/enquiry";
import { COMPARE_MAX, compareStore, useCompare, useShortlist } from "./stores";

export const SAMPLE_LABEL = "Sample data – not a real institution";
export const BASIC_LABEL = "Basic listing – courses and fees not yet verified";

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

// The fee line of a card: the verified fee on the searched basis, or an honest "not verified" (never ₹0).
export function CardFeeLine({ college }: { college: Card }) {
  const fee = college.fee;
  if (!fee) {
    return college.feeFromMinor != null ? (
      <>
        <span className="text-muted">Official course fees from </span>
        <strong className="text-base">{formatLakh(college.feeFromMinor)}</strong>
      </>
    ) : (
      <span className="text-muted">Fee not verified</span>
    );
  }
  if (fee.status === "verified" && fee.amountMinor != null) {
    return (
      <>
        <span className="text-muted">Official fees from </span>
        <strong className="text-base">{formatLakh(fee.amountMinor)}</strong>
        <span className="text-muted">
          {fee.basis === "annual" ? " a year" : " for the whole course"}
          {fee.academicYear && ` (${fee.academicYear})`}
        </span>
      </>
    );
  }
  if (fee.status === "not_comparable") return <span className="text-muted">No yearly fee to compare – charged as a whole-course or one-time amount</span>;
  return <span className="text-muted">Fee not verified</span>;
}

// The college's own photo (added by an admin), or a neutral placeholder. Never another college's image.
// Photos uploaded through the admin gallery are served by our own API.
export const ownImage = (url: string | null | undefined) => (url && /^\/api\/colleges\/images\/[a-f0-9]{24}$/.test(url) ? url : null);

export function CollegeCover({ name, coverUrl, className = "" }: { name: string; coverUrl: string | null | undefined; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = ownImage(coverUrl) ?? safeHref(coverUrl, { httpsOnly: true });
  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element -- our own uploaded photos or admin-provided https URLs
    return <img src={src} alt={`Campus of ${name}`} loading="lazy" decoding="async" onError={() => setFailed(true)} className={`h-full w-full object-cover ${className}`} />;
  }
  return (
    <div className={`flex h-full w-full items-end justify-end bg-gradient-to-br from-primary to-primary/70 p-3 ${className}`}>
      <svg aria-hidden="true" viewBox="0 0 64 40" className="absolute inset-0 m-auto h-1/2 w-1/2 text-primary-fg/25" fill="currentColor">
        <path d="M32 2 4 14v4h56v-4L32 2Zm-22 18v14h6V20h-6Zm10 0v14h6V20h-6Zm12 0v14h6V20h-6Zm10 0v14h6V20h-6ZM4 36v4h56v-4H4Z" />
      </svg>
      <span className="relative text-xs font-medium text-primary-fg/80">Photo not available</span>
    </div>
  );
}

// Outbound link to the college's official website, only when the URL is a safe absolute http(s) address.
export function WebsiteLink({ url, name, size = "sm" }: { url: string | null | undefined; name: string; size?: "sm" | "md" }) {
  const href = safeHref(url);
  if (!href) return <span className="inline-flex min-h-9 items-center text-xs text-muted">Official website not available</span>;
  const pad = size === "md" ? "min-h-11 px-4 text-sm" : "min-h-9 px-3 text-sm";
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={`inline-flex items-center gap-1 rounded-xl border border-line font-semibold hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${pad}`}>
      Visit Official Website <span aria-hidden="true">↗</span>
      <span className="sr-only">for {name} (opens in a new tab)</span>
    </a>
  );
}

export function enquiryHref(slug: string, courseSlug?: string | null, source: LeadSource = "college_search") {
  return `/enquire?college=${encodeURIComponent(slug)}${courseSlug ? `&course=${encodeURIComponent(courseSlug)}` : ""}&source=${source}`;
}

const isPast = (d: Date) => d.getTime() < Date.now();

// Admission session and deadline, when an admin has entered them.
export function AdmissionLine({ session, deadline }: { session?: string; deadline?: string | null }) {
  if (!session && !deadline) return null;
  const date = deadline ? new Date(deadline) : null;
  const passed = date ? isPast(date) : false;
  return (
    <p className="mt-1 text-xs text-muted">
      {session && <>Session {session}</>}
      {session && date && " · "}
      {date && (
        <span className={passed ? "" : "font-semibold text-foreground"}>
          {passed ? "Applications closed " : "Apply by "}
          {date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
        </span>
      )}
    </p>
  );
}

export function CollegeCard({ college, course, source = "college_search" }: { college: Card; course?: string; source?: LeadSource }) {
  const shown = college.courses.slice(0, 4);
  const basic = college.listingLevel === "basic";
  const place = [college.city || college.district, college.state].filter(Boolean).join(", ");
  // Prefill the enquiry with the searched course when this college offers it.
  const enquiryCourse = course && college.courses.some((c) => c.slug === course) ? course : null;
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-[16/9] overflow-hidden bg-surface-2">
        <CollegeCover name={college.name} coverUrl={college.imageUrl ?? college.coverUrl} />
        {college.featured && (
          <span className="absolute top-3 left-3 rounded-full bg-white/95 px-2.5 py-0.5 text-xs font-bold text-primary shadow">Featured</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5 pt-0">
        <div className="relative z-10 -mt-7 flex items-end gap-3">
          <span className="rounded-xl bg-surface p-0.5 shadow-sm">
            <CollegeLogo name={college.name} logoUrl={college.logoUrl} />
          </span>
        </div>
        <h3 className="mt-3 font-semibold leading-snug">
          <Link href={`/colleges/${college.slug}`} className="hover:underline">
            {college.name}
          </Link>
        </h3>
        <p className="mt-0.5 text-sm text-muted">
          {place || "Location to be confirmed"}
          {college.aisheCode && <span className="whitespace-nowrap"> · AISHE {college.aisheCode}</span>}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {college.category && <Badge>{CATEGORIES[college.category] ?? college.category}</Badge>}
          {college.ownership ? <Badge>{OWNERSHIP[college.ownership] ?? college.ownership}</Badge> : <Badge>{COLLEGE_TYPES[college.type] ?? college.type}</Badge>}
          {college.stale && <Badge tone="warning">May be out of date</Badge>}
          {college.accreditations.map((a) => (
            <Badge key={a.body} tone="success">
              {a.body}
              {a.grade ? ` ${a.grade}` : ""}
            </Badge>
          ))}
        </div>
        {college.isSample && (
          <div className="mt-3">
            <SampleBadge />
          </div>
        )}
        {basic && !college.isSample && (
          <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
            {BASIC_LABEL}
            {college.source?.name && `. Listed from ${college.source.name}.`}
          </p>
        )}
        {shown.length > 0 && (
          <p className="mt-3 text-sm">
            <span className="text-muted">Courses: </span>
            {shown.map((c) => c.name).join(" · ")}
            {college.courses.length > shown.length && <span className="text-muted"> +{college.courses.length - shown.length} more</span>}
          </p>
        )}
        <p className="mt-3 text-sm">
          <CardFeeLine college={college} />
        </p>
        <AdmissionLine session={college.academicSession} deadline={college.admissionDeadline} />
        <div className="mt-1">
          <VerifiedLine isSample={college.isSample} lastVerifiedAt={college.lastVerifiedAt} />
        </div>
        <div className="mt-auto pt-4">
          <div className="grid grid-cols-2 gap-2">
            <ButtonLink href={`/colleges/${college.slug}`} size="sm" variant="secondary">
              View details
            </ButtonLink>
            <ButtonLink href={enquiryHref(college.slug, enquiryCourse, source)} size="sm" variant="gold" className="text-center leading-tight">
              Enquire Now
            </ButtonLink>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <WebsiteLink url={college.website} name={college.name} />
            <CompareToggle slug={college.slug} name={college.name} />
            <ShortlistButton collegeId={college.id} />
          </div>
        </div>
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
          {total("Udaan service charge", breakdown.consultancyServiceChargeMinor)}
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
