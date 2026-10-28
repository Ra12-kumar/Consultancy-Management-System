"use client";

import { useId, type ComponentProps, type ReactNode } from "react";

const inputClass =
  "w-full min-h-11 rounded-xl border bg-surface px-3.5 text-sm text-foreground placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

function Frame({ id, label, hint, error, children, required }: { id: string; label: string; hint?: string; error?: string; children: ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type Common = { label: string; hint?: string; error?: string };
const describedBy = (id: string, hint?: string, error?: string) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

export function TextField({ label, hint, error, className = "", required, ...props }: Common & ComponentProps<"input">) {
  const id = useId();
  return (
    <Frame id={id} label={label} hint={hint} error={error} required={required}>
      <input id={id} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={`${inputClass} ${error ? "border-danger" : "border-line"} ${className}`} {...props} />
    </Frame>
  );
}

export function SelectField({ label, hint, error, className = "", children, required, ...props }: Common & ComponentProps<"select">) {
  const id = useId();
  return (
    <Frame id={id} label={label} hint={hint} error={error} required={required}>
      <select id={id} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={`${inputClass} ${error ? "border-danger" : "border-line"} ${className}`} {...props}>
        {children}
      </select>
    </Frame>
  );
}

export function TextAreaField({ label, hint, error, className = "", required, ...props }: Common & ComponentProps<"textarea">) {
  const id = useId();
  return (
    <Frame id={id} label={label} hint={hint} error={error} required={required}>
      <textarea id={id} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={`${inputClass} min-h-24 py-2.5 ${error ? "border-danger" : "border-line"} ${className}`} {...props} />
    </Frame>
  );
}
