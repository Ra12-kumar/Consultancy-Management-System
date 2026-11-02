import { env } from '../config/env.js';
import { CollegeModel, normalizeName } from '../models/College.js';
import { CollegeFeeModel } from '../models/CollegeFee.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { safeExternalUrl } from '../utils/safeUrl.js';
import { officialWebsite } from './wikidata.service.js';

// CollegeDB (https://docs.collegedb.in, eLitmus): third-party search of Indian college names.
// Verified against the docs and one live request (October 2026):
//   GET /v1/colleges/search?q=<2+ chars>  -> { results: [{ id, name, city, state }] (max 5, no paging), query }
//   GET /v1/colleges/:id (UUID)            -> { id, name, aliases[], city, state, type, createdAt, updatedAt }
//   Auth: "Authorization: Bearer cdb_…". Daily quota per key (free plan: 30–50 a day), resets at midnight UTC;
//   X-RateLimit-Remaining is sent on every response.
// It has no course, fee, ownership, website or location-filter data, and its terms say nothing about storing
// results, so nothing is written to MongoDB: answers are cached in memory only, for a few hours.

const BASE = 'https://api.collegedb.in'; // the only host this service ever calls
const TIMEOUT_MS = 8000;
const SEARCH_TTL_MS = 6 * 60 * 60_000;
const LOOKUP_TTL_MS = 24 * 60 * 60_000;
const MAX_CACHE = 500;

export const COLLEGEDB_TYPES: Record<string, string> = {
  institute_of_technology: 'Institute of technology',
  national_institute: 'National institute',
  institute_of_science: 'Institute of science',
  deemed_university: 'Deemed university',
  state_university: 'State university',
  private_university: 'Private university',
  autonomous_college: 'Autonomous college',
  unknown: 'Not classified',
};

type FetchFn = typeof fetch;
let fetchFn: FetchFn = (...args) => fetch(...args);
let apiKey: string | undefined = env.COLLEGEDB_API_KEY;

// Tests inject a stub client and key; production uses fetch and the key from the environment.
export function setCollegeDbClient(fn: FetchFn | null, key?: string | null) {
  fetchFn = fn ?? ((...args) => fetch(...args));
  apiKey = key === null ? undefined : (key ?? env.COLLEGEDB_API_KEY);
  resetCollegeDbState();
}

const cache = new Map<string, { at: number; ttl: number; value: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();
// Once the provider says the daily quota is used up, no further calls are made until it resets.
let exhaustedUntil = 0;
let lastRemaining: number | null = null;

export function resetCollegeDbState() {
  cache.clear();
  inFlight.clear();
  exhaustedUntil = 0;
  lastRemaining = null;
}

const nextMidnightUtc = (now = Date.now()) => {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
};

const unavailable = (code: string, message: string, status = 503) => new ApiError(status, code, message);
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// One GET to the provider. Errors are mapped to safe messages; the key and headers are never logged or returned.
async function call(path: string): Promise<unknown> {
  if (!apiKey) throw unavailable('COLLEGEDB_NOT_CONFIGURED', 'The external college search is not set up.');
  if (Date.now() < exhaustedUntil) throw unavailable('COLLEGEDB_QUOTA_EXHAUSTED', 'The external college search has reached its daily limit. It will be available again after midnight UTC.');
  let res: Response;
  try {
    res = await fetchFn(`${BASE}${path}`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' });
  } catch (err) {
    const timeout = (err as Error).name === 'TimeoutError' || (err as Error).name === 'AbortError';
    logger.warn({ provider: 'collegedb', path: path.split('?')[0], reason: timeout ? 'timeout' : 'network' }, 'CollegeDB request failed');
    throw unavailable('COLLEGEDB_UNAVAILABLE', timeout ? 'The external college search took too long to answer. Please try again.' : 'The external college search could not be reached. Please try again.', 502);
  }
  const remaining = Number(res.headers.get('x-ratelimit-remaining'));
  if (Number.isFinite(remaining) && res.headers.get('x-ratelimit-remaining') !== null) {
    lastRemaining = remaining;
    if (remaining <= 0) exhaustedUntil = nextMidnightUtc();
  }
  const log = { provider: 'collegedb', path: path.split('?')[0], status: res.status };
  if (res.status === 429) {
    exhaustedUntil = nextMidnightUtc();
    logger.warn(log, 'CollegeDB daily quota exhausted');
    throw unavailable('COLLEGEDB_QUOTA_EXHAUSTED', 'The external college search has reached its daily limit. It will be available again after midnight UTC.');
  }
  if (res.status === 401 || res.status === 403) {
    logger.error(log, res.status === 403 ? 'CollegeDB API key revoked' : 'CollegeDB API key missing or invalid');
    throw unavailable('COLLEGEDB_UNAVAILABLE', 'The external college search is temporarily unavailable.');
  }
  if (res.status === 404) throw ApiError.notFound('College not found in the external search');
  if (res.status === 400) throw new ApiError(422, 'VALIDATION_ERROR', 'Search text was not accepted', [{ field: 'q', message: 'Use at least 2 letters' }]);
  if (!res.ok) {
    logger.warn(log, 'CollegeDB error response');
    throw unavailable('COLLEGEDB_UNAVAILABLE', 'The external college search is temporarily unavailable.', 502);
  }
  try {
    return await res.json();
  } catch {
    logger.warn(log, 'CollegeDB returned invalid JSON');
    throw unavailable('COLLEGEDB_UNAVAILABLE', 'The external college search returned an unreadable answer.', 502);
  }
}

// Cached and de-duplicated (concurrent identical searches share one provider call).
async function cachedCall<T>(key: string, ttl: number, load: () => Promise<T>): Promise<{ value: T; fetchedAt: Date; cached: boolean }> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return { ...(hit.value as { value: T; fetchedAt: Date }), cached: true };
  let pending = inFlight.get(key) as Promise<{ value: T; fetchedAt: Date }> | undefined;
  if (!pending) {
    pending = load().then((value) => {
      const entry = { value, fetchedAt: new Date() };
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: Date.now(), ttl, value: entry });
      return entry;
    });
    inFlight.set(key, pending);
    pending.finally(() => inFlight.delete(key)).catch(() => undefined);
  }
  return { ...(await pending), cached: false };
}

