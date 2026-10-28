"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Feedback";
import { homeFor, useAuth } from "@/features/auth/AuthProvider";

export const NAV = [
  { href: "/colleges", label: "Colleges" },
  { href: "/courses", label: "Courses" },
  { href: "/scholarships", label: "Scholarships" },
  { href: "/admission-process", label: "Admission process" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight" aria-label="EduPath Consultancy home">
      <span aria-hidden="true" className="inline-flex size-9 items-center justify-center rounded-xl bg-navy text-gold shadow-sm ring-1 ring-gold/40">
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
          <path d="M12 3 1 9l11 6 9-4.9V17h2V9L12 3Zm-6 9.6V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.4l-6 3.3-6-3.3Z" />
        </svg>
      </span>
      <span>
        EduPath<span className="text-accent-text"> Consultancy</span>
      </span>
    </Link>
  );
}

function ProfileMenu() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  if (!user) return null;
  const home = homeFor(user);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="flex min-h-11 items-center gap-2 rounded-xl px-1.5 hover:bg-foreground/5">
        <Avatar name={user.name} size="sm" src={user.photoUrl} />
        <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">{user.name.split(" ")[0]}</span>
        <span className="sr-only">Open account menu</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
          <p className="truncate px-3 py-2 text-xs text-muted">{user.email}</p>
          {[
            { href: home, label: "Dashboard" },
            ...(user.role === "student" ? [{ href: "/student/profile", label: "My profile" }] : []),
            { href: `${home}/settings`, label: "Account settings" },
          ].map((i) => (
            <Link key={i.href} role="menuitem" href={i.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-2">
              {i.label}
            </Link>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await signOut();
              router.push("/");
            }}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function SiteHeader() {
  const { status } = useAuth();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- close the mobile menu after navigation
  useEffect(() => setMenu(false), [pathname]);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1 text-sm">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} aria-current={pathname === item.href ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-foreground/85 hover:bg-foreground/5 hover:text-foreground aria-[current=page]:text-accent-text">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/enquire" className="hidden min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg shadow-sm hover:brightness-105 sm:inline-flex">
            Enquire for admission
          </Link>
          {status === "signedIn" ? (
            <ProfileMenu />
          ) : status === "signedOut" ? (
            <Link href="/login" className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold hover:bg-foreground/5">
              Sign in
            </Link>
          ) : (
            <span className="inline-block size-8 animate-pulse rounded-full bg-surface-2" aria-hidden="true" />
          )}
          <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-controls="mobile-nav" className="inline-flex size-11 items-center justify-center rounded-xl hover:bg-foreground/5 lg:hidden">
            <span className="sr-only">{menu ? "Close menu" : "Open menu"}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2">
              {menu ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {menu && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-line bg-surface px-4 pb-4 lg:hidden">
          <ul className="space-y-1 pt-2">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="block rounded-lg px-3 py-3 font-medium hover:bg-surface-2">
                  {item.label}
                </Link>
              </li>
            ))}
            {status !== "signedIn" && (
              <li>
                <Link href="/register" className="block rounded-lg px-3 py-3 font-medium hover:bg-surface-2">
                  Create a student account
                </Link>
              </li>
            )}
          </ul>
          <Link href="/enquire" className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-accent font-semibold text-accent-fg">
            Enquire for admission
          </Link>
        </nav>
      )}
    </header>
  );
}
