import mongoose from 'mongoose';
import { LocationModel } from '../../models/Location.js';

// All 28 states and 8 union territories, with the region used by the directory's region filters.
export const REGIONS: Record<string, string> = {
  'north-india': 'North India',
  'south-india': 'South India',
  'east-india': 'East India',
  'west-india': 'West India',
  'central-india': 'Central India',
  'north-east-india': 'North-East India',
};

export const STATES: Array<{ name: string; region: keyof typeof REGIONS; ut?: true; aliases?: string[] }> = [
  { name: 'Andhra Pradesh', region: 'south-india' },
  { name: 'Arunachal Pradesh', region: 'north-east-india' },
  { name: 'Assam', region: 'north-east-india' },
  { name: 'Bihar', region: 'east-india' },
  { name: 'Chhattisgarh', region: 'central-india', aliases: ['Chattisgarh'] },
  { name: 'Goa', region: 'west-india' },
  { name: 'Gujarat', region: 'west-india' },
  { name: 'Haryana', region: 'north-india' },
  { name: 'Himachal Pradesh', region: 'north-india' },
  { name: 'Jharkhand', region: 'east-india' },
  { name: 'Karnataka', region: 'south-india' },
  { name: 'Kerala', region: 'south-india' },
  { name: 'Madhya Pradesh', region: 'central-india' },
  { name: 'Maharashtra', region: 'west-india' },
  { name: 'Manipur', region: 'north-east-india' },
  { name: 'Meghalaya', region: 'north-east-india' },
  { name: 'Mizoram', region: 'north-east-india' },
  { name: 'Nagaland', region: 'north-east-india' },
  { name: 'Odisha', region: 'east-india', aliases: ['Orissa'] },
  { name: 'Punjab', region: 'north-india' },
  { name: 'Rajasthan', region: 'north-india' },
  { name: 'Sikkim', region: 'north-east-india' },
  { name: 'Tamil Nadu', region: 'south-india', aliases: ['Tamilnadu'] },
  { name: 'Telangana', region: 'south-india' },
  { name: 'Tripura', region: 'north-east-india' },
  { name: 'Uttar Pradesh', region: 'north-india' },
  { name: 'Uttarakhand', region: 'north-india', aliases: ['Uttaranchal'] },
  { name: 'West Bengal', region: 'east-india' },
  { name: 'Andaman and Nicobar Islands', region: 'south-india', ut: true, aliases: ['Andaman & Nicobar Islands', 'Andaman and Nicobar'] },
  { name: 'Chandigarh', region: 'north-india', ut: true },
  {
    name: 'Dadra and Nagar Haveli and Daman and Diu',
    region: 'west-india',
    ut: true,
    aliases: ['Dadra and Nagar Haveli', 'Dadra & Nagar Haveli', 'Daman and Diu', 'Daman & Diu', 'The Dadra and Nagar Haveli and Daman and Diu'],
  },
  { name: 'Delhi', region: 'north-india', ut: true, aliases: ['NCT of Delhi', 'National Capital Territory of Delhi', 'New Delhi'] },
  { name: 'Jammu and Kashmir', region: 'north-india', ut: true, aliases: ['Jammu & Kashmir'] },
  { name: 'Ladakh', region: 'north-india', ut: true },
  { name: 'Lakshadweep', region: 'south-india', ut: true },
  { name: 'Puducherry', region: 'south-india', ut: true, aliases: ['Pondicherry'] },
];

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const key = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
const lookup = new Map<string, string>();
for (const s of STATES) for (const n of [s.name, ...(s.aliases ?? [])]) lookup.set(key(n), s.name);

// The official state/UT name for a source's spelling, or null when it is not an Indian state or UT.
export const canonicalState = (raw: string) => lookup.get(key(raw)) ?? null;

// Title-case for district names that arrive in capitals ("NORTH 24 PARGANAS" -> "North 24 Parganas").
export const tidyPlace = (raw: string) =>
  raw
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|[\s(-])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());

// Creates (once) the region, state and district locations used by search, and returns their ids.
export class LocationCache {
  private ids = new Map<string, mongoose.Types.ObjectId>();

  private async ensure(slug: string, name: string, kind: 'region' | 'state' | 'district', parents: mongoose.Types.ObjectId[]) {
    const hit = this.ids.get(slug);
    if (hit) return hit;
    await LocationModel.updateOne({ slug }, { $setOnInsert: { slug, name, kind, parents } }, { upsert: true });
    const doc = await LocationModel.findOne({ slug }).select('_id').lean();
    this.ids.set(slug, doc!._id);
    return doc!._id;
  }

  // State and district ids plus every ancestor (district -> state -> region), for the college's locationIds.
  async place(stateName: string, district: string) {
    const st = STATES.find((s) => s.name === stateName)!;
    const region = await this.ensure(st.region, REGIONS[st.region]!, 'region', []);
    const state = await this.ensure(slugify(st.name), st.name, 'state', [region]);
    const ids = [state, region];
    if (district) ids.unshift(await this.ensure(`${slugify(st.name)}--${slugify(district)}`.slice(0, 80), district, 'district', [state]));
    return ids;
  }
}
