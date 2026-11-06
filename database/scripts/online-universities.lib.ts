// Imports the universities of Admin > Online UG & PG (database/data/online-universities.json) into the college
// catalogue through the same services the admin screens use (validation, duplicate checks, audit log).
// Facts come from two sources only: each university's official website (name, city, website, logo) and the
// UGC-DEB list of programmes entitled to run in online mode (the online UG/PG courses).
import type { Request } from 'express';
import { CollegeModel, normalizeName } from '../../backend/src/models/College.js';
import { CollegeCourseModel } from '../../backend/src/models/CollegeCourse.js';
import { CourseModel } from '../../backend/src/models/Course.js';
import { LocationModel } from '../../backend/src/models/Location.js';
import { createCollege, createCourse, createLocation, createOffering, setCollegeStatus, updateCollege, updateOffering } from '../../backend/src/services/catalog.service.js';
import { collegeBody, collegePatch, offeringBody } from '../../backend/src/validators/catalog.validators.js';

export type DebProgramme = { name: string; level: string };
export type OnlineUniversityRecord = {
  key: string;
  name: string;
  slug: string;
  type: 'private' | 'deemed' | 'government';
  ownership: 'private' | 'government';
  category: 'university';
  city: string;
  website: string;
  logoUrl: string;
  aliases: string[];
  ugcDeb: { listedAs: string; state: string; session: string; current: boolean };
  programmes: DebProgramme[];
  lastListedProgrammes: DebProgramme[];
};
export type OnlineUniversitiesFile = { sources: { ugcDeb: string }; universities: OnlineUniversityRecord[] };

// ---- Places and courses the records need (added only when missing) ----

