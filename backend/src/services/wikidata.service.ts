import { env } from '../config/env.js';
import { normalizeName } from '../models/College.js';
import { logger } from '../utils/logger.js';
import { safeExternalUrl } from '../utils/safeUrl.js';

// Official websites from Wikidata (CC0 public data; https://www.wikidata.org/wiki/Property:P856).
// For a college name we look up candidates, keep only items in India (P17 = Q668) whose English label or alias
// matches the name exactly (ignoring punctuation, or a trailing ", <city>"), and take their "official website".
// No exact match means no website: the page then offers a web search instead of guessing.

const API = 'https://www.wikidata.org/w/api.php'; // the only host this service calls
// Wikimedia throttles requests whose User-Agent has no contact URL, so one is included.
const HEADERS = { 'User-Agent': 'Udaan/1.0 (https://www.mediawiki.org/wiki/User-Agent_policy; official website lookup)', Accept: 'application/json' };
const TTL_MS = 7 * 24 * 60 * 60_000;
const MAX_CACHE = 2000;
const INDIA = 'Q668';

type FetchFn = typeof fetch;
// Off in tests unless a stub is injected (tests never call the real service).
let fetchFn: FetchFn | null = env.isTest ? null : (...args) => fetch(...args);
export function setWikidataClient(fn: FetchFn | null) {
  fetchFn = fn;
  cache.clear();
}

export type OfficialSite = { url: string; source: 'wikidata'; reference: string };
const cache = new Map<string, { at: number; value: OfficialSite | null }>();

async function getJson(params: Record<string, string>) {
  const res = await fetchFn!(`${API}?${new URLSearchParams({ ...params, format: 'json' })}`, { headers: HEADERS, signal: AbortSignal.timeout(5000), redirect: 'error' });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

type Entity = { labels?: { en?: { value: string } }; aliases?: { en?: Array<{ value: string }> }; claims?: Record<string, Array<{ rank?: string; mainsnak?: { datavalue?: { value?: unknown } } }>> };
const claimValues = (e: Entity, prop: string) => (e.claims?.[prop] ?? []).filter((c) => c.rank !== 'deprecated').sort((a, b) => (a.rank === 'preferred' ? -1 : b.rank === 'preferred' ? 1 : 0)).map((c) => c.mainsnak?.datavalue?.value);

export async function officialWebsite(name: string, city = ''): Promise<OfficialSite | null> {
  if (!fetchFn || !name) return null;
  const key = `${normalizeName(name)}|${normalizeName(city)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let value: OfficialSite | null = null;
  try {
    const wanted = new Set([normalizeName(name), normalizeName(name.replace(new RegExp(`,\\s*${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), ''))].filter(Boolean));
    const found = (await getJson({ action: 'wbsearchentities', search: name.slice(0, 150), language: 'en', type: 'item', limit: '5' })) as { search?: Array<{ id: string }> };
    const ids = (found.search ?? []).map((s) => s.id).filter((id) => /^Q\d+$/.test(id));
    if (ids.length) {
      const data = (await getJson({ action: 'wbgetentities', ids: ids.join('|'), props: 'claims|labels|aliases', languages: 'en' })) as { entities?: Record<string, Entity> };
      for (const id of ids) {
        const e = data.entities?.[id];
        if (!e) continue;
        const names = [e.labels?.en?.value, ...(e.aliases?.en ?? []).map((a) => a.value)].filter((n): n is string => Boolean(n)).map(normalizeName);
        const inIndia = claimValues(e, 'P17').some((v) => (v as { id?: string })?.id === INDIA);
        const url = claimValues(e, 'P856').map((v) => safeExternalUrl(v)).find(Boolean);
        if (inIndia && url && names.some((n) => wanted.has(n))) {
          value = { url, source: 'wikidata', reference: `https://www.wikidata.org/wiki/${id}` };
          break;
        }
      }
    }
  } catch (err) {
    // Best effort: no website is shown rather than a wrong one, and the lookup is retried next time.
    logger.warn({ provider: 'wikidata', reason: (err as Error).name === 'TimeoutError' ? 'timeout' : 'error' }, 'Official website lookup failed');
    return null;
  }
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), value });
  return value;
}
