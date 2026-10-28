import type { ReactNode } from "react";

const tones = {
  error: "border-danger/40 bg-danger/10",
  success: "border-success/40 bg-success/10",
  warning: "border-warning/40 bg-warning/10",
  info: "border-line bg-surface-2",
} as const;

export function Alert({ tone = "error", title, children }: { tone?: keyof typeof tones; title?: string; children?: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border p-4 text-sm ${tones[tone]}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1 text-foreground/85" : ""}>{children}</div>}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-foreground/5 text-muted ring-line",
  success: "bg-success/10 text-success ring-success/30",
  warning: "bg-warning/10 text-warning ring-warning/30",
  danger: "bg-danger/10 text-danger ring-danger/30",
  gold: "bg-accent/15 text-accent-text ring-accent/40",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${badgeTones[tone]}`}>{children}</span>;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}…
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6 ${className}`}>{children}</section>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Avatar({ name, size = "md", src }: { name: string; size?: "sm" | "md" | "lg"; src?: string | null }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  const s = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-16 text-xl" }[size];
  // eslint-disable-next-line @next/next/no-img-element -- private photo streamed by the API (not optimisable)
  if (src) return <img src={src} alt="" className={`${s} shrink-0 rounded-full object-cover ring-1 ring-line`} />;
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full bg-accent font-bold text-accent-fg ${s}`}>
      {initials || "?"}
    </span>
  );
}

export function ProgressSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Form progress">
      {steps.map((s, i) => (
        <li key={s} aria-current={i === current ? "step" : undefined} className="flex items-center gap-2 text-sm">
          <span className={`inline-flex size-7 items-center justify-center rounded-full text-xs font-bold ${i < current ? "bg-success text-white" : i === current ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted"}`}>{i < current ? "✓" : i + 1}</span>
          <span className={i === current ? "font-semibold" : "text-muted"}>{s}</span>
          {i < steps.length - 1 && <span aria-hidden="true" className="mx-1 h-px w-6 bg-line" />}
        </li>
      ))}
    </ol>
  );
}
