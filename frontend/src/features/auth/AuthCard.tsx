import type { ReactNode } from "react";

// Shared frame for sign-in, registration and password pages.
export default function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main id="main" className="relative flex flex-1 items-start justify-center overflow-hidden px-4 py-12 sm:py-16">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-navy to-transparent opacity-95" />
      <div className="relative w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-xl sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 border-t border-line pt-4 text-sm text-muted">{footer}</div>}
      </div>
    </main>
  );
}
