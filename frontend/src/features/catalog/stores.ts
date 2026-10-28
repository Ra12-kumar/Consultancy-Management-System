"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { apiDelete, apiGet, apiPost } from "@/services/api";
import type { ShortlistItem } from "@/types/catalog";

// ---- Compare tray: up to four colleges, kept in this tab only (sessionStorage; no account data) ----

export const COMPARE_MAX = 4;
export type CompareItem = { slug: string; name: string };
const KEY = "ec.compare";
const EMPTY: CompareItem[] = [];
let compareItems: CompareItem[] = EMPTY;
let compareLoaded = false;
const compareListeners = new Set<() => void>();

function loadCompare() {
  if (compareLoaded || typeof window === "undefined") return;
  compareLoaded = true;
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    if (Array.isArray(v)) compareItems = v.filter((x): x is CompareItem => typeof x?.slug === "string" && typeof x?.name === "string").slice(0, COMPARE_MAX);
  } catch {
    compareItems = EMPTY;
  }
}
function setCompare(next: CompareItem[]) {
  compareItems = next;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode): the tray still works for this page view.
  }
  compareListeners.forEach((l) => l());
}

export const compareStore = {
  subscribe(listener: () => void) {
    compareListeners.add(listener);
    return () => compareListeners.delete(listener);
  },
  getSnapshot() {
    loadCompare();
    return compareItems;
  },
  getServerSnapshot: () => EMPTY,
  has: (slug: string) => compareItems.some((i) => i.slug === slug),
  // Returns "full" when four colleges are already chosen.
  toggle(item: CompareItem): "added" | "removed" | "full" {
    loadCompare();
    if (compareItems.some((i) => i.slug === item.slug)) {
      setCompare(compareItems.filter((i) => i.slug !== item.slug));
      return "removed";
    }
    if (compareItems.length >= COMPARE_MAX) return "full";
    setCompare([...compareItems, item]);
    return "added";
  },
  remove: (slug: string) => setCompare(compareItems.filter((i) => i.slug !== slug)),
  clear: () => setCompare(EMPTY),
};

export const useCompare = () => useSyncExternalStore(compareStore.subscribe, compareStore.getSnapshot, compareStore.getServerSnapshot);

// ---- Shortlist ("My Selected Colleges"): the server is the source of truth ----

type ShortlistState = { owner: string | null; status: "idle" | "loading" | "ready" | "error"; ids: ReadonlySet<string> };
let shortlist: ShortlistState = { owner: null, status: "idle", ids: new Set() };
const shortlistListeners = new Set<() => void>();
const setShortlist = (next: Partial<ShortlistState>) => {
  shortlist = { ...shortlist, ...next };
  shortlistListeners.forEach((l) => l());
};
const SERVER_SHORTLIST: ShortlistState = { owner: null, status: "idle", ids: new Set() };

async function loadShortlist(owner: string) {
  setShortlist({ owner, status: "loading", ids: new Set() });
  try {
    const items = await apiGet<ShortlistItem[]>("/students/me/shortlist");
    if (shortlist.owner === owner) setShortlist({ status: "ready", ids: new Set(items.map((i) => i.collegeId)) });
  } catch {
    if (shortlist.owner === owner) setShortlist({ status: "error" });
  }
}

export function useShortlist() {
  const { user } = useAuth();
  const state = useSyncExternalStore(
    (l) => {
      shortlistListeners.add(l);
      return () => shortlistListeners.delete(l);
    },
    () => shortlist,
    () => SERVER_SHORTLIST,
  );
  const owner = user?.role === "student" ? user.id : null;
  useEffect(() => {
    if (owner && shortlist.owner !== owner) void loadShortlist(owner);
    if (!owner && shortlist.owner) setShortlist({ owner: null, status: "idle", ids: new Set() });
  }, [owner]);

  async function toggle(collegeId: string) {
    const saved = shortlist.ids.has(collegeId);
    if (saved) await apiDelete(`/students/me/shortlist/${collegeId}`);
    else await apiPost("/students/me/shortlist", { collegeId });
    const ids = new Set(shortlist.ids);
    if (saved) ids.delete(collegeId);
    else ids.add(collegeId);
    setShortlist({ ids });
    return !saved;
  }
  return { isStudent: Boolean(owner), ready: owner !== null && state.owner === owner && state.status === "ready", has: (id: string) => state.ids.has(id), toggle };
}

// For tests.
export const resetCatalogStores = () => {
  compareLoaded = false;
  compareItems = EMPTY;
  shortlist = { owner: null, status: "idle", ids: new Set() };
};