const REGIONS: Record<string, string> = { 'north-india': 'North India', 'south-india': 'South India', 'west-india': 'West India', 'east-india': 'East India', 'delhi-ncr': 'Delhi NCR' };
const STATES: Record<string, { name: string; region: string }> = {
  delhi: { name: 'Delhi', region: 'north-india' },
  'uttar-pradesh': { name: 'Uttar Pradesh', region: 'north-india' },
  haryana: { name: 'Haryana', region: 'north-india' },
  punjab: { name: 'Punjab', region: 'north-india' },
  rajasthan: { name: 'Rajasthan', region: 'north-india' },
  uttarakhand: { name: 'Uttarakhand', region: 'north-india' },
  'himachal-pradesh': { name: 'Himachal Pradesh', region: 'north-india' },
  gujarat: { name: 'Gujarat', region: 'west-india' },
  maharashtra: { name: 'Maharashtra', region: 'west-india' },
  karnataka: { name: 'Karnataka', region: 'south-india' },
  'tamil-nadu': { name: 'Tamil Nadu', region: 'south-india' },
  'andhra-pradesh': { name: 'Andhra Pradesh', region: 'south-india' },
  sikkim: { name: 'Sikkim', region: 'east-india' },
};
export const CITIES: Record<string, { name: string; state: string; ncr?: boolean }> = {
  'greater-noida': { name: 'Greater Noida', state: 'uttar-pradesh', ncr: true },
  noida: { name: 'Noida', state: 'uttar-pradesh', ncr: true },
  mathura: { name: 'Mathura', state: 'uttar-pradesh' },
  aligarh: { name: 'Aligarh', state: 'uttar-pradesh' },
  'new-delhi': { name: 'New Delhi', state: 'delhi', ncr: true },
  sonipat: { name: 'Sonipat', state: 'haryana', ncr: true },
  mohali: { name: 'Mohali', state: 'punjab' },
  phagwara: { name: 'Phagwara', state: 'punjab' },
  jaipur: { name: 'Jaipur', state: 'rajasthan' },
  dehradun: { name: 'Dehradun', state: 'uttarakhand' },
  solan: { name: 'Solan', state: 'himachal-pradesh' },
  vadodara: { name: 'Vadodara', state: 'gujarat' },
  mumbai: { name: 'Mumbai', state: 'maharashtra' },
  'navi-mumbai': { name: 'Navi Mumbai', state: 'maharashtra' },
  pune: { name: 'Pune', state: 'maharashtra' },
  bengaluru: { name: 'Bengaluru', state: 'karnataka' },
  tiruchirappalli: { name: 'Tiruchirappalli', state: 'tamil-nadu' },
  coimbatore: { name: 'Coimbatore', state: 'tamil-nadu' },
  guntur: { name: 'Guntur', state: 'andhra-pradesh' },
  gangtok: { name: 'Gangtok', state: 'sikkim' },
};
// Degree courses of the catalogue the UGC-DEB programme names map to (new ones are added when missing).
const COURSES: Record<string, { name: string; level: 'ug' | 'pg' | 'pg_diploma'; category: string; months: number }> = {
  bba: { name: 'BBA', level: 'ug', category: 'Management', months: 36 },
  bca: { name: 'BCA', level: 'ug', category: 'Computer Applications', months: 36 },
  bcom: { name: 'B.Com', level: 'ug', category: 'Commerce', months: 36 },
  ba: { name: 'B.A.', level: 'ug', category: 'Arts', months: 36 },
  bsw: { name: 'BSW', level: 'ug', category: 'Social Work', months: 36 },
  'mba-pgdm': { name: 'MBA / PGDM', level: 'pg', category: 'Management', months: 24 },
  mca: { name: 'MCA', level: 'pg', category: 'Computer Applications', months: 24 },
  mcom: { name: 'M.Com', level: 'pg', category: 'Commerce', months: 24 },
  ma: { name: 'M.A.', level: 'pg', category: 'Arts', months: 24 },
  msc: { name: 'M.Sc', level: 'pg', category: 'Science', months: 24 },
  msw: { name: 'MSW', level: 'pg', category: 'Social Work', months: 24 },
  'pg-diploma': { name: 'PG Diploma', level: 'pg_diploma', category: 'Postgraduate diploma', months: 12 },
};
// Longest prefix first, so "MASTER OF ARTS" never takes a "MASTER OF ARTS ..." course of another kind.
const PREFIXES: Array<[RegExp, string]> = [
  [/^BACHELOR OF BUSINESS ADMINISTRATION/, 'bba'],
  [/^BACHELOR OF COMPUTER APPLICATIONS?/, 'bca'],
  [/^BACHELOR OF COMMERCE/, 'bcom'],
  [/^BACHELOR OF SOCIAL WORK/, 'bsw'],
  [/^(BACHELOR OF ARTS|B\.\s?A\.?)(?=[\s(]|$)/, 'ba'],
  [/^MASTER OF BUSINESS ADMINISTRATION/, 'mba-pgdm'],
  [/^MASTER OF COMPUTER APPLICATIONS?/, 'mca'],
  [/^MASTER OF COMMERCE/, 'mcom'],
  [/^MASTER OF SOCIAL WORK/, 'msw'],
  [/^MASTER OF SCIENCE/, 'msc'],
  [/^MASTER OF ARTS/, 'ma'],
  [/^POST\s?GRADUATE DIPLOMA/, 'pg-diploma'],
];

// Table lookups that fail loudly on a slug the tables do not know.
function get<T>(table: Record<string, T>, key: string): T {
  const v = table[key];
  if (v === undefined) throw new Error(`Unknown entry: ${key}`);
  return v;
}

const SMALL = new Set(['and', 'of', 'in', 'for', 'the', 'to']);
const KEEP_UPPER = new Set(['HR', 'IT', 'AI']);
function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(/(\s+|\/|-)/)
    .map((w, i) => (KEEP_UPPER.has(w.toUpperCase()) ? w.toUpperCase() : i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
}

export type ParsedProgramme = { course: string; specialization: string; durationMonths: number; level: 'ug' | 'pg' | 'pg_diploma'; listedAs: string };

// Maps a UGC-DEB programme name to a catalogue course and specialization. The level follows the degree in the
// name (the list has a few rows with a wrong or empty UG/PG column). Duration: the UGC minimum for the level,
// or the duration the name states ("- 4 Years").
export function parseProgramme(listedAs: string): ParsedProgramme | null {
  const raw = listedAs.replace(/\s+/g, ' ').trim();
  const upper = raw.toUpperCase().replace(/\s*,\s*/g, ', ').replace(/\s*\/\s*/g, ' / ');
  const hit = PREFIXES.find(([re]) => re.test(upper));
  if (!hit) return null;
  const course = hit[1];
  const def = get(COURSES, course);
  let rest = upper.replace(hit[0], '');
  const years = rest.match(/-\s*(\d)\s*YEARS?/);
  if (years) rest = rest.replace(years[0], '');
  const parts = [...rest.matchAll(/\(([^)]*)\)/g)].map((m) => (m[1] ?? '').trim());
  const tail = rest.replace(/\([^)]*\)/g, ' ').replace(/^[\s:-]+/, '').trim();
  if (tail) parts.push(tail);
  let honours = false;
  let three = false;
  const named = parts
    .map((p) => p.replace(/^[-:\s]+|[-:\s]+$/g, ''))
    .filter((p) => {
      if (/^HONS\.?$/.test(p)) return !(honours = true);
      if (/^GENERAL$/.test(p) || !p) return false;
      if (/^COMBINATION OF 3 SUBJECTS:?$/.test(p)) return !(three = true);
      return true;
    })
    .map((p) => p.replace(/^COMBINATION OF 3 SUBJECTS:?\s*/, () => ((three = true), '')))
    .map(titleCase);
  let specialization = named.join(', ');
  if (three && specialization) specialization = `3 subjects: ${specialization}`;
  if (honours) specialization = specialization ? `${specialization} (Honours)` : 'Honours';
  // The catalogue keeps up to 120 characters; a longer subject list is summarised (the offering's description
  // quotes the full UGC-DEB name).
  if (specialization.length > 120) specialization = three ? '3-subject combination (see description)' : `${specialization.slice(0, 117).replace(/,[^,]*$/, '')}…`;
  return { course, specialization, durationMonths: years ? Number(years[1]) * 12 : def.months, level: def.level, listedAs: raw };
}

