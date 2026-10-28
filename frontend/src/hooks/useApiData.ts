"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiError } from "@/types/api";

type State<T> = { status: "loading" | "success" | "error"; data: T | undefined; error: ApiError | null };

// Loads data from the API whenever `deps` change; keeps the last data while reloading. `reload` fetches again.
export function useApiData<T>(loader: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<State<T>>({ status: "loading", data: undefined, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show loading while a request is in flight
    setState((s) => ({ ...s, status: "loading", error: null }));
    loader(controller.signal)
      .then((data) => !controller.signal.aborted && setState({ status: "success", data, error: null }))
      .catch((error: ApiError & { name?: string }) => {
        if (error?.name !== "AbortError" && !controller.signal.aborted) setState({ status: "error", data: undefined, error });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload };
}
