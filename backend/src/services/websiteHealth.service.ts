import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// Verifies the official website links of the college finder (Wikidata) before they are shown. Each link is opened
// once; a working link is replaced by the address it really ends up at (redirects followed, https preferred); a
// broken one (no such domain, not found, server error, time-out, "domain for sale" or "account suspended" page) is
// hidden, so the card offers "Search for website" instead. Results are saved and refreshed every 14 days.
// Galgotias colleges are excluded on the owner's request: their links are never checked or changed.

export type WebsiteCheck = { ok: boolean; finalUrl: string | null; status: number | null; reason: string; checkedAt: string };
// `complete`: a full check has finished. Until then (first run, or a run a restart interrupted) unchecked links
// stay as listed and the next run continues where the last one stopped.
type Store = { checkedAt: string; complete?: boolean; results: Record<string, WebsiteCheck> };
type FetchFn = typeof fetch;

const RECHECK_MS = 14 * 86_400_000;
const TIMEOUT_MS = 12_000;
const EXCLUDED = /galgotia/i;
// Parking / sale / suspended pages are not the college's website.
const PARKED_HOSTS = /(^|\.)(hugedomains|sedo|sedoparking|dan|afternic|godaddy|parkingcrew|bodis|above|undeveloped|domainmarket|buydomains|namecheap|parklogic|domainnamesales)\.(com|net|io)$/i;
const PARKED_TEXT = /(this domain (name )?(is|may be) for sale|buy this domain|domain (is )?parked|account (has been )?suspended|this account has been suspended|website (is )?(expired|suspended)|domain has expired|renew (this|your) domain)/i;
// Sites that answer automated visitors with "forbidden" or "too many requests" still exist.
const REACHABLE_STATUSES = new Set([401, 403, 406, 429]);
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 UdaanLinkCheck/1.0',
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
};

let fetchFn: FetchFn = (...args) => fetch(...args);
let storeFile: string | null = env.isTest ? null : path.resolve(env.uploadDir, '..', 'cache', 'website-health.json');
let store: Store | null = null;
let loaded = false;
let running: Promise<void> | null = null;

// Tests inject a stub client, a store and no file.
export function setWebsiteChecker(fn: FetchFn | null, initial: Store | null = null, file: string | null = null) {
  fetchFn = fn ?? ((...args) => fetch(...args));
  store = initial;
  loaded = true;
  storeFile = file;
  running = null;
}

export const isExcludedCollege = (name: string) => EXCLUDED.test(name);

async function loadStore() {
  if (loaded) return;
  loaded = true;
  if (!storeFile) return;
  try {
    store = JSON.parse(await fs.readFile(storeFile, 'utf8')) as Store;
  } catch {
    store = null;
  }
}

async function saveStore() {
  if (!storeFile || !store) return;
  await fs.mkdir(path.dirname(storeFile), { recursive: true });
  await fs.writeFile(storeFile, JSON.stringify(store));
}

// The link to show for a college: the verified final address; null when the link is broken, or not yet verified
// after a full check has finished; the original link while the first full check is still running.
export function verifiedWebsite(name: string, url: string | null): string | null {
  if (!url || isExcludedCollege(name)) return url;
  if (!store) return url;
  const r = store.results[url];
  if (!r) return store.complete ? null : url;
  return r.ok ? r.finalUrl : null;
}

