import { publicEnv } from "@/lib/env";
import type { ApiError, ApiFailure, ApiSuccess, Readiness } from "@/types/api";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type Options = { body?: unknown; signal?: AbortSignal; allowStatuses?: number[] };
type Result<T> = { data: T; meta?: Record<string, unknown> };

// Identical GET requests that are in flight at the same moment (e.g. the side menu and the page both loading the
// same counts) share one network request. Nothing is kept after the answer arrives, so data is never stale; each
// caller can still cancel its own wait, and the shared request is cancelled only when no caller is left.
const inflight = new Map<string, { promise: Promise<Result<unknown>>; waiting: number; controller: AbortController }>();
const abortError = () => new DOMException("The request was cancelled", "AbortError");

function sharedGet<T>(path: string, allowStatuses: number[], signal?: AbortSignal): Promise<Result<T>> {
  if (signal?.aborted) return Promise.reject(abortError());
  const key = `${path}|${allowStatuses.join(",")}`;
  let entry = inflight.get(key);
  if (!entry) {
    const controller = new AbortController();
    const promise = request<unknown>("GET", path, { signal: controller.signal, allowStatuses });
    const created = { promise, waiting: 0, controller };
    entry = created;
    inflight.set(key, created);
    // Settled (or cancelled): later calls start a fresh request. The no-op catch only prevents an "unhandled
    // rejection" report for a request every caller already stopped waiting for.
    promise.catch(() => undefined).finally(() => inflight.get(key) === created && inflight.delete(key));
  }
  const shared = entry;
  shared.waiting += 1;
  if (!signal) return shared.promise as Promise<Result<T>>;
  return new Promise<Result<T>>((resolve, reject) => {
    const leave = () => {
      shared.waiting -= 1;
      if (shared.waiting === 0) {
        shared.controller.abort();
        if (inflight.get(key) === shared) inflight.delete(key);
      }
      reject(abortError());
    };
    signal.addEventListener("abort", leave, { once: true });
    shared.promise.then(
      (r) => {
        signal.removeEventListener("abort", leave);
        resolve(r as Result<T>);
      },
      (err) => {
        signal.removeEventListener("abort", leave);
        reject(err);
      },
    );
  });
}

// Calls the backend through the same-origin /api proxy (see next.config.ts), so the HttpOnly session cookie is
// sent automatically and never touched by JavaScript. Returns { data, meta } or throws an ApiError.
export async function api<T>(method: Method, path: string, { body, signal, allowStatuses = [] }: Options = {}): Promise<Result<T>> {
  return method === "GET" ? sharedGet<T>(path, allowStatuses, signal) : request<T>(method, path, { body, signal, allowStatuses });
}

async function request<T>(method: Method, path: string, { body, signal, allowStatuses = [] }: Options): Promise<Result<T>> {
  let res: Response;
  try {
    res = await fetch(`${publicEnv.apiBaseUrl}${path}`, {
      method,
      signal,
      credentials: "include",
      cache: "no-store",
      headers: { accept: "application/json", ...(body !== undefined && { "content-type": "application/json" }) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw { status: 0, code: "NETWORK_ERROR", message: "Could not reach the server. Check your connection and try again." } satisfies ApiError;
  }
  const json = (await res.json().catch(() => null)) as ApiSuccess<T> | ApiFailure | null;
  if (json && json.success && (res.ok || allowStatuses.includes(res.status))) return { data: json.data, meta: json.meta };
  if (json && !json.success) throw { status: res.status, ...json.error } satisfies ApiError;
  throw { status: res.status, code: "HTTP_ERROR", message: "The server returned an unexpected response. Please try again." } satisfies ApiError;
}

export const apiGet = async <T,>(path: string, opts?: { signal?: AbortSignal }) => (await api<T>("GET", path, opts)).data;
export const apiPost = async <T,>(path: string, body?: unknown) => (await api<T>("POST", path, { body: body ?? {} })).data;
export const apiPut = async <T,>(path: string, body: unknown) => (await api<T>("PUT", path, { body })).data;
export const apiPatch = async <T,>(path: string, body: unknown) => (await api<T>("PATCH", path, { body })).data;
export const apiDelete = async <T,>(path: string) => (await api<T>("DELETE", path)).data;

// Multipart upload of one file (field "file"); the browser sets the boundary header.
export async function apiUpload<T>(method: "POST" | "PUT", path: string, file: Blob, filename: string, fields: Record<string, string> = {}): Promise<T> {
  const form = new FormData();
  // Text fields first, so the server reads them before the file.
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", file, filename);
  let res: Response;
  try {
    res = await fetch(`${publicEnv.apiBaseUrl}${path}`, { method, credentials: "include", cache: "no-store", headers: { accept: "application/json" }, body: form });
  } catch {
    throw { status: 0, code: "NETWORK_ERROR", message: "Could not reach the server. Check your connection and try again." } satisfies ApiError;
  }
  const json = (await res.json().catch(() => null)) as ApiSuccess<T> | ApiFailure | null;
  if (json && json.success && res.ok) return json.data;
  if (json && !json.success) throw { status: res.status, ...json.error } satisfies ApiError;
  throw { status: res.status, code: "HTTP_ERROR", message: res.status === 413 ? "The file is too large" : "The upload failed. Please try again." } satisfies ApiError;
}

export const getReadiness = async (signal?: AbortSignal) => (await api<Readiness>("GET", "/health/ready", { signal, allowStatuses: [503] })).data;

// Field errors from a 422 response, keyed by field path.
export function fieldErrors(error: unknown): Record<string, string> {
  const details = (error as ApiError | null)?.details ?? [];
  return Object.fromEntries(details.map((d) => [d.field, d.message]));
}
