import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setCollegeDbClient } from '../src/services/collegeDb.service.js';
import { setWikidataClient } from '../src/services/wikidata.service.js';
import { makeCollege, seedPlaces } from './catalogFixtures.js';
import { app, useTestDb } from './helpers.js';

useTestDb();

// A stub of the provider: no test ever calls the real CollegeDB API or spends its quota.
const KEY = 'cdb_0123456789abcdef0123456789abcdef';
const ANNA = { id: '0ee02b74-e7aa-4dde-849e-70f6c661d8be', name: 'Anna University, Chennai', city: 'Chennai', state: 'Tamil Nadu' };
function stub(reply: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => reply(String(url), init ?? {}));
  setCollegeDbClient(fn as unknown as typeof fetch, KEY);
  return fn;
}
const json = (body: unknown, status = 200, remaining = 25) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': String(remaining), 'x-ratelimit-limit': '30' } });
const search = (q: string) => request(app).get(`/api/colleges/search?q=${encodeURIComponent(q)}`);

afterEach(() => setCollegeDbClient(null, null));

describe('external college search (CollegeDB)', () => {
  it('returns normalised provider results, links matches in our directory, and never exposes the key', async () => {
    const p = await seedPlaces();
    await makeCollege({ slug: 'anna', name: 'Anna University, Chennai', location: p.chennai._id, course: p.btech._id, tuitionPerYear: 50_000 });
    const fn = stub(() => json({ results: [ANNA, { id: 'not-a-uuid', name: 'Broken' }, { id: '672b5280-ce9b-47f6-a7d3-c2704ebae06e', name: ' Anna University  Regional Campus - Madurai ', city: 'Madurai', state: 'Tamil Nadu', extra: 'ignored' }], query: 'anna' }));
    const res = await search('  Anna   University ');
    expect(res.status).toBe(200);
    // The documented search endpoint, the documented header, only the encoded query.
    const [url, init] = fn.mock.calls[0]!;
    expect(url).toBe('https://api.collegedb.in/v1/colleges/search?q=Anna%20University');
    expect((init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(res.body.data.results).toEqual([
      { ...ANNA, local: { slug: 'anna', listingLevel: 'detailed', isSample: false, hasVerifiedFees: true, website: null }, website: null },
      { id: '672b5280-ce9b-47f6-a7d3-c2704ebae06e', name: 'Anna University Regional Campus - Madurai', city: 'Madurai', state: 'Tamil Nadu', local: null, website: null },
    ]);
    expect(res.body.data).toMatchObject({ query: 'Anna University', source: { name: 'CollegeDB', cached: false }, quotaRemaining: 25 });
    expect(JSON.stringify(res.body)).not.toContain(KEY);
  });

  it('caches answers so repeated searches do not spend the daily quota', async () => {
    const fn = stub(() => json({ results: [ANNA], query: 'anna' }));
    await search('Anna');
    const again = await search('anna');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(again.body.data.source.cached).toBe(true);
    expect(again.body.data.results[0].name).toBe('Anna University, Chennai');
  });

  it('validates the query before calling the provider', async () => {
    const fn = stub(() => json({ results: [] }));
    for (const qs of ['', 'q=', 'q=a', 'q=%20%20b%20', `q=${'x'.repeat(81)}`, 'q=iit&state=delhi', 'q=iit&url=https://evil.example']) {
      expect((await request(app).get(`/api/colleges/search?${qs}`)).status, qs).toBe(422);
    }
    expect((await request(app).get('/api/colleges/external/not-a-uuid')).status).toBe(422);
    expect(fn).not.toHaveBeenCalled();
  });

  it('returns an empty list when nothing matches', async () => {
    stub(() => json({ results: [], query: 'zzqq' }));
    const res = await search('zzqq');
    expect(res.status).toBe(200);
    expect(res.body.data.results).toEqual([]);
  });

  it('answers 503 COLLEGEDB_NOT_CONFIGURED without a key, and reports the status in the filters endpoint', async () => {
    setCollegeDbClient(null, null);
    const res = await search('IIT');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('COLLEGEDB_NOT_CONFIGURED');
    expect((await request(app).get('/api/colleges/filters')).body.data.externalSearch).toMatchObject({ configured: false });
  });

  it('maps invalid or revoked credentials to a safe 503 without provider details', async () => {
    for (const [status, body] of [
      [401, { error: 'Invalid API key' }],
      [403, { error: 'This API key has been revoked' }],
    ] as const) {
      stub(() => json(body, status));
      const res = await search('IIT');
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('COLLEGEDB_UNAVAILABLE');
      expect(JSON.stringify(res.body)).not.toMatch(/API key|revoked|cdb_/);
    }
  });

  it('stops calling the provider once the daily quota is used up', async () => {
    const fn = stub(() => json({ error: 'Rate limit exceeded.', limit: 30, used: 30, resets: 'midnight UTC' }, 429, 0));
    const first = await search('IIT Delhi');
    expect(first.status).toBe(503);
    expect(first.body.error.code).toBe('COLLEGEDB_QUOTA_EXHAUSTED');
    const second = await search('NIT Trichy');
    expect(second.body.error.code).toBe('COLLEGEDB_QUOTA_EXHAUSTED');
    expect(fn).toHaveBeenCalledTimes(1);
    expect((await request(app).get('/api/colleges/filters')).body.data.externalSearch.quotaExhausted).toBe(true);
  });

  it('handles provider downtime, invalid JSON, unexpected shapes and timeouts as 502', async () => {
    stub(() => new Response('upstream error', { status: 503 }));
    expect((await search('IIT')).body.error.code).toBe('COLLEGEDB_UNAVAILABLE');
    stub(() => new Response('<html>not json</html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    expect((await search('IIT')).status).toBe(502);
    stub(() => json({ colleges: 'nope' }));
    expect((await search('IIT')).status).toBe(502);
    stub(() => {
      throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    });
    const timeout = await search('IIT');
    expect(timeout.status).toBe(502);
    expect(timeout.body.error.message).toMatch(/too long/);
    // A failure is not cached: the next search tries again.
    const fn = stub(() => json({ results: [ANNA] }));
    expect((await search('IIT')).status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('looks up one college by id with its documented type label', async () => {
    const fn = stub(() => json({ ...ANNA, aliases: ['Anna Univ', 42], type: 'state_university', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2026-06-15T12:00:00.000Z' }));
    const res = await request(app).get(`/api/colleges/external/${ANNA.id}`);
    expect(res.status).toBe(200);
    expect(fn.mock.calls[0]![0]).toBe(`https://api.collegedb.in/v1/colleges/${ANNA.id}`);
    expect(res.body.data).toMatchObject({ name: 'Anna University, Chennai', aliases: ['Anna Univ'], type: 'state_university', typeLabel: 'State university', providerUpdatedAt: '2026-06-15T12:00:00.000Z', local: null });
    stub(() => json({ error: 'College not found.' }, 404));
    expect((await request(app).get('/api/colleges/external/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });
});

describe('official websites (Wikidata)', () => {
  const entity = (id: string, label: string, site: string | null, country = 'Q668', aliases: string[] = []) => ({
    id,
    labels: { en: { value: label } },
    aliases: { en: aliases.map((value) => ({ value })) },
    claims: { P17: [{ mainsnak: { datavalue: { value: { id: country } } } }], ...(site && { P856: [{ rank: 'normal', mainsnak: { datavalue: { value: site } } }] }) },
  });
  function wikidata(entities: Array<ReturnType<typeof entity>>) {
    const fn = vi.fn(async (url: string | URL | Request) => {
      const u = new URL(String(url));
      expect(u.origin + u.pathname).toBe('https://www.wikidata.org/w/api.php');
      if (u.searchParams.get('action') === 'wbsearchentities') return json({ search: entities.map((e) => ({ id: e.id })) });
      return json({ entities: Object.fromEntries(entities.map((e) => [e.id, e])) });
    });
    setWikidataClient(fn as unknown as typeof fetch);
    return fn;
  }
  afterEach(() => setWikidataClient(null));

  it('adds the official website only for an exact name match of an Indian institution', async () => {
    stub(() => json({ results: [{ ...ANNA, name: 'Indian Institute of Technology, Bombay', city: 'Mumbai', state: 'Maharashtra' }] }));
    wikidata([entity('Q99', 'IIT Bombay Alumni Association', 'https://alumni.example.org'), entity('Q1661242', 'Indian Institute of Technology Bombay', 'https://www.iitb.ac.in')]);
    const res = await search('IIT Bombay');
    expect(res.body.data.results[0].website).toEqual({ url: 'https://www.iitb.ac.in/', source: 'wikidata', reference: 'https://www.wikidata.org/wiki/Q1661242' });
  });

  it('never guesses: no exact match, a foreign namesake or an unsafe URL gives no website', async () => {
    stub(() => json({ results: [ANNA] }));
    wikidata([entity('Q1', 'Anna University Regional Campus', 'https://regional.example.in'), entity('Q2', 'Anna University, Chennai', 'https://us.example.com', 'Q30'), entity('Q3', 'Anna University, Chennai', 'javascript:alert(1)')]);
    expect((await search('Anna')).body.data.results[0].website).toBeNull();
  });

  it('prefers a website verified in our directory, and survives a Wikidata failure', async () => {
    const p = await seedPlaces();
    const { college } = await makeCollege({ slug: 'anna', name: 'Anna University, Chennai', location: p.chennai._id, course: p.btech._id });
    const { CollegeModel } = await import('../src/models/College.js');
    await CollegeModel.updateOne({ _id: college._id }, { $set: { website: 'https://www.annauniv.edu/' } });
    stub(() => json({ results: [ANNA] }));
    const wd = wikidata([entity('Q4767563', 'Anna University, Chennai', 'http://www.annauniv.edu')]);
    expect((await search('Anna Univ')).body.data.results[0].website).toEqual({ url: 'https://www.annauniv.edu/', source: 'our directory', reference: null });
    expect(wd).not.toHaveBeenCalled();

    setWikidataClient((async () => {
      throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    }) as unknown as typeof fetch);
    stub(() => json({ results: [{ ...ANNA, id: '672b5280-ce9b-47f6-a7d3-c2704ebae06e', name: 'Anna University Regional Campus - Madurai', city: 'Madurai' }] }));
    const res = await search('Madurai campus');
    expect(res.status).toBe(200);
    expect(res.body.data.results[0].website).toBeNull();
  });
});
