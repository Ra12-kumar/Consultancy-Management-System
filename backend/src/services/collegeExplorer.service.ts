import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { CourseModel } from '../models/Course.js';
import { logger } from '../utils/logger.js';

// Real-time college finder over India's higher-education institutions listed on Wikidata (CC0 data:
// name, city/district, state, institution type and official website). The list is fetched once with a few
// SPARQL queries, kept on disk and in memory, and refreshed weekly; every search then runs in memory, so
// typing costs no third-party calls. Nothing is made up: a college without a listed website has none here.

const SPARQL = 'https://query.wikidata.org/sparql'; // the only host this service calls
// Wikimedia throttles requests whose User-Agent has no contact URL, so one is included.
const HEADERS = { 'User-Agent': 'Udaan/1.0 (https://www.mediawiki.org/wiki/User-Agent_policy; college finder)', Accept: 'application/sparql-results+json' };
const REFRESH_MS = 7 * 24 * 60 * 60_000;
const RETRY_MS = 60 * 60_000;

// Institution types (Wikidata items), checked by label: university, college, engineering school, medical school,
// business school, law school, deemed university, central university, private university, public university,
// university of technology, dental school, pharmacy school, Institute of National Importance, architecture
// school, art academy, nursing school, higher education institution.
const TYPES: Record<string, string> = {
  Q3918: 'university', Q189004: 'college', Q1663017: 'engineering', Q494230: 'medical', Q1143635: 'management', Q1321960: 'law',
  Q3520135: 'university', Q3351682: 'university', Q902104: 'university', Q875538: 'university', Q1371037: 'engineering',
  Q5259432: 'medical', Q2085148: 'pharmacy', Q47531586: 'institute', Q10273077: 'architecture', Q383092: 'design', Q446901: 'nursing', Q38723: 'institute',
};
// State of India, union territory of India.
const STATE_TYPES = 'wd:Q12443800 wd:Q467745';

export const BRANCHES = {
  engineering: 'Engineering & Technology',
  computer: 'Computer Applications',
  management: 'Management & Business',
  commerce: 'Commerce',
  arts: 'Arts & Humanities',
  science: 'Science',
  medical: 'Medical & Dental',
  nursing: 'Nursing',
  pharmacy: 'Pharmacy',
  law: 'Law',
  architecture: 'Architecture & Planning',
  design: 'Design & Fine Arts',
  agriculture: 'Agriculture & Veterinary',
  university: 'Universities (many subjects)',
} as const;
export type Branch = keyof typeof BRANCHES;

const GENERAL = /degree college|\bP\.?\s?G\.? college|mahavidyalaya/i;
// A branch is given by the institution type or by words in its name (e.g. "College of Engineering").
const NAME_RULES: Array<[Branch, RegExp]> = [
  ['engineering', /engineering|technolog|polytechnic|\bIITs?\b|\bNITs?\b|\bIIITs?\b/i],
  ['computer', /computer|information technology|\bIIITs?\b/i],
  ['management', /management|business|\bIIMs?\b/i],
  ['commerce', /commerce|economics/i],
  ['arts', /\barts?\b|humanities|social sciences?/i],
  ['science', /\bscience/i],
  ['medical', /medical|medicine|\bAIIMS\b|dental|health sciences|ayurved|homoeopath|unani|siddha/i],
  ['nursing', /nursing/i],
  ['pharmacy', /pharma/i],
  ['law', /\blaw\b|legal|juridical|\bNLU\b/i],
  ['architecture', /architecture|planning/i],
  ['design', /design|fine arts?|art academy|\bNIFT\b/i],
  ['agriculture', /agricultur|veterinary|horticultur|fisheries|forestry|dairy/i],
  ['university', /university|vidyapeeth|vishwavidyalaya|vidyapith/i],
  // Degree colleges (mahavidyalaya) usually teach B.A., B.Sc. and B.Com.
  ['arts', GENERAL],
  ['science', GENERAL],
  ['commerce', GENERAL],
];
// What each course category on our site is studied under.
const CATEGORY_BRANCH: Record<string, Branch> = {
  engineering: 'engineering', 'computer applications': 'computer', management: 'management', commerce: 'commerce', arts: 'arts',
  science: 'science', pharmacy: 'pharmacy', medical: 'medical', nursing: 'nursing', architecture: 'architecture', law: 'law', research: 'university',
};