const TYPE_LABEL = { private: 'private university', deemed: 'deemed-to-be university', government: 'state university' } as const;

// The catalogue description: only facts from the two sources.
export function describe(u: OnlineUniversityRecord, programmes: ParsedProgramme[]) {
  const city = get(CITIES, u.city);
  const where = `${city.name}, ${get(STATES, city.state).name}`;
  const ug = programmes.filter((p) => p.level === 'ug').length;
  const pg = programmes.length - ug;
  if (!u.ugcDeb.current) {
    return `${u.name} is a ${TYPE_LABEL[u.type]} in ${where}. It is not in the UGC-DEB list of online programmes for the 2025-26 or 2026-27 sessions; its last listed online entitlement was for ${u.ugcDeb.session.trim()}.`;
  }
  return `${u.name} is a ${TYPE_LABEL[u.type]} in ${where}. UGC-DEB lists ${programmes.length} programmes it is entitled to offer in online mode for the ${u.ugcDeb.session} session (${ug} UG, ${pg} PG).`;
}

// ---- Live checks before anything is written ----

export type Check = { ok: boolean; status: number | null; finalUrl: string | null; contentType: string; reason: string };
export type Checker = (url: string, expect: 'page' | 'image') => Promise<Check>;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
export const liveCheck: Checker = async (url, expect) => {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: expect === 'image' ? 'image/*' : 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    let contentType = res.headers.get('content-type') ?? '';
    // Some servers send images without a type: the first bytes decide (WebP, PNG, JPEG, GIF, SVG).
    if (expect === 'image' && !contentType && res.ok) {
      const head = Buffer.from(await res.arrayBuffer()).subarray(0, 256);
      const text = head.toString('latin1');
      contentType = /^RIFF....WEBP/s.test(text) ? 'image/webp' : text.startsWith('\x89PNG') ? 'image/png' : text.startsWith('\xff\xd8\xff') ? 'image/jpeg' : /^GIF8/.test(text) ? 'image/gif' : /<svg[\s>]/i.test(text) ? 'image/svg+xml' : '';
    } else await res.body?.cancel();
    const typeOk = expect === 'image' ? contentType.startsWith('image/') : contentType.includes('html');
    return { ok: res.ok && typeOk, status: res.status, finalUrl: res.url, contentType, reason: res.ok ? (typeOk ? 'ok' : `unexpected type ${contentType}`) : `HTTP ${res.status}` };
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    return { ok: false, status: null, finalUrl: null, contentType: '', reason: e.cause?.code ?? e.name };
  }
};

