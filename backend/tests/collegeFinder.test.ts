import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { CourseModel } from '../src/models/Course.js';
import { buildColleges, setExplorerClient } from '../src/services/collegeExplorer.service.js';
import { client, useTestDb } from './helpers.js';

useTestDb();

const row = (id: string, name: string, place: string, state: string, website?: string) => ({
  item: { value: `http://www.wikidata.org/entity/${id}` },
  itemLabel: { value: name },
  placeLabel: { value: place },
  stateLabel: { value: state },
  ...(website && { website: { value: website } }),
});

// A stub Wikidata endpoint: engineering schools, medical schools and universities; other types are empty.
const ROWS: Record<string, unknown[]> = {
  Q1663017: [row('Q1', 'College of Engineering, Pune', 'Pune district', 'Maharashtra', 'https://www.coep.org.in'), row('Q2', 'Government Engineering College Thrissur', 'Thrissur district', 'Kerala')],
  Q494230: [row('Q3', 'Grant Government Medical College', 'Mumbai City district', 'Maharashtra', 'http://www.ggmcjjh.com'), row('Q9', 'Q9', '', '')],
  Q3918: [row('Q4', 'Savitribai Phule Pune University', 'Pune', 'Maharashtra', 'javascript:alert(1)'), row('Q5', 'University of Delhi', 'New Delhi', 'National Capital Territory of Delhi', 'http://www.du.ac.in')],
  Q189004: [row('Q6', 'Department of Physics, Example University', 'Pune', 'Maharashtra')],
};
let calls = 0;

beforeEach(() => {
  calls = 0;
  setExplorerClient(async (_url, init) => {
    calls += 1;
    const type = /wdt:P31 wd:(Q\d+)/.exec(decodeURIComponent(String(init?.body)).replace(/\+/g, ' '))![1]!;
    return new Response(JSON.stringify({ results: { bindings: ROWS[type] ?? [] } }), { status: 200 });
  });
});
afterAll(() => setExplorerClient(null));

describe('college finder', () => {
  it('searches as you type by name and place, and filters by branch, state and city', async () => {
    let res = await client().get('/api/colleges/explore');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'ready', total: 5, source: { name: 'Wikidata', licence: 'CC0' } });
    expect(res.body.data.states).toEqual(['Delhi', 'Kerala', 'Maharashtra']);

    res = await client().get('/api/colleges/explore?q=pune%20engin');
    expect(res.body.data.items.map((c: { name: string }) => c.name)).toEqual(['College of Engineering, Pune']);
    expect(res.body.data.items[0]).toMatchObject({ city: 'Pune', state: 'Maharashtra', website: 'https://www.coep.org.in/', wikidataUrl: 'https://www.wikidata.org/wiki/Q1' });

    // Short forms match the full official name.
    res = await client().get('/api/colleges/explore?q=du');
    expect(res.body.data.items.map((c: { name: string }) => c.name)).toEqual(['University of Delhi']);

    res = await client().get('/api/colleges/explore?branch=engineering');
    expect(res.body.data.total).toBe(2);
    res = await client().get('/api/colleges/explore?state=Maharashtra&branch=medical');
    expect(res.body.data.items.map((c: { name: string }) => c.name)).toEqual(['Grant Government Medical College']);
    expect(res.body.data.cities).toEqual(['Mumbai City', 'Pune']);
    res = await client().get('/api/colleges/explore?state=Maharashtra&city=Pune');
    expect(res.body.data.total).toBe(2);
    // order=name lists A–Z instead of best match first.
    res = await client().get('/api/colleges/explore?order=name');
    const names = res.body.data.items.map((c: { name: string }) => c.name);
    expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b)));
    expect((await client().get('/api/colleges/explore?order=fees')).status).toBe(422);
    // The list is fetched once; later searches run in memory.
    const fetched = calls;
    await client().get('/api/colleges/explore?q=delhi');
    expect(calls).toBe(fetched);
  });

  it('a course link selects its branch', async () => {
    await CourseModel.create({ name: 'B.Tech / B.E.', slug: 'btech-be', level: 'ug', category: 'Engineering' });
    const res = await client().get('/api/colleges/explore?course=btech-be');
    expect(res.body.data).toMatchObject({ branch: 'engineering', total: 2 });
  });

  it('never invents websites, drops unsafe links, unnamed items and departments', () => {
    const colleges = buildColleges(Object.entries(ROWS).map(([type, bindings]) => ({ type, bindings: bindings as never })));
    const byId = Object.fromEntries(colleges.map((c) => [c.id, c]));
    expect(byId.Q2!.website).toBeNull();
    expect(byId.Q4!.website).toBeNull();
    expect(byId.Q9).toBeUndefined();
    expect(byId.Q6).toBeUndefined();
    expect(byId.Q5).toMatchObject({ state: 'Delhi', branches: ['university'] });
  });

  it('refuses unknown filters and over-long text', async () => {
    expect((await client().get('/api/colleges/explore?branch=magic')).status).toBe(422);
    expect((await client().get(`/api/colleges/explore?q=${'a'.repeat(81)}`)).status).toBe(422);
    expect((await client().get('/api/colleges/explore?sort=fees')).status).toBe(422);
  });

  it('says the list is still loading instead of showing nothing when Wikidata is unreachable', async () => {
    setExplorerClient(async () => new Response('busy', { status: 503 }));
    const res = await client().get('/api/colleges/explore?q=iit');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'loading', items: [], total: 0 });
  });
});
