"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Alert, Badge, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { useAuth } from "@/features/auth/AuthProvider";
import { useApiData } from "@/hooks/useApiData";
import { COLLEGE_TYPES, durationLabel, fmtDay, formatINR } from "@/lib/format";
import { apiGet, apiPost } from "@/services/api";
import type { CompareResult, Course } from "@/types/catalog";
import { CollegeLogo, SampleBadge } from "./CatalogUi";
import { compareStore } from "./stores";

export const parseSlugs = (v: string | null) => [...new Set((v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z0-9-]{2,80}$/.test(s)))].slice(0, 4);

type Col = CompareResult["colleges"][number];

function SaveComparison({ result }: { result: CompareResult }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [name, setName] = useState(result.course ? `${result.course.name} comparison` : "My comparison");
  const [state, setState] = useState<{ status: "idle" | "saving" | "saved" | "error"; message?: string }>({ status: "idle" });
  if (!user) {
    return (
      <p className="text-sm text-muted">
        <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="font-semibold underline">
          Sign in
        </Link>{" "}
        as a student to save this comparison.
      </p>
    );
  }
  if (user.role !== "student") return null;
  async function save(e: FormEvent) {
    e.preventDefault();
    setState({ status: "saving" });
    try {
      await apiPost("/students/me/comparisons", { name: name.trim(), colleges: result.colleges.map((c) => c.id), course: result.course?.id ?? null });
      setState({ status: "saved" });
    } catch (err) {
      setState({ status: "error", message: (err as { message?: string }).message });
    }
  }
  if (state.status === "saved") {
    return (
      <Alert tone="success">
        Saved. Find it under{" "}
        <Link href="/student/comparisons" className="font-semibold underline">
          My comparisons
        </Link>
        .
      </Alert>
    );
  }
  return (
    <form onSubmit={save} className="flex flex-wrap items-end gap-2">
      <label className="text-sm font-medium">
        Comparison name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required className="mt-1 block min-h-11 w-64 max-w-full rounded-xl border border-line bg-surface px-3 text-sm" />
      </label>
      <Button type="submit" disabled={state.status === "saving" || !name.trim()}>
        {state.status === "saving" ? "Saving…" : "Save comparison"}
      </Button>
      {state.status === "error" && (
        <p role="alert" className="w-full text-sm text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}

export function CompareTable({ result }: { result: CompareResult }) {
  const cols = result.colleges;
  const fee = (c: Col) => c.offering?.fees[0]?.breakdown ?? null;
  const rows: Array<[string, (c: Col) => ReactNode]> = [
    ["Location", (c) => [c.city, c.state].filter(Boolean).join(", ") || "—"],
    ["Type", (c) => COLLEGE_TYPES[c.type] ?? c.type],
    ["Accreditation", (c) => (c.accreditations.length ? c.accreditations.map((a) => `${a.body}${a.grade ? ` ${a.grade}` : ""}`).join(", ") : "—")],
    ["Approvals", (c) => (c.approvals.length ? c.approvals.join(", ") : "—")],
  ];
  if (result.course) {
    rows.push(
      ["Course offered", (c) => (c.offering ? `Yes${c.offering.specialization ? ` – ${c.offering.specialization}` : ""}` : "Not offered")],
      ["Duration", (c) => (c.offering ? durationLabel(c.offering.durationMonths) : "—")],
      ["Eligibility", (c) => (c.offering ? c.offering.eligibilityText || (c.offering.minPercentage != null ? `At least ${c.offering.minPercentage}%` : "—") : "—")],
      ["Entrance exams", (c) => (c.offering?.entranceExams.length ? c.offering.entranceExams.join(", ") : "—")],
      ["Application deadline", (c) => (c.offering?.applicationDeadline ? fmtDay(c.offering.applicationDeadline) : "—")],
      ["Fees for", (c) => (c.offering?.fees[0] ? `${c.offering.fees[0].academicYear}${c.offering.fees[0].intake ? ` · ${c.offering.fees[0].intake}` : ""}` : "Not published")],
      ["Official college fees (whole course)", (c) => formatINR(fee(c)?.officialTotalMinor)],
      ["Discount", (c) => (fee(c)?.discountMinor ? `− ${formatINR(fee(c)!.discountMinor)}` : "—")],
      ["EduPath service charge (separate)", (c) => formatINR(fee(c)?.consultancyServiceChargeMinor)],
      ["Estimated total", (c) => <strong>{formatINR(fee(c)?.estimatedTotalMinor)}</strong>],
      ["Optional hostel / transport (if opted)", (c) => (fee(c)?.optionalTotalMinor ? formatINR(fee(c)!.optionalTotalMinor) : "—")],
    );
  } else {
    rows.push(
      ["Courses", (c) => c.courses.map((x) => x.name).join(", ") || "—"],
      ["Official fees (whole course)", (c) => (c.feeFromMinor != null ? (c.feeFromMinor === c.feeToMinor ? formatINR(c.feeFromMinor) : `${formatINR(c.feeFromMinor)} – ${formatINR(c.feeToMinor)}`) : "Not published")],
    );
  }
  rows.push(["Details verified", (c) => (c.isSample ? "Sample – not verified" : fmtDay(c.lastVerifiedAt))]);

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[40rem] text-sm">
        <caption className="sr-only">Side-by-side comparison{result.course ? ` for ${result.course.name}` : ""}</caption>
        <thead>
          <tr>
            <td className="w-48 p-4" />
            {cols.map((c) => (
              <th key={c.id} scope="col" className="p-4 text-left align-top">
                <div className="flex items-start gap-3">
                  <CollegeLogo name={c.name} logoUrl={c.logoUrl} />
                  <div>
                    <Link href={`/colleges/${c.slug}`} className="font-semibold hover:underline">
                      {c.name}
                    </Link>
                    {c.isSample && (
                      <div className="mt-1">
                        <SampleBadge />
                      </div>
                    )}
                  </div>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, cell]) => (
            <tr key={label} className="border-t border-line">
              <th scope="row" className="bg-surface-2/60 p-4 text-left font-medium">
                {label}
              </th>
              {cols.map((c) => (
                <td key={c.id} className="p-4 align-top">
                  {cell(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CompareView() {
  const params = useSearchParams();
  const router = useRouter();
  const slugs = parseSlugs(params.get("colleges"));
  const course = /^[a-z0-9-]+$/.test(params.get("course") ?? "") ? params.get("course")! : "";
  const key = `${slugs.join(",")}|${course}`;
  const courses = useApiData((signal) => apiGet<Course[]>("/courses", { signal }), []);
  const result = useApiData(
    (signal) => (slugs.length < 2 ? Promise.resolve(null) : apiGet<CompareResult>(`/colleges/compare?colleges=${slugs.join(",")}${course ? `&course=${course}` : ""}`, { signal })),
    [key],
  );
  const offered = new Set(result.data?.colleges.flatMap((c) => c.courses.map((x) => x.slug)) ?? []);

  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <p className="text-sm font-semibold tracking-widest text-accent-text uppercase">Compare</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Compare colleges</h1>
      <p className="mt-2 max-w-2xl text-muted">Official college fees and our service charge are shown on separate lines. All totals are calculated by our system from the published fee details.</p>

      {slugs.length < 2 ? (
        <div className="mt-8">
          <EmptyState title="Choose at least two colleges">
            Use “+ Compare” on the{" "}
            <Link href="/colleges" className="font-semibold underline">
              college directory
            </Link>{" "}
            to pick up to four colleges.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <label className="text-sm font-medium">
              Compare for course
              <select
                value={course}
                onChange={(e) => router.replace(`/compare?colleges=${slugs.join(",")}${e.target.value ? `&course=${e.target.value}` : ""}`, { scroll: false })}
                className="mt-1 block min-h-11 w-72 max-w-full rounded-xl border border-line bg-surface px-3 text-sm"
              >
                <option value="">Overview (all courses)</option>
                {courses.data
                  ?.filter((c) => offered.has(c.slug) || c.slug === course)
                  .map((c) => (
                    <option key={c.id} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            {result.data && <SaveComparison key={key} result={result.data} />}
          </div>
          <div className="mt-4">
            {result.status === "error" ? (
              <Alert title="Could not compare these colleges">
                {result.error?.message}{" "}
                <Link href="/colleges" className="font-semibold underline">
                  Choose again
                </Link>
              </Alert>
            ) : !result.data ? (
              <Skeleton className="h-96" />
            ) : (
              <div className="space-y-3">
                {result.data.missing.length > 0 && (
                  <Alert tone="warning">
                    {result.data.missing.length} college{result.data.missing.length > 1 ? "s are" : " is"} no longer available and {result.data.missing.length > 1 ? "were" : "was"} left out.
                  </Alert>
                )}
                {result.data.colleges.some((c) => c.isSample) && <Badge tone="warning">Includes sample data – not real institutions</Badge>}
                <CompareTable result={result.data} />
                <div className="flex gap-2">
                  <ButtonLink href="/colleges" variant="secondary" size="sm">
                    Add or change colleges
                  </ButtonLink>
                  <Button size="sm" variant="ghost" onClick={compareStore.clear}>
                    Clear compare tray
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