export type ExplorerCollege = { id: string; name: string; city: string; state: string; website: string | null; branches: Branch[]; wikidataUrl: string };
// `partial`: some institution types could not be fetched; the list is retried sooner.
type Snapshot = { fetchedAt: string; colleges: ExplorerCollege[]; partial?: boolean };
type Binding = Record<string, { value: string } | undefined>;

type FetchFn = typeof fetch;
let fetchFn: FetchFn = (...args) => fetch(...args);
let cacheFile: string | null = env.isTest ? null : path.resolve(env.uploadDir, '..', 'cache', 'wikidata-colleges.json');
let data: Snapshot | null = null;
let loading: Promise<void> | null = null;
let lastFailure = 0;

// Tests inject a stub client and no cache file.
export function setExplorerClient(fn: FetchFn | null, file: string | null = null) {
  fetchFn = fn ?? ((...args) => fetch(...args));
  cacheFile = file;
  data = null;
  loading = null;
  lastFailure = 0;
}

const cleanPlace = (s: string) => s.replace(/\s+(district|District|division|Division|taluka|tehsil)$/, '').trim();
// Present-day names only: Delhi's full name is shortened; historical states (e.g. Bombay State) are dropped.
const cleanState = (s: string) => (/^National Capital Territory of Delhi$/i.test(s) ? 'Delhi' : /^Bombay State$/i.test(s) ? '' : s);
const isQid = (s: string) => /^Q\d+$/.test(s);
const httpUrl = (s: string | undefined) => {
  try {
    const u = new URL(String(s));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
};

function queryFor(type: string) {
  return `SELECT ?item ?itemLabel ?website ?placeLabel ?stateLabel WHERE {
  ?item wdt:P31 wd:${type}; wdt:P17 wd:Q668.
  OPTIONAL { ?item wdt:P856 ?website }
  OPTIONAL { ?item wdt:P131 ?place }
  OPTIONAL { ?item wdt:P131/wdt:P131?/wdt:P131?/wdt:P131? ?state. VALUES ?st { ${STATE_TYPES} } ?state wdt:P31 ?st. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

async function fetchType(type: string): Promise<Binding[]> {
  const res = await fetchFn(SPARQL, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ query: queryFor(type) }).toString(),
    signal: AbortSignal.timeout(90_000),
    redirect: 'error',
  });
  if (!res.ok) throw new Error(`Wikidata query failed (${res.status})`);
  // A query that hits Wikidata's time limit can end mid-document; JSON.parse then fails and the type is retried later.
  return ((await res.json()) as { results: { bindings: Binding[] } }).results.bindings;
}

// Merges the per-type rows into one record per institution.
export function buildColleges(rows: Array<{ type: string; bindings: Binding[] }>): ExplorerCollege[] {
  const byId = new Map<string, { name: string; places: Set<string>; states: Set<string>; websites: Set<string>; types: Set<string> }>();
  for (const { type, bindings } of rows) {
    for (const b of bindings) {
      const id = b.item?.value.split('/').pop() ?? '';
      const name = (b.itemLabel?.value ?? '').trim();
      if (!isQid(id) || !name || isQid(name) || /\bdepartment of\b/i.test(name)) continue;
      const r = byId.get(id) ?? { name, places: new Set(), states: new Set(), websites: new Set(), types: new Set() };
      const place = b.placeLabel?.value;
      if (place && !isQid(place)) r.places.add(cleanPlace(place));
      const state = b.stateLabel?.value;
      if (state && !isQid(state) && cleanState(state)) r.states.add(cleanState(state));
      const site = httpUrl(b.website?.value);
      if (site) r.websites.add(site);
      r.types.add(type);
      byId.set(id, r);
    }
  }
  return [...byId.entries()].map(([id, r]) => {
    const state = [...r.states][0] ?? '';
    const city = [...r.places].find((p) => p && p !== state && cleanState(p) !== state) ?? '';
    const websites = [...r.websites];
    const branches = new Set<Branch>();
    for (const t of r.types) {
      const b = TYPES[t];
      if (b && b in BRANCHES) branches.add(b as Branch);
    }
    for (const [b, re] of NAME_RULES) if (re.test(r.name)) branches.add(b);
    return { id, name: r.name, city, state, website: websites.find((w) => w.startsWith('https:')) ?? websites[0] ?? null, branches: [...branches], wikidataUrl: `https://www.wikidata.org/wiki/${id}` };
  });
}

