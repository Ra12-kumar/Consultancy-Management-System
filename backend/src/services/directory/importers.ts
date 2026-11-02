import { canonicalState, tidyPlace } from './geo.js';

// Source-specific importers. Each one documents where its data comes from and maps that source's columns to one
// normalised institution record. Adding a new authorised source means adding an entry here.

export type Ownership = 'government' | 'government_aided' | 'private' | 'other';
export type Institution = {
  aisheCode: string | null;
  name: string;
  state: string;
  district: string;
  category: 'university' | 'college' | 'standalone';
  ownership: Ownership | null;
  subtype: string;
  type: 'government' | 'private' | 'deemed' | 'autonomous' | 'other';
  areaType: 'rural' | 'urban' | null;
  yearEstablished: number | null;
  affiliatedUniversity: { name: string; type: string };
  website: string;
  postalCode: string;
  sourceUrl: string;
};
export type RowResult = { ok: true; value: Institution } | { ok: false; code: string; message: string };

export type ImporterDef = {
  id: string;
  label: string;
  sourceName: string;
  sourceUrl: string;
  licence: string;
  // How to obtain the file (shown to admins).
  howToGet: string;
  formats: Array<'xlsx' | 'csv'>;
  // Header aliases (lower-case, punctuation-insensitive) for each field; `required` must be present.
  columns: Record<string, string[]>;
  required: string[];
  parse(row: Record<string, string>): RowResult;
};

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const year = (v: string) => {
  const n = Number(v.match(/\d{4}/)?.[0]);
  return n >= 1800 && n <= new Date().getFullYear() ? n : null;
};
const area = (v: string) => (/rural/i.test(v) ? 'rural' : /urban/i.test(v) ? 'urban' : null);

// AISHE "Management" (colleges) and university types -> ownership.
export function ownershipOf(text: string): Ownership | null {
  const t = text.toLowerCase();
  if (!t) return null;
  if (/un-?\s?aided|self[- ]?financ/.test(t)) return 'private';
  if (/aided/.test(t) && /private|government|govt/.test(t)) return 'government_aided';
  if (/private/.test(t)) return 'private';
  if (/govt|government|central|state public|national importance|local body|public/.test(t)) return 'government';
  return 'other';
}
const typeOf = (subtype: string, ownership: Ownership | null): Institution['type'] =>
  /deemed/i.test(subtype) ? 'deemed' : /autonomous/i.test(subtype) ? 'autonomous' : ownership === 'government' ? 'government' : ownership === 'private' ? 'private' : 'other';

function common(row: Record<string, string>, category: Institution['category'], prefix: string): RowResult {
  const code = clean(row.aisheCode).toUpperCase().replace(/\s/g, '');
  const name = clean(row.name);
  const stateRaw = clean(row.state);
  if (!name) return { ok: false, code: 'MISSING_NAME', message: 'No institution name' };
  if (!/^[CUS]-\d{1,7}$/.test(code)) return { ok: false, code: 'BAD_AISHE_CODE', message: `AISHE code "${code || '(empty)'}" is not in the C-/U-/S-number form` };
  if (code[0] !== prefix) return { ok: false, code: 'WRONG_CATEGORY', message: `AISHE code ${code} does not belong to this file's category` };
  const state = canonicalState(stateRaw);
  if (!state) return { ok: false, code: 'UNKNOWN_STATE', message: `"${stateRaw || '(empty)'}" is not an Indian state or union territory` };
  if (name.length > 160) return { ok: false, code: 'NAME_TOO_LONG', message: 'Name longer than 160 characters' };
  const subtype = clean(row.subtype).slice(0, 120);
  const ownership = ownershipOf(clean(row.management) || subtype);
  return {
    ok: true,
    value: {
      aisheCode: code,
      name,
      state,
      district: clean(row.district) ? tidyPlace(clean(row.district)).slice(0, 80) : '',
      category,
      ownership,
      subtype,
      type: typeOf(subtype, ownership),
      areaType: area(clean(row.location)),
      yearEstablished: year(clean(row.yearEstablished)),
      affiliatedUniversity: { name: clean(row.affiliatedUniversityName).slice(0, 200), type: clean(row.affiliatedUniversityType).slice(0, 120) },
      website: '',
      postalCode: '',
      sourceUrl: '',
    },
  };
}

const AISHE = {
  sourceName: 'AISHE (Ministry of Education)',
  sourceUrl: 'https://dashboard.aishe.gov.in/hedirectory/',
  licence: 'Open Government License – India (published on AIKosh by the Department of Higher Education)',
  formats: ['xlsx', 'csv'] as Array<'xlsx' | 'csv'>,
};
const base = { aisheCode: ['aishe code', 'aishecode', 'aishe id'], name: ['name of the institution', 'name of institution', 'institution name', 'name of college', 'name of university', 'name'], state: ['state', 'state name'], district: ['district', 'district name'], yearEstablished: ['year of establishment', 'establishment year', 'year established'], location: ['location', 'area', 'rural urban'] };

export const IMPORTERS: ImporterDef[] = [
  {
    id: 'aishe-colleges',
    label: 'AISHE – all colleges',
    ...AISHE,
    howToGet: 'Sign in at aikosh.indiaai.gov.in and download "All Colleges AISHE Dashboard" (.xlsx).',
    columns: { ...base, subtype: ['college type', 'type of college', 'type'], management: ['management', 'management type'], affiliatedUniversityName: ['affiliated university name', 'university name', 'affiliating university'], affiliatedUniversityType: ['affiliated university type', 'university type'] },
    required: ['aisheCode', 'name', 'state'],
    parse: (row) => common(row, 'college', 'C'),
  },
  {
    id: 'aishe-universities',
    label: 'AISHE – all universities',
    ...AISHE,
    howToGet: 'Sign in at aikosh.indiaai.gov.in and download "All Universities AISHE Dashboard" (.xlsx).',
    columns: { ...base, subtype: ['university type', 'type of university', 'type'], management: ['management', 'ownership'] },
    required: ['aisheCode', 'name', 'state'],
    parse: (row) => common(row, 'university', 'U'),
  },
  {
    id: 'aishe-standalone',
    label: 'AISHE – all standalone institutions',
    ...AISHE,
    howToGet: 'Sign in at aikosh.indiaai.gov.in and download "All Standalone AISHE Dashboard" (.xlsx).',
    columns: { ...base, subtype: ['standalone type', 'institution type', 'type'], management: ['management', 'management type', 'ownership'] },
    required: ['aisheCode', 'name', 'state'],
    parse: (row) => common(row, 'standalone', 'S'),
  },
];

export const importerById = (id: string) => IMPORTERS.find((i) => i.id === id) ?? null;

// Matches a sheet's header cells to the importer's fields. Returns column index per field, or the missing fields.
export function mapHeaders(def: ImporterDef, headers: string[]) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const cells = headers.map(norm);
  const index: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(def.columns)) {
    const i = cells.findIndex((c) => aliases.some((a) => c === norm(a)));
    if (i >= 0 && !Object.values(index).includes(i)) index[field] = i;
  }
  return { index, missing: def.required.filter((f) => index[f] === undefined) };
}