type ExternalCollege = { id: string; name: string; city: string; state: string };

// Links each external result to a published college in our own directory (same normalised name and state),
// so verified fees come only from our data, never from the provider.
async function withLocalMatches(results: ExternalCollege[]) {
  const names = results.map((r) => normalizeName(r.name));
  const local = (await CollegeModel.find({ status: 'published', normalizedName: { $in: names } }).select('name slug state normalizedName listingLevel isSample website').lean()) as Array<Record<string, unknown>>;
  const feeColleges = new Set((await CollegeFeeModel.distinct('college', { status: 'published', college: { $in: local.map((l) => l._id) } })).map(String));
  return results.map((r) => {
    const match = local.find((l) => l.normalizedName === normalizeName(r.name) && (!r.state || !l.state || String(l.state).toLowerCase() === r.state.toLowerCase()));
    return {
      ...r,
      local: match ? { slug: match.slug as string, listingLevel: (match.listingLevel as string) ?? 'detailed', isSample: Boolean(match.isSample), hasVerifiedFees: feeColleges.has(String(match._id)), website: safeExternalUrl(match.website) } : null,
    };
  });
}

// The official website: one we verified ourselves first, otherwise Wikidata's, otherwise none (never guessed).
async function withWebsites<T extends ExternalCollege & { local: { website?: string | null } | null }>(results: T[]) {
  return Promise.all(
    results.map(async (r) => {
      const ours = r.local?.website ?? null;
      const site = ours ? { url: ours, source: 'our directory' as const, reference: null } : await officialWebsite(r.name, r.city);
      return { ...r, website: site };
    }),
  );
}

export async function searchCollegeDb(q: string) {
  const query = q.replace(/\s+/g, ' ').trim();
  const { value, fetchedAt, cached } = await cachedCall(`search:${query.toLowerCase()}`, SEARCH_TTL_MS, async () => {
    const body = (await call(`/v1/colleges/search?q=${encodeURIComponent(query)}`)) as { results?: unknown };
    if (!body || !Array.isArray(body.results)) {
      logger.warn({ provider: 'collegedb' }, 'CollegeDB search response had an unexpected shape');
      throw unavailable('COLLEGEDB_UNAVAILABLE', 'The external college search returned an unreadable answer.', 502);
    }
    // Only the documented fields, and only well-formed records.
    return body.results
      .map((r) => r as Record<string, unknown>)
      .filter((r) => isUuid(str(r.id, 36)) && str(r.name))
      .slice(0, 5)
      .map((r) => ({ id: str(r.id, 36).toLowerCase(), name: str(r.name), city: str(r.city, 80), state: str(r.state, 80) }));
  });
  return { query, results: await withWebsites(await withLocalMatches(value)), source: { name: 'CollegeDB', url: 'https://collegedb.in', fetchedAt, cached }, quotaRemaining: lastRemaining };
}

export async function lookupCollegeDb(id: string) {
  const key = id.toLowerCase();
  const { value, fetchedAt, cached } = await cachedCall(`lookup:${key}`, LOOKUP_TTL_MS, async () => {
    const r = (await call(`/v1/colleges/${key}`)) as Record<string, unknown> | null;
    if (!r || !isUuid(str(r.id, 36)) || !str(r.name)) throw unavailable('COLLEGEDB_UNAVAILABLE', 'The external college search returned an unreadable answer.', 502);
    const type = str(r.type, 40);
    return {
      id: str(r.id, 36).toLowerCase(),
      name: str(r.name),
      aliases: Array.isArray(r.aliases) ? r.aliases.map((a) => str(a)).filter(Boolean).slice(0, 20) : [],
      city: str(r.city, 80),
      state: str(r.state, 80),
      type: type in COLLEGEDB_TYPES ? type : 'unknown',
      typeLabel: COLLEGEDB_TYPES[type] ?? COLLEGEDB_TYPES.unknown,
      providerUpdatedAt: str(r.updatedAt, 40) || null,
    };
  });
  const [withLocal] = await withWebsites(await withLocalMatches([value]));
  return { ...value, local: withLocal!.local, website: withLocal!.website, source: { name: 'CollegeDB', url: 'https://collegedb.in', fetchedAt, cached } };
}

export const collegeDbStatus = () => ({ configured: Boolean(apiKey), quotaExhausted: Date.now() < exhaustedUntil, quotaRemaining: lastRemaining });
