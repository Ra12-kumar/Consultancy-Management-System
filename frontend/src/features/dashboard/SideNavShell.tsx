"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Alert, Skeleton } from "@/components/ui/Feedback";
import type { NavItem } from "@/components/DashboardShell";
import { homeFor, useAuth } from "@/features/auth/AuthProvider";
import type { Role } from "@/types/api";

// Staff area frame from the client design: a navy side panel with the brand and the sections this account may
// open (a scrolling top bar on phones). Like DashboardShell it only decides what is SHOWN; the backend checks
// the session, role and permission on every request.
export default function SideNavShell({ role, brand, nav, children }: { role: Role; brand: string; nav: NavItem[]; children: ReactNode }) {
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
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface lg:flex lg:min-h-[36rem]">
        <aside className="bg-navy px-4 py-4 text-white lg:w-60 lg:shrink-0 lg:px-5 lg:py-7">
          <p className="text-lg font-bold">{brand}</p>
          <p className="truncate text-xs text-white/70">{user.name}</p>
          <nav aria-label={`${brand} sections`} className="-mx-4 mt-3 overflow-x-auto px-4 lg:mx-0 lg:mt-6 lg:px-0">
            <ul className="flex gap-1 lg:flex-col">
              {items.map((i) => {
                const active = i.href === base ? pathname === base : pathname.startsWith(i.href);
                return (
                  <li key={i.href}>
                    <Link href={i.href} aria-current={active ? "page" : undefined} className={`flex min-h-10 items-center rounded-lg px-3 text-[15px] whitespace-nowrap focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none ${active ? "bg-white/15 font-semibold text-white" : "text-slate-400 hover:bg-white/10 hover:text-white"}`}>
                      {i.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
        <main id="main" className="min-w-0 flex-1 bg-background p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
