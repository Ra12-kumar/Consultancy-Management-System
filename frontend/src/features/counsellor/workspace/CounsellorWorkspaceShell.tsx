"use client";

/* eslint-disable @next/next/no-img-element -- local logo and the counsellor's own photo */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Alert, Skeleton } from "@/components/ui/Feedback";
import { Icon, type IconName } from "@/features/admin/workspace/icons";
import { homeFor, useAuth } from "@/features/auth/AuthProvider";
import { useApiData } from "@/hooks/useApiData";
import { api, apiGet } from "@/services/api";

// Counsellor workspace frame from the client design ("Counsellor Dashboard"): a deep-purple side panel with the
// counsellor's card, sections with live counts and a "Browse courses" prompt; a top bar with the page title,
// enquiry search (Ctrl/⌘+K), a callback-request bell and the account menu. It only decides what is SHOWN; the
// backend limits counsellors to their own enquiries and callback requests.

type Summary = { assignedOpen: number; assignedTotal: number; converted: number; followUpsToday: number; followUpsOverdue: number };
type Item = { href: string; label: string; icon: IconName; badge?: "open" | "callbacks"; tone?: string };

const NAV: Item[] = [
  { href: "/counsellor", label: "Dashboard", icon: "dashboard" },
  { href: "/counsellor/enquiries", label: "My Enquiries", icon: "enquiries", badge: "open" },
  { href: "/counsellor/enquiries#callback-leads-title", label: "Callback Requests", icon: "callback", badge: "callbacks", tone: "bg-rose-500" },
  { href: "/counsellor/enquiries?quick=today", label: "Follow-ups", icon: "calendar" },
  { href: "/counsellor/enquiries?quick=new", label: "Assigned Students", icon: "students" },
  { href: "/courses/browse", label: "Browse Courses", icon: "courses" },
  { href: "/counsellor#overview", label: "Reports & Analytics", icon: "reports" },
  { href: "/counsellor/settings", label: "Settings", icon: "settings" },
];

const TITLES: Record<string, [string, string]> = {
  "/counsellor": ["Counsellor Dashboard", "Manage enquiries, follow-ups and guide students towards the right career."],
  "/counsellor/enquiries": ["My Enquiries", "Enquiries and website callback requests assigned to you."],
  "/counsellor/settings": ["Settings", "Your account, password and sign-in security."],
};

const hideSiteChrome = `body:has(#counsellor-workspace) > header, body:has(#counsellor-workspace) > footer, body:has(#counsellor-workspace) > [aria-label="Announcements"] { display: none; }`;
const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "C";

function Photo({ name, src, size = 40 }: { name: string; src?: string | null; size?: number }) {
  return src ? (
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-full bg-violet-200 font-semibold text-violet-900" style={{ width: size, height: size }}>
      {initial(name)}
    </span>
  );
}

