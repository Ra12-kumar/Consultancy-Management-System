"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Alert, Skeleton } from "@/components/ui/Feedback";
import { homeFor, useAuth } from "@/features/auth/AuthProvider";
import type { Role } from "@/types/api";

// permission: required; permissions: any one of them is enough.
export type NavItem = { href: string; label: string; permission?: string; permissions?: string[] };

// Student and admin area frame: role-aware side navigation. It only decides what is SHOWN; the backend
// checks the session, role and permission on every request.
export default function DashboardShell({ role, title, nav, children }: { role: Role; title: string; nav: NavItem[]; children: ReactNode }) {
  const { status, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status === "signedOut") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status !== "signedIn" || !user) {
    return (
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-6 h-64" />
      </main>
    );
  }
  if (user.role !== role) {
    return (
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <Alert title="This area is not available for your account">
          <Link href={homeFor(user)} className="font-semibold underline">
            Go to your dashboard
          </Link>
        </Alert>
      </main>
    );
  }
  const items = nav.filter((i) => (!i.permission || user.permissions.includes(i.permission)) && (!i.permissions || i.permissions.some((p) => user.permissions.includes(p))));
  const base = nav[0]!.href;

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:flex lg:gap-8 lg:py-8">
      <aside className="lg:w-60 lg:shrink-0">
        <p className="text-xs font-semibold tracking-widest text-accent-text uppercase">{title}</p>
        <nav aria-label={`${title} sections`} className="-mx-4 mt-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <ul className="flex gap-1 lg:flex-col">
            {items.map((i) => {
              const active = i.href === base ? pathname === base : pathname.startsWith(i.href);
              return (
                <li key={i.href}>
                  <Link href={i.href} aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center rounded-xl px-3 text-sm font-medium whitespace-nowrap ${active ? "bg-primary text-primary-fg" : "hover:bg-surface-2"}`}>
                    {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
      <main id="main" className="mt-6 min-w-0 flex-1 lg:mt-0">
        {children}
      </main>
    </div>
  );
}
