"use client";

import Link from "next/link";
import { useState } from "react";

// Small single-series charts for the dashboard. One hue (the primary token), values and labels in text colours,
// a hover/focus tooltip on every bar, and the same numbers as a table for screen readers.

export type BarRow = { label: string; value: number; href?: string };

// Horizontal bars for categories (status, colleges, sources): label, bar and value on one row.
export function BarList({ title, rows, empty = "No data yet." }: { title: string; rows: BarRow[]; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure>
      <figcaption className="font-semibold">{title}</figcaption>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-2 text-sm" title={`${r.label}: ${r.value}`}>
              <span className="truncate">{r.href ? <Link href={r.href} className="hover:underline">{r.label}</Link> : r.label}</span>
              <span className="h-3 rounded-r bg-surface-2" aria-hidden="true">
                <span className="block h-full rounded-r bg-primary" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
              </span>
              <span className="text-right font-semibold tabular-nums">{r.value}</span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

// Columns per day (oldest to newest) with a hover/focus tooltip and a table for screen readers.
export function DailyColumns({ title, days }: { title: string; days: Array<{ date: string; count: number }> }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((t, d) => t + d.count, 0);
  const W = 600;
  const H = 140;
  const slot = W / Math.max(1, days.length);
  const bar = Math.max(4, slot - 2); // 2px gap between bars
  const label = (d: string) => new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const shown = hover != null ? days[hover] : null;
  return (
    <figure>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{title}</span>
        <span className="text-sm text-muted" aria-live="polite">
          {shown ? `${label(shown.date)}: ${shown.count} enquir${shown.count === 1 ? "y" : "ies"}` : `${total} in ${days.length} days`}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="mt-3 h-40 w-full" role="img" aria-label={`${title}: ${total} in total`} onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={W} y1={H} y2={H} className="stroke-line" strokeWidth="1" />
        {days.map((d, i) => {
          const h = d.count ? Math.max(3, (d.count / max) * (H - 8)) : 0;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${label(d.date)}: ${d.count}`}>
              {/* A tall invisible target, bigger than the bar. */}
              <rect x={i * slot} y="0" width={slot} height={H} fill="transparent" />
              {h > 0 && <rect x={i * slot + 1} y={H - h} width={bar} height={h} rx="2" className={hover === i ? "fill-accent" : "fill-primary"} />}
              <title>{`${label(d.date)}: ${d.count}`}</title>
            </g>
          );
        })}
        {days.length > 0 && (
          <>
            <text x="0" y={H + 14} className="fill-muted text-[11px]">{label(days[0]!.date)}</text>
            <text x={W} y={H + 14} textAnchor="end" className="fill-muted text-[11px]">{label(days.at(-1)!.date)}</text>
          </>
        )}
      </svg>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Enquiries</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <td>{label(d.date)}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
