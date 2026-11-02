import { useMemo, useSyncExternalStore } from "react";

// Colleges this browser viewed recently (a per-visitor convenience; nothing is sent to the server).
export type RecentCollege = { slug: string; name: string; place: string };
const KEY = "ec.recentColleges";
const MAX = 6;

export function readRecent(): RecentCollege[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(list) ? list.filter((r): r is RecentCollege => typeof r?.slug === "string" && typeof r?.name === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function recordRecent(college: RecentCollege) {
  try {
    localStorage.setItem(KEY, JSON.stringify([college, ...readRecent().filter((r) => r.slug !== college.slug)].slice(0, MAX)));
  } catch {
    // Storage blocked (private mode, disabled site data): the list simply stays empty.
  }
}

// React hook: the list after hydration (empty on the server), updated when another tab changes it.
const rawSnapshot = () => {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
};
const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};
export function useRecent(): RecentCollege[] {
  const raw = useSyncExternalStore(subscribe, rawSnapshot, () => "[]");
  return useMemo(() => (raw === "[]" ? [] : readRecent()), [raw]);
}