// ---- Import ----

export type ImportReport = {
  key: string;
  name: string;
  action: 'created' | 'updated' | 'skipped';
  published: boolean;
  website: Check;
  logo: Check;
  offerings: { created: number; updated: number; unmapped: string[] };
  note: string;
};

async function ensurePlaces(req: Request, needed: Set<string>) {
  const bySlug = async (slug: string) => (await LocationModel.findOne({ slug }).lean()) as { _id: unknown; kind: string } | null;
  for (const city of needed) {
    const c = get(CITIES, city);
    const s = get(STATES, c.state);
    let region = await bySlug(s.region);
    if (!region) region = { _id: (await createLocation({ name: get(REGIONS, s.region), slug: s.region, kind: 'region', parents: [], isActive: true, sortOrder: 100 }, req)).id, kind: 'region' };
    let state = await bySlug(c.state);
    if (!state) state = { _id: (await createLocation({ name: s.name, slug: c.state, kind: 'state', parents: [String(region._id)], isActive: true, sortOrder: 100 }, req)).id, kind: 'state' };
    if (!(await bySlug(city))) {
      const parents = [String(state._id)];
      if (c.ncr) {
        let ncr = await bySlug('delhi-ncr');
        if (!ncr) ncr = { _id: (await createLocation({ name: get(REGIONS, 'delhi-ncr'), slug: 'delhi-ncr', kind: 'region', parents: [String((await bySlug('north-india'))!._id)], isActive: true, sortOrder: 100 }, req)).id, kind: 'region' };
        parents.push(String(ncr._id));
      }
      await createLocation({ name: c.name, slug: city, kind: 'city', parents, isActive: true, sortOrder: 100 }, req);
    }
  }
}

async function ensureCourses(req: Request, slugs: Set<string>) {
  const ids = new Map<string, string>();
  for (const slug of slugs) {
    const existing = (await CourseModel.findOne({ slug }).select('_id').lean()) as { _id: unknown } | null;
    if (existing) ids.set(slug, String(existing._id));
    else {
      const d = get(COURSES, slug);
      ids.set(slug, (await createCourse({ name: d.name, slug, level: d.level, category: d.category, typicalDurationMonths: d.months, isActive: true, sortOrder: 100 }, req)).id);
    }
  }
  return ids;
}

// The record already in the catalogue for this university: same slug, or same normalized name (or alias) in the
// same state. Two different matches are a conflict for an admin to resolve, never merged automatically.
async function existingCollege(u: OnlineUniversityRecord, stateName: string) {
  const names = [u.name, ...u.aliases].map(normalizeName);
  const hits = (await CollegeModel.find({ $or: [{ slug: u.slug }, { normalizedName: { $in: names }, state: new RegExp(`^${stateName}$`, 'i') }] })
    .select('_id slug status')
    .lean()) as Array<{ _id: unknown; slug: string; status: string }>;
  const unique = [...new Map(hits.map((h) => [String(h._id), h])).values()];
  if (unique.length > 1) return { conflict: unique.map((h) => h.slug) };
  return { college: unique[0] ?? null };
}