export default function CounsellorWorkspaceShell({ children }: { children: ReactNode }) {
  const { status, user, signOut } = useAuth();
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const isCounsellor = user?.role === "counsellor";
  const summary = useApiData((signal) => (isCounsellor ? apiGet<Summary>("/counsellor/summary", { signal }) : Promise.resolve(null)), [isCounsellor, pathname]);
  const leads = useApiData(async (signal) => (isCounsellor ? ((await api<unknown[]>("GET", "/counsellor/callback-leads?status=new&limit=1", { signal })).meta as { new?: number } | undefined)?.new ?? 0 : 0), [isCounsellor, pathname]);
  const counts = { open: summary.data?.assignedOpen ?? 0, callbacks: leads.data ?? 0 };

  useEffect(() => {
    if (status === "signedOut") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);
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
  // eslint-disable-next-line react-hooks/set-state-in-effect -- close the phone menu after navigation
  useEffect(() => setMenuOpen(false), [pathname, params]);

  if (status !== "signedIn" || !user) {
    return (
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-6 h-64" />
      </main>
    );
  }
  if (!isCounsellor) {
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

  const current = `${pathname}${params.get("quick") ? `?quick=${params.get("quick")}` : ""}`;
  const isActive = (href: string) => (!href.includes("#") && href === current) || (href === "/counsellor/enquiries" && pathname.startsWith("/counsellor/enquiries/"));
  const [title, subtitle] = TITLES[pathname] ?? TITLES["/counsellor/enquiries"]!;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    router.push(`/counsellor/enquiries${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-gradient-to-b from-[#1e1150] via-[#24125e] to-[#170c3d] text-white">
      <Link href="/counsellor" className="flex items-center gap-3 px-5 pt-5 pb-4" aria-label="Udaan counsellor dashboard">
        <img src="/udan/flight-mark-light.svg" alt="" width={34} height={33} />
        <span className="leading-tight">
          <span className="block text-xl font-bold">Udaan</span>
          <span className="block text-[11px] text-white/70">Education Consultancy</span>
        </span>
      </Link>
      <div className="mx-4 flex items-center gap-3 border-y border-white/10 py-4">
        <span className="relative">
          <Photo name={user.name} src={user.photoUrl} size={44} />
          <span aria-hidden="true" className="absolute right-0 bottom-0 size-3 rounded-full bg-emerald-400 ring-2 ring-[#24125e]" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold">{user.name}</span>
          <span className="block text-[11px] text-white/70">Counsellor</span>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-400" /> Online
          </span>
        </span>
      </div>
      <nav aria-label="Counsellor sections" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {NAV.map((i) => {
            const active = isActive(i.href);
            const badge = i.badge ? counts[i.badge] : 0;
            return (
              <li key={i.href}>
                <Link
                  href={i.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-[13px] focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:outline-none ${active ? "bg-gradient-to-r from-violet-600 to-indigo-500 font-semibold shadow-lg shadow-violet-900/40" : "text-white/75 hover:bg-white/10 hover:text-white"}`}
                >
                  <Icon name={i.icon} />
                  <span className="flex-1">{i.label}</span>
                  {badge > 0 && (
                    <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${i.tone ?? "bg-violet-500"}`}>
                      {badge}
                      <span className="sr-only">{i.badge === "open" ? " open enquiries" : " new callback requests"}</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="m-4 rounded-2xl bg-gradient-to-br from-violet-500/40 to-indigo-500/30 p-4 ring-1 ring-white/15">
        <span className="flex size-10 items-center justify-center rounded-xl bg-white/15">
          <Icon name="cap" size={22} />
        </span>
        <p className="mt-3 text-sm font-semibold">Help More Students Achieve Their Goals</p>
        <Link href="/courses/browse" className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-xs font-semibold text-[#24125e] hover:bg-violet-50">
          Browse Courses <Icon name="arrowRight" size={14} />
        </Link>
      </div>
    </div>
  );

  return (
    <div id="counsellor-workspace" className="flex min-h-screen w-full flex-1 bg-[#f6f5fc] text-slate-900">
      <style>{hideSiteChrome}</style>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">{sidebar}</aside>
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-black/40" />
          <aside className="relative h-full w-72 max-w-[85vw] shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-violet-100 bg-white/90 px-4 py-2 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-violet-50 lg:hidden">
            <Icon name="menu" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold sm:text-xl">{title}</p>
            <p className="hidden truncate text-xs text-slate-500 sm:block">{subtitle}</p>
          </div>
          <form role="search" aria-label="Search my enquiries" onSubmit={submit} className="hidden md:block">
            <label className="relative block">
              <span className="sr-only">Search by name, phone or reference</span>
              <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
              <input ref={search} type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} placeholder="Search by name, phone, reference..." className="h-10 w-72 rounded-xl border border-slate-200 bg-white pr-14 pl-9 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-200 focus:outline-none lg:w-80" />
              <kbd aria-hidden="true" className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-slate-200 px-1.5 text-[10px] text-slate-500">
                Ctrl + K
              </kbd>
            </label>
          </form>
          <Link href="/counsellor/enquiries#callback-leads-title" aria-label={`Website callback requests${counts.callbacks ? ` (${counts.callbacks} new)` : ""}`} className="relative inline-flex size-10 items-center justify-center rounded-xl text-slate-600 hover:bg-violet-50">
            <Icon name="bell" />
            {counts.callbacks > 0 && <span aria-hidden="true" className="absolute top-2 right-2.5 size-2 rounded-full bg-rose-500 ring-2 ring-white" />}
          </Link>
          <details className="relative">
            <summary className="flex h-10 cursor-pointer list-none items-center gap-1.5 rounded-xl px-1.5 hover:bg-violet-50 [&::-webkit-details-marker]:hidden">
              <Photo name={user.name} src={user.photoUrl} size={32} />
              <Icon name="chevronDown" size={14} />
              <span className="sr-only">Account menu for {user.name}</span>
            </summary>
            <div className="absolute right-0 z-40 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1.5 text-sm shadow-lg">
              <p className="truncate px-3 py-2 text-xs text-slate-500">{user.email}</p>
              <Link href="/counsellor/settings" className="block rounded-lg px-3 py-2 hover:bg-violet-50">
                Settings
              </Link>
              <button type="button" onClick={() => void signOut()} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-violet-50">
                Sign out
              </button>
            </div>
          </details>
        </header>
        <main id="main" className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
