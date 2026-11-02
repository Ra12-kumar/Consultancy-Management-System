// Display helpers for the catalogue. Amounts arrive as integer paise and are only formatted here, never totalled.

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const formatINR = (minor: number | null | undefined, exact = false) => (minor == null ? "—" : (exact ? inrExact : inr).format(minor / 100));

// "₹6.4 lakh" style for compact cards.
export function formatLakh(minor: number | null | undefined) {
  if (minor == null) return "—";
  const rupees = minor / 100;
  if (rupees >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(2).replace(/\.?0+$/, "")} crore`;
  if (rupees >= 1_00_000) return `₹${(rupees / 1_00_000).toFixed(2).replace(/\.?0+$/, "")} lakh`;
  return inr.format(rupees);
}

// Rupees typed in a form -> integer paise (null when empty or invalid).
export function rupeesToPaise(value: string): number | null {
  const v = value.replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
}
export const paiseToRupees = (minor: number | null | undefined) => (minor == null ? "" : String(minor / 100));

export const fmtDay = (d: string | null | undefined) => (d ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(d)) : "—");

export const COLLEGE_TYPES: Record<string, string> = { government: "Government", private: "Private", deemed: "Deemed university", autonomous: "Autonomous", other: "Other" };
export const OWNERSHIP: Record<string, string> = { government: "Government", government_aided: "Government-aided", private: "Private", other: "Other" };
export const CATEGORIES: Record<string, string> = { university: "University", college: "College", standalone: "Standalone institution" };
export const COURSE_LEVELS: Record<string, string> = { diploma: "Diploma", ug: "Undergraduate", pg: "Postgraduate", pg_diploma: "PG diploma", doctorate: "Doctorate" };
export const FREQUENCIES: Record<string, string> = { one_time: "One time", per_year: "Per year", per_semester: "Per semester", total_course: "Whole course" };

export function durationLabel(months: number) {
  if (months % 12 === 0) return `${months / 12} year${months === 12 ? "" : "s"}`;
  return `${months} months`;
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
