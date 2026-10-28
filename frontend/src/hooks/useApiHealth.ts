"use client";

import { useCallback, useEffect, useState } from "react";
import { getReadiness } from "@/services/api";
import type { ApiError, Readiness } from "@/types/api";

type State = { status: "loading" } | { status: "done"; data: Readiness } | { status: "error"; error: ApiError };

// Asks the backend whether it (and its database) is ready. `refresh` checks again.
export function useApiHealth() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getReadiness(controller.signal)
      .then((data) => setState({ status: "done", data }))
      .catch((error: ApiError & { name?: string }) => {
        if (error?.name !== "AbortError") setState({ status: "error", error });
      });
    return () => controller.abort();
  }, [attempt]);

  const refresh = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  return { ...state, refresh };
}
