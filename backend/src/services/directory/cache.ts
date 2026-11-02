// A tiny in-process cache for stable directory reference data (filter options, coverage). Cleared whenever an import
// finishes or an admin changes college data, and expires on its own after a few minutes.
const TTL_MS = 5 * 60_000;
const store = new Map<string, { at: number; value: unknown }>();

export async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await load();
  store.set(key, { at: Date.now(), value });
  return value;
}

export const invalidateDirectoryCache = () => store.clear();