// Large answers sometimes stop at Wikidata's time limit, so each type is tried up to three times.
async function fetchTypeWithRetry(type: string) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fetchType(type);
    } catch (err) {
      if (attempt >= 3) throw err;
    }
  }
}

async function refresh() {
  const rows: Array<{ type: string; bindings: Binding[] }> = [];
  const failed: string[] = [];
  for (const type of Object.keys(TYPES)) {
    try {
      rows.push({ type, bindings: await fetchTypeWithRetry(type) });
    } catch (err) {
      failed.push(type);
      logger.warn({ type, reason: (err as Error).message.slice(0, 160) }, 'College finder: one institution type could not be fetched');
    }
  }
  if (!rows.length) throw new Error('Wikidata did not answer');
  const snapshot: Snapshot = { fetchedAt: new Date().toISOString(), colleges: buildColleges(rows), ...(failed.length && { partial: true }) };
  // An incomplete list never replaces a complete one; it is used only when there is nothing better.
  if (failed.length && data && !data.partial && data.colleges.length >= snapshot.colleges.length) throw new Error(`incomplete refresh (${failed.join(', ')})`);
  data = snapshot;
  if (cacheFile) {
    await fs.mkdir(path.dirname(cacheFile), { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify(snapshot));
  }
  logger.info({ colleges: snapshot.colleges.length, failedTypes: failed }, 'College finder list refreshed from Wikidata');
  if (failed.length) throw new Error(`incomplete refresh (${failed.join(', ')})`);
}

// Loads the list (memory, then disk, then Wikidata). Only one refresh runs at a time; a failure is retried
// after a pause and never wipes a list we already have.
function ensureLoaded() {
  if (loading) return loading;
  const stale = !data || data.partial || Date.now() - Date.parse(data.fetchedAt) > REFRESH_MS;
  if (!stale || Date.now() - lastFailure < RETRY_MS) return Promise.resolve();
  loading = (async () => {
    if (!data && cacheFile) {
      try {
        data = JSON.parse(await fs.readFile(cacheFile, 'utf8')) as Snapshot;
        if (!data.partial && Date.now() - Date.parse(data.fetchedAt) <= REFRESH_MS) return;
      } catch {
        // No saved list yet.
      }
    }
    try {
      await refresh();
    } catch (err) {
      lastFailure = Date.now();
      logger.warn({ reason: (err as Error).message.slice(0, 200) }, 'College finder refresh failed');
    }
  })().finally(() => {
    loading = null;
  });
  return loading;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Short forms students type, and the words in the official names they stand for.
const ABBREVIATIONS: Record<string, string> = {
  iit: 'indian institute of technology',
  nit: 'national institute of technology',
  iiit: 'indian institute of information technology',
  iim: 'indian institute of management',
  iisc: 'indian institute of science',
  iiser: 'indian institute of science education and research',
  aiims: 'all india institute of medical sciences',
  nift: 'national institute of fashion technology',
  nid: 'national institute of design',
  nlu: 'national law university',
  du: 'university of delhi',
  bhu: 'banaras hindu university',
  amu: 'aligarh muslim university',
  jnu: 'jawaharlal nehru university',
};

export async function branchForCourse(slug: string): Promise<Branch | null> {
  const course = await CourseModel.findOne({ slug, isActive: true }).select('category').lean();
  return course ? (CATEGORY_BRANCH[String(course.category ?? '').toLowerCase()] ?? null) : null;
}

// Teacher-education courses, recognised from the college name (Wikidata has no course list), the same way branches
// are worked out. Matched on the normalised name (lower case, dots and punctuation as spaces).
export const TEACHER_COURSES = { deled: 'D.El.Ed', bed: 'B.Ed', med: 'M.Ed' } as const;
export type TeacherCourse = keyof typeof TEACHER_COURSES;
const TEACHER_PATTERNS: Record<TeacherCourse, RegExp> = {
  deled: /\bd ?el ?ed\b|\bd ?ed\b|\bdiet\b|district institute of education|teachers? training institute|\bbtc\b|\bjbt\b/,
  bed: /\bb ?ed\b|college of (teacher )?education|teachers? training college|shikshan? mahavidyalaya/,
  med: /\bm ?ed\b|institute of advanced stud(y|ies) in education|\biase\b/,
};
export const offersTeacherCourse = (name: string, course: TeacherCourse) => TEACHER_PATTERNS[course].test(norm(name));

export type ExplorerQuery = { q?: string; state?: string; city?: string; branch?: Branch; course?: string; teacher?: TeacherCourse; order?: 'relevance' | 'name'; page: number; limit: number };

export async function exploreColleges(query: ExplorerQuery) {
  // The first request waits for the list (a saved copy loads at once; a first-ever fetch takes a minute or two).
  if (!data) await Promise.race([ensureLoaded(), new Promise((r) => setTimeout(r, 8000))]);
  else void ensureLoaded();
  const branch = query.branch ?? (query.course ? await branchForCourse(query.course) : null) ?? undefined;
  const source = { name: 'Wikidata', url: 'https://www.wikidata.org', licence: 'CC0', fetchedAt: data?.fetchedAt ?? null };
  if (!data) return { status: 'loading' as const, branch: branch ?? null, items: [], total: 0, page: 1, totalPages: 1, states: [], cities: [], source };

  const words = norm(query.q ?? '').split(' ').filter(Boolean);
  const state = query.state ? norm(query.state) : '';
  const city = query.city ? norm(query.city) : '';
  const inState = data.colleges.filter((c) => !state || norm(c.state) === state);
  const matches = inState.filter((c) => {
    if (branch && !c.branches.includes(branch)) return false;
    if (query.teacher && !offersTeacherCourse(c.name, query.teacher)) return false;
    if (city && norm(c.city) !== city) return false;
    if (!words.length) return true;
    // Every word must appear in the name or place, so "pune engineering" and "iit bombay" both work;
    // common short forms (IIT, NIT, IIM, AIIMS…) also match the full name.
    const hay = ` ${norm(`${c.name} ${c.city} ${c.state}`)} `;
    return words.every((w) => hay.includes(` ${w}`) || (ABBREVIATIONS[w] !== undefined && hay.includes(` ${ABBREVIATIONS[w]} `)));
  });
  const name0 = words.join(' ');
  // Whole-word and short-form matches first ("nit" finds NITs before "Nitte"), then names starting with the
  // text, then colleges with a known website.
  const whole = (c: ExplorerCollege) => {
    const hay = ` ${norm(`${c.name} ${c.city} ${c.state}`)} `;
    return words.every((w) => hay.includes(` ${w} `) || (ABBREVIATIONS[w] !== undefined && hay.includes(` ${ABBREVIATIONS[w]} `)));
  };
  const rank = (c: ExplorerCollege) => (name0 && !whole(c) ? 4 : 0) + (name0 && norm(c.name).startsWith(name0) ? 0 : 2) + (c.website ? 0 : 1);
  if (query.order === 'name') matches.sort((a, b) => a.name.localeCompare(b.name));
  else matches.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  const totalPages = Math.max(1, Math.ceil(matches.length / query.limit));
  const page = Math.min(query.page, totalPages);
  const states = [...new Set(data.colleges.map((c) => c.state).filter(Boolean))].sort();
  const cities = state ? [...new Set(inState.map((c) => c.city).filter(Boolean))].sort() : [];
  return { status: 'ready' as const, branch: branch ?? null, items: matches.slice((page - 1) * query.limit, page * query.limit), total: matches.length, page, totalPages, states, cities, source };
}