export async function importOnlineUniversities(file: OnlineUniversitiesFile, o: { req: Request; check?: Checker; apply: boolean; now?: Date }): Promise<ImportReport[]> {
  const check = o.check ?? liveCheck;
  const now = o.now ?? new Date();
  const reports: ImportReport[] = [];
  const parsed = new Map(file.universities.map((u) => [u.key, u.programmes.map((p) => ({ p, parsed: parseProgramme(p.name) }))]));
  if (o.apply) {
    await ensurePlaces(o.req, new Set(file.universities.map((u) => u.city)));
  }
  const courseIds = o.apply ? await ensureCourses(o.req, new Set([...parsed.values()].flat().flatMap((x) => (x.parsed ? [x.parsed.course] : [])))) : new Map<string, string>();

  for (const u of file.universities) {
    const programmes = parsed.get(u.key)!.flatMap((x) => (x.parsed ? [x.parsed] : []));
    const unmapped = parsed.get(u.key)!.flatMap((x) => (x.parsed ? [] : [x.p.name]));
    const [website, logo] = await Promise.all([check(u.website, 'page'), check(u.logoUrl, 'image')]);
    const report: ImportReport = { key: u.key, name: u.name, action: 'skipped', published: false, website, logo, offerings: { created: 0, updated: 0, unmapped }, note: '' };
    reports.push(report);
    const city = CITIES[u.city];
    if (!city) {
      report.note = `Unknown city ${u.city}`;
      continue;
    }
    if (!website.ok) {
      report.note = `Official website did not open (${website.reason}); not imported`;
      continue;
    }
    if (!o.apply) {
      report.note = 'Dry run';
      continue;
    }
    const found = await existingCollege(u, get(STATES, city.state).name);
    if ('conflict' in found) {
      report.note = `Several catalogue records match (${found.conflict!.join(', ')}); resolve the duplicate in Admin > Colleges`;
      continue;
    }
    const location = (await LocationModel.findOne({ slug: u.city, kind: 'city' }).select('_id').lean()) as { _id: unknown };
    const sources = [`Official website: ${website.finalUrl ?? u.website}`, `Online programmes: UGC-DEB HEI programme list (${file.sources.ugcDeb}), listed as "${u.ugcDeb.listedAs}", ${u.ugcDeb.session} session`];
    if (logo.ok) sources.push(`Logo: ${u.logoUrl}`);
    const fields = {
      name: u.name,
      type: u.type,
      location: String(location._id),
      website: u.website,
      // A logo is shown only when its official address answered with an image.
      logoUrl: logo.ok ? u.logoUrl : '',
      about: describe(u, programmes),
      approvals: ['UGC'],
      ownership: u.ownership,
      category: u.category,
      aliases: u.aliases,
      lastVerifiedAt: now,
      verificationSource: sources.join(' | ').slice(0, 500),
    };
    let id: string;
    if (found.college) {
      // Only the fields this import is responsible for change; everything an admin added stays.
      await updateCollege(String(found.college._id), collegePatch.parse(fields), o.req);
      id = String(found.college._id);
      report.action = 'updated';
    } else {
      id = (await createCollege(collegeBody.parse({ ...fields, slug: u.slug }), o.req)).id;
      report.action = 'created';
    }

    for (const p of programmes) {
      const course = courseIds.get(p.course)!;
      const description = `Online mode. Entitled by UGC-DEB for the ${u.ugcDeb.session} session (listed as "${p.listedAs}"). The duration is the UGC minimum for this level unless the listing states one; confirm the duration, fees and eligibility with the university.`;
      const existing = (await CollegeCourseModel.findOne({ college: id, course, specialization: p.specialization }).select('_id').lean()) as { _id: unknown } | null;
      if (existing) {
        await updateOffering(String(existing._id), { mode: 'online', status: 'active', durationMonths: p.durationMonths, description }, o.req);
        report.offerings.updated += 1;
      } else {
        await createOffering(id, offeringBody.parse({ course, specialization: p.specialization, durationMonths: p.durationMonths, mode: 'online', status: 'active', description }), o.req);
        report.offerings.created += 1;
      }
    }
    await setCollegeStatus(id, 'publish', o.req);
    report.published = true;
    if (!u.ugcDeb.current) report.note = `No online programmes in the current UGC-DEB list (last listed ${u.ugcDeb.session.trim()})`;
  }
  return reports;
}
