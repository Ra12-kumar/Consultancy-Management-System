"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Alert, Skeleton } from "@/components/ui/Feedback";
import { homeFor, useAuth } from "@/features/auth/AuthProvider";
import { useApiData } from "@/hooks/useApiData";
import { apiGet } from "@/services/api";
import type { EnquiryStatus } from "@/types/enquiry";
import { Icon, type IconName } from "./icons";

// Admin workspace frame from the client design ("Udaan admin dashboard"): a light side panel with grouped
// sections and live counts, and a top bar with the page trail, a jump-to search, new-enquiry bell and the
// account menu. It only decides what is SHOWN; the backend checks the session, role and permission on
// every request.

export type WorkspaceItem = { href: string; label: string; icon: IconName; permission?: string; permissions?: string[]; badge?: "students" | "newEnquiries" };
export type WorkspaceGroup = { title: string; items: WorkspaceItem[] };
type Counts = { students: number; newEnquiries: number };
type SummaryCounts = { totals?: { students: number }; students: { total: number }; charts: { byStatus: Array<{ status: EnquiryStatus; count: number }> } };

const BASE = "/admin";
const hideSiteChrome = `body:has(#admin-workspace) > header, body:has(#admin-workspace) > footer, body:has(#admin-workspace) > [aria-label="Announcements"] { display: none; }`;

function Brand() {
  return (
    <Link href={BASE} className="flex items-center gap-2.5 rounded-lg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none" aria-label="Udaan admin dashboard">
      <span aria-hidden="true" className="inline-flex size-9 items-center justify-center rounded-xl bg-navy text-gold ring-1 ring-gold/40">
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
          <path d="M12 3 1 9l11 6 9-4.9V17h2V9L12 3Zm-6 9.6V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.4l-6 3.3-6-3.3Z" />
        </svg>
      </span>
      <span className="leading-tight">
        <span className="block text-[17px] font-semibold">Udaan</span>
      </span>
    </Link>
  );
}

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "A";

