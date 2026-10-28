import { publicEnv } from "@/lib/env";
import type { ApiError, ApiFailure, ApiSuccess, Readiness } from "@/types/api";

// Calls the backend through the same-origin /api proxy (see next.config.ts), so the HttpOnly session cookie is
// sent automatically and never touched by JavaScript. Returns { data, meta } or throws an ApiError.
export async function api<T>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, { body, signal, allowStatuses = [] }: { body?: unknown; signal?: AbortSignal; allowStatuses?: number[] } = {}): Promise<{ data: T; meta?: Record<string, unknown> }> {
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
export async function apiUpload<T>(method: "POST" | "PUT", path: string, file: Blob, filename: string): Promise<T> {
  const form = new FormData();
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