async function open(url: string): Promise<{ res: Response | null; error: string | null; body: string }> {
  try {
    const res = await fetchFn(url, { method: 'GET', redirect: 'follow', headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
    // Only the start of the page is read (enough to spot parking or suspension pages).
    let body = '';
    if (res.body && (res.headers.get('content-type') ?? '').includes('html')) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (body.length < 32_000) {
        const { value, done } = await reader.read();
        if (done) break;
        body += decoder.decode(value, { stream: true });
      }
      await reader.cancel().catch(() => undefined);
    } else {
      await res.body?.cancel().catch(() => undefined);
    }
    return { res, error: null, body };
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    return { res: null, error: e.cause?.code ?? e.name ?? 'error', body: '' };
  }
}

function judge(url: string, r: { res: Response | null; error: string | null; body: string }): WebsiteCheck {
  const checkedAt = new Date().toISOString();
  if (!r.res) return { ok: false, finalUrl: null, status: null, reason: r.error ?? 'unreachable', checkedAt };
  const finalUrl = r.res.url || url;
  let host: string;
  try {
    host = new URL(finalUrl).hostname;
  } catch {
    return { ok: false, finalUrl: null, status: r.res.status, reason: 'invalid final address', checkedAt };
  }
  if (PARKED_HOSTS.test(host) || PARKED_TEXT.test(r.body)) return { ok: false, finalUrl: null, status: r.res.status, reason: 'parked, for sale or suspended', checkedAt };
  if (r.res.ok || REACHABLE_STATUSES.has(r.res.status)) return { ok: true, finalUrl, status: r.res.status, reason: 'working', checkedAt };
  return { ok: false, finalUrl: null, status: r.res.status, reason: `HTTP ${r.res.status}`, checkedAt };
}

// Opens one link: the https form first for http links, then the link as given; a time-out is retried once.
export async function checkWebsite(url: string): Promise<WebsiteCheck> {
  const attempts = url.startsWith('http://') ? [`https://${url.slice('http://'.length)}`, url] : [url];
  let last: WebsiteCheck | null = null;
  for (const candidate of attempts) {
    let r = await open(candidate);
    if (!r.res && /timeout|abort/i.test(r.error ?? '')) r = await open(candidate);
    last = judge(candidate, r);
    if (last.ok) return last;
  }
  return last!;
}

// Checks every link (except excluded colleges), a few at a time, saving progress as it goes.
export async function checkWebsites(colleges: Array<{ name: string; website: string | null }>, { concurrency = 16, onProgress }: { concurrency?: number; onProgress?: (done: number, total: number) => void } = {}) {
  await loadStore();
  const all = [...new Set(colleges.filter((c) => c.website && !isExcludedCollege(c.name)).map((c) => c.website!))];
  // An unfinished run is continued: links it already checked are kept.
  const results: Record<string, WebsiteCheck> = store && !store.complete ? Object.fromEntries(all.filter((u) => store!.results[u]).map((u) => [u, store!.results[u]!])) : {};
  const urls = all.filter((u) => !results[u]);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++]!;
      results[url] = await checkWebsite(url);
      done += 1;
      if (done % 250 === 0) {
        onProgress?.(all.length - urls.length + done, all.length);
        // Partial results are merged into the saved store so a stop never loses work.
        store = { checkedAt: new Date().toISOString(), complete: false, results: { ...results } };
        await saveStore().catch(() => undefined);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  store = { checkedAt: new Date().toISOString(), complete: true, results };
  await saveStore();
  onProgress?.(all.length, all.length);
  const working = Object.values(results).filter((r) => r.ok).length;
  return { checked: all.length, working, broken: all.length - working };
}

// Runs a check in the background when there are no results yet or they are older than 14 days. One at a time.
export async function scheduleWebsiteChecks(list: () => Promise<Array<{ name: string; website: string | null }>>) {
  await loadStore();
  if (running || env.isTest) return;
  if (store?.complete && Date.now() - Date.parse(store.checkedAt) < RECHECK_MS) return;
  running = (async () => {
    const colleges = await list();
    if (!colleges.length) return;
    logger.info({ colleges: colleges.length }, 'College website check started');
    const summary = await checkWebsites(colleges, { concurrency: 8, onProgress: (d, t) => logger.info({ done: d, total: t }, 'College website check progress') });
    logger.info(summary, 'College website check finished');
  })()
    .catch((err: Error) => logger.warn({ reason: err.message.slice(0, 200) }, 'College website check failed'))
    .finally(() => {
      running = null;
    });
}

export async function websiteHealthReady() {
  await loadStore();
}