export default function AdminWorkspaceShell({ groups, children }: { groups: WorkspaceGroup[]; children: ReactNode }) {
  const { status, user, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [jump, setJump] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const canCount = user?.role === "admin" && user.permissions.includes("students.read");
  const summary = useApiData((signal) => (canCount ? apiGet<SummaryCounts>("/admin/dashboard/summary", { signal }) : Promise.resolve(null)), [canCount, pathname === BASE]);
  const counts: Counts | null = summary.data
    ? { students: summary.data.totals?.students ?? summary.data.students?.total ?? 0, newEnquiries: (summary.data.charts?.byStatus ?? []).filter((s) => s.status === "NEW").reduce((n, s) => n + s.count, 0) }
    : null;

  useEffect(() => {
    if (status === "signedOut") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);
  // Ctrl/⌘ + K jumps to the workspace search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // The phone menu closes after moving to another page.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- close the drawer on navigation
  useEffect(() => setMenuOpen(false), [pathname]);

  if (status !== "signedIn" || !user) {
    return (
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-6 h-64" />
      </main>
    );
  }
  if (user.role !== "admin") {
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

  const allowed = (i: WorkspaceItem) => (!i.permission || user.permissions.includes(i.permission)) && (!i.permissions || i.permissions.some((p) => user.permissions.includes(p)));
  const visible = groups.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter((g) => g.items.length > 0);
  const flat = visible.flatMap((g) => g.items);
  const isActive = (href: string) => (href === BASE ? pathname === BASE : pathname === href || pathname.startsWith(`${href}/`));
  const current = flat.find((i) => isActive(i.href));
  const goTo = (e: FormEvent) => {
    e.preventDefault();
    const text = jump.trim().toLowerCase();
    const hit = text && flat.find((i) => i.label.toLowerCase() === text) ? flat.find((i) => i.label.toLowerCase() === text) : flat.find((i) => text && i.label.toLowerCase().includes(text));
    if (hit) {
      setJump("");
      router.push(hit.href);
    }
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-5 pb-4">
        <Brand />
      </div>
      <nav aria-label="Admin sections" className="flex-1 overflow-y-auto px-3 pb-4">
        {visible.map((g) => (
          <div key={g.title} className="mt-3 first:mt-0">
            <p className="px-2 pb-1.5 text-[10px] font-semibold tracking-[1.5px] text-muted uppercase">{g.title}</p>
            <ul className="space-y-0.5">
              {g.items.map((i) => {
                const active = isActive(i.href);
                const badge = i.badge && counts ? counts[i.badge] : 0;
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${active ? "bg-sky-50 font-semibold text-navy dark:bg-white/10 dark:text-white" : "text-muted hover:bg-surface-2 hover:text-foreground"}`}
                    >
                      <Icon name={i.icon} className={active ? "text-navy dark:text-white" : ""} />
                      <span className="flex-1">{i.label}</span>
                      {badge > 0 && (
                        <span className="inline-flex min-w-5 items-center justify-center rounded-md bg-navy px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-gold dark:text-navy">
                          {badge}
                          <span className="sr-only">{i.badge === "students" ? " students" : " new enquiries"}</span>
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="flex items-center gap-3 border-t border-line px-5 py-4">
        <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold">
          {initial(user.name)}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-semibold">{user.name}</span>
          <span className="block text-[11px] text-muted">Administrator</span>
        </span>
        <button type="button" onClick={() => void signOut()} aria-label="Sign out" className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground">
          <Icon name="logout" />
        </button>
      </div>
    </div>
  );

  return (
    <div id="admin-workspace" className="flex min-h-screen w-full flex-1 bg-background text-foreground">
      <style>{hideSiteChrome}</style>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line bg-surface lg:block">{sidebar}</aside>
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-black/40" />
          <aside className="relative h-full w-72 max-w-[85vw] bg-surface shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-surface-2 lg:hidden">
            <Icon name="menu" />
          </button>
          <nav aria-label="Breadcrumb" className="hidden min-w-0 text-xs text-muted sm:block">
            <ol className="flex items-center gap-2">
              <li>
                <Link href={BASE} className="hover:underline">
                  Admin workspace
                </Link>
              </li>
              <li aria-hidden="true">›</li>
              <li aria-current="page" className="truncate font-semibold text-foreground">
                {current?.label ?? "Dashboard"}
              </li>
            </ol>
          </nav>
          <form role="search" aria-label="Search your workspace" onSubmit={goTo} className="ml-auto hidden md:block">
            <label className="relative block">
              <span className="sr-only">Jump to a page</span>
              <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <input
                ref={search}
                list="admin-workspace-pages"
                value={jump}
                onChange={(e) => setJump(e.target.value)}
                placeholder="Search your workspace"
                className="h-9 w-64 rounded-lg border border-line bg-background pr-12 pl-9 text-xs focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none lg:w-72"
              />
              <kbd aria-hidden="true" className="absolute top-1/2 right-2.5 -translate-y-1/2 text-[10px] text-muted">
                Ctrl K
              </kbd>
            </label>
            <datalist id="admin-workspace-pages">
              {flat.map((i) => (
                <option key={i.href} value={i.label} />
              ))}
            </datalist>
          </form>
          <div className="ml-auto flex items-center gap-1 md:ml-2">
            <Link href="/faq" aria-label="Help and FAQs" className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground">
              <Icon name="help" />
            </Link>
            {user.permissions.includes("enquiries.manage") && (
              <Link href="/admin/enquiries?quick=new" aria-label={`New enquiries${counts?.newEnquiries ? ` (${counts.newEnquiries})` : ""}`} className="relative inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground">
                <Icon name="bell" />
                {counts && counts.newEnquiries > 0 && <span aria-hidden="true" className="absolute top-2 right-2 size-2 rounded-full bg-gold ring-2 ring-surface" />}
              </Link>
            )}
            <details className="relative ml-1">
              <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-xs font-semibold hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="inline-flex size-7 items-center justify-center rounded-full bg-surface-2">
                  {initial(user.name)}
                </span>
                <span className="hidden sm:inline">Admin</span>
                <Icon name="chevronDown" size={14} />
                <span className="sr-only">Account menu for {user.name}</span>
              </summary>
              <div className="absolute right-0 z-40 mt-2 w-48 rounded-xl border border-line bg-surface p-1.5 text-sm shadow-lg">
                <p className="truncate px-3 py-2 text-xs text-muted">{user.email}</p>
                <Link href="/admin/settings" className="block rounded-lg px-3 py-2 hover:bg-surface-2">
                  Account settings
                </Link>
                <button type="button" onClick={() => void signOut()} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-surface-2">
                  Sign out
                </button>
              </div>
            </details>
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
