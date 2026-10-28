"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiGet, apiPost } from "@/services/api";
import type { ApiError, User } from "@/types/api";

type AuthState = { status: "loading" | "signedIn" | "signedOut"; user: User | null };
type AuthContextValue = AuthState & {
  refresh: () => Promise<User | null>;
  setUser: (user: User | null) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Who is signed in, asked from the server (the session is an HttpOnly cookie; nothing is stored in the
// browser). The UI uses this only to show the right menus: every permission is enforced by the backend.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null });

  const refresh = useCallback(async () => {
    try {
      const { user } = await apiGet<{ user: User | null }>("/auth/me");
      setState({ status: user ? "signedIn" : "signedOut", user });
      return user;
    } catch (err) {
      if ((err as ApiError).status !== 401) console.error(err);
      setState({ status: "signedOut", user: null });
      return null;
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the signed-in user once on start
    void refresh();
  }, [refresh]);

  const setUser = useCallback((user: User | null) => setState({ status: user ? "signedIn" : "signedOut", user }), []);
  const signOut = useCallback(async () => {
    try {
      await apiPost("/auth/logout");
    } finally {
      setState({ status: "signedOut", user: null });
    }
  }, []);

  const value = useMemo(() => ({ ...state, refresh, setUser, signOut }), [state, refresh, setUser, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export const homeFor = (user: User | null) => (user?.role === "admin" ? "/admin" : "/student");
