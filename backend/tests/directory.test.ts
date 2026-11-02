import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';
import { CollegeModel } from '../src/models/College.js';
import { CollegeImportJobModel, DirectoryReviewItemModel } from '../src/models/Directory.js';
import { processImportQueue } from '../src/services/directory/importJob.service.js';
import { makeCollege, rupees, seedPlaces } from './catalogFixtures.js';
import { app, client, createAdmin, createLimitedAdmin, ORIGIN, registerStudent, useTestDb } from './helpers.js';

useTestDb();

// AISHE "All Colleges" layout: a title row above the header, as in the downloaded workbook.
const HEAD = ['S.No', 'Aishe Code', 'Name', 'State', 'District', 'Year Of Establishment', 'Location', 'College Type', 'Management', 'University Name', 'University Type'];
const ROWS = [
  [1, 'C-10001', 'Government Arts College', 'Tamil Nadu', 'Chennai', '1950', 'Urban', 'Affiliated College', 'State Government', 'University of Madras', 'State Public University'],
  [2, 'C-10002', 'Sri Ram Institute of Technology', 'Uttar Pradesh', 'Gautam Buddha Nagar', '2008', 'Urban', 'Affiliated College', 'Private Un-Aided', 'AKTU', 'State Public University'],
  [3, 'C-10003', 'Village Degree College', 'UTTAR PRADESH', 'Gautam Buddha Nagar', '1999', 'Rural', 'Affiliated College', 'Private Aided', 'CCS University', 'State Public University'],
  [4, 'BAD-1', 'No Code College', 'Bihar', 'Patna', '', '', '', '', '', ''],
  [5, 'C-10004', 'Nowhere College', 'Atlantis', '', '', '', '', '', '', ''],
  [6, 'C-10001', 'Government Arts College (again)', 'Tamil Nadu', 'Chennai', '', '', '', '', '', ''],
];

async function workbook(rows: unknown[][], head = HEAD) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Colleges');
  ws.addRow(['All Colleges – AISHE Dashboard']);
  ws.addRow(head);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

type Client = ReturnType<typeof client>;
const upload = (c: Client, buf: Buffer, fields: Record<string, string> = {}, name = 'All Colleges AISHE.xlsx') => {
  let r = c.agent.post('/api/admin/college-imports').set('Origin', ORIGIN).field('importer', fields.importer ?? 'aishe-colleges');
  for (const [k, v] of Object.entries(fields)) if (k !== 'importer') r = r.field(k, v);
  return r.attach('file', buf, name);
};

async function runImport(c: Client, buf: Buffer, fields: Record<string, string> = {}) {
  const res = await upload(c, buf, fields);
  expect(res.status, JSON.stringify(res.body)).toBe(202);
  await processImportQueue();
  return (await c.get(`/api/admin/college-imports/${res.body.data.id}`)).body.data;
}

const slugsOf = (res: request.Response) => res.body.data.map((c: { slug: string }) => c.slug);

describe('directory administration access', () => {
  it('requires catalog.manage for every import and data-management route', async () => {
    const id = '0123456789abcdef01234567';
    const routes: Array<['get' | 'post', string]> = [
      ['get', '/api/admin/college-importers'],
      ['get', '/api/admin/college-imports'],
      ['post', '/api/admin/college-imports'],
      ['get', `/api/admin/college-imports/${id}`],
      ['post', `/api/admin/college-imports/${id}/retry`],
      ['get', '/api/admin/directory/reviews'],
      ['post', `/api/admin/directory/reviews/${id}/resolve`],
      ['get', '/api/admin/directory/stale'],
      ['get', '/api/admin/directory/coverage'],
    ];
    const { c: student } = await registerStudent();
    const { c: pricingOnly } = await createLimitedAdmin(['pricing.manage']);
    for (const [method, url] of routes) {
      expect((await request(app)[method](url).set('Origin', ORIGIN)).status, `anon ${url}`).toBe(401);
      expect((method === 'get' ? await student.get(url) : await student.post(url, {})).status, `student ${url}`).toBe(403);
      expect((method === 'get' ? await pricingOnly.get(url) : await pricingOnly.post(url, {})).status, `pricing ${url}`).toBe(403);
    }
  });

  it('students cannot change college or fee records', async () => {
    const p = await seedPlaces();
    const { college } = await makeCollege({ slug: 'alpha', location: p.noida._id, course: p.btech._id, tuitionPerYear: 100_000 });
    const { c } = await registerStudent();
    expect((await c.patch(`/api/admin/colleges/${college._id}`, { name: 'Hacked' })).status).toBe(403);
    expect((await c.post('/api/admin/fees/preview', {})).status).toBe(403);
    expect((await CollegeModel.findById(college._id).lean())!.name).toBe('alpha');
  });
});

describe('importing AISHE files', () => {
  it('imports valid rows as published basic listings and reports every rejected row with its spreadsheet row number', async () => {
    const { c } = await createAdmin();
    const job = await runImport(c, await workbook(ROWS), { sourceDataDate: '2026-09-30' });
    expect(job).toMatchObject({ status: 'completed_with_errors', totalRows: 6, progress: 100 });
    expect(job.counts).toMatchObject({ processed: 6, created: 3, rejected: 2, skipped: 1 });
    // Title row is row 1, header row 2, so data starts at row 3.
    expect(job.rowErrors).toEqual([
      expect.objectContaining({ row: 6, code: 'BAD_AISHE_CODE' }),
      expect.objectContaining({ row: 7, code: 'UNKNOWN_STATE' }),
      expect.objectContaining({ row: 8, code: 'DUPLICATE_IN_FILE' }),
    ]);

    const gac = await CollegeModel.findOne({ aisheCode: 'C-10001' }).lean();
    expect(gac).toMatchObject({ status: 'published', listingLevel: 'basic', category: 'college', ownership: 'government', state: 'Tamil Nadu', district: 'Chennai', yearEstablished: 1950, areaType: 'urban' });
    expect(gac!.source).toMatchObject({ name: 'AISHE (Ministry of Education)', importer: 'aishe-colleges' });
    // Upper-case state names are resolved to the canonical name; ownership is read from the management column.
    expect(await CollegeModel.findOne({ aisheCode: 'C-10003' }).lean()).toMatchObject({ state: 'Uttar Pradesh', ownership: 'government_aided', areaType: 'rural' });
    expect((await CollegeModel.findOne({ aisheCode: 'C-10002' }).lean())!.ownership).toBe('private');

    // Public: basic listings are searchable, never with a fee, and fully labelled.
    const res = await request(app).get('/api/colleges?state=uttar-pradesh&sort=name');
    expect(res.status).toBe(200);
    expect(res.body.data.map((x: { aisheCode: string }) => x.aisheCode)).toEqual(['C-10002', 'C-10003']);
    expect(res.body.data[0]).toMatchObject({ listingLevel: 'basic', source: { name: 'AISHE (Ministry of Education)' }, fee: { status: 'not_verified', amountMinor: null }, feeFromMinor: null });
    expect(res.body.meta.coverage).toMatchObject({ total: 3, statesCovered: 2, statesTotal: 36, withVerifiedFees: 0, partial: true });

    const detail = await request(app).get(`/api/colleges/${gac!.slug}`);
    expect(detail.body.data).toMatchObject({ aisheCode: 'C-10001', yearEstablished: 1950, affiliatedUniversity: { name: 'University of Madras' }, offerings: [] });
  });

  it('filters by district, ownership, category, AISHE code and name, with the dependent district list', async () => {
    const { c } = await createAdmin();
    await runImport(c, await workbook(ROWS.slice(0, 3)));
    const districts = await request(app).get('/api/colleges/districts?state=uttar-pradesh');
    expect(districts.body.data).toEqual([{ name: 'Gautam Buddha Nagar', slug: 'uttar-pradesh--gautam-buddha-nagar', count: 2 }]);
    expect((await request(app).get('/api/colleges/districts?state=atlantis')).status).toBe(404);

    const get = (qs: string) => request(app).get(`/api/colleges?${qs}`);
    expect((await get('district=uttar-pradesh--gautam-buddha-nagar&ownership=private')).body.data.map((x: { aisheCode: string }) => x.aisheCode)).toEqual(['C-10002']);
    expect((await get('ownership=government')).body.data.map((x: { aisheCode: string }) => x.aisheCode)).toEqual(['C-10001']);
    expect((await get('category=university')).body.data).toEqual([]);
    expect((await get('q=c-10003')).body.data.map((x: { aisheCode: string }) => x.aisheCode)).toEqual(['C-10003']);
    expect((await get('q=sri%20ram')).body.data.map((x: { aisheCode: string }) => x.aisheCode)).toEqual(['C-10002']);
    expect((await get('q=no-such-college-anywhere')).body).toMatchObject({ data: [], meta: { total: 0 } });

    const filters = (await request(app).get('/api/colleges/filters')).body.data;
    expect(filters.states).toEqual([
      { name: 'Tamil Nadu', slug: 'tamil-nadu', count: 1 },
      { name: 'Uttar Pradesh', slug: 'uttar-pradesh', count: 2 },
    ]);
    expect(filters.ownership).toEqual({ government: 1, private: 1, government_aided: 1 });
    expect(filters.coverage.partial).toBe(true);
  });

  it('refuses files with the wrong columns or format before queueing anything', async () => {
    const { c } = await createAdmin();
    const dir = path.join(env.uploadDir, 'imports');
    const stored = async () => (await fs.readdir(dir).catch(() => [])).length;
    const before = await stored();
    const wrong = await upload(c, await workbook([[1, 'x']], ['S.No', 'Something else']));
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.code).toBe('MISSING_COLUMNS');
    const binary = await upload(c, Buffer.from([0x00, 0x01, 0x02, 0x03, 0x00]), {}, 'image.bin');
    expect(binary.status).toBe(415);
    expect((await upload(c, await workbook(ROWS), { importer: 'nirf-scraper' })).status).toBe(422);
    expect(await CollegeImportJobModel.countDocuments()).toBe(0);
    // A refused file is not kept on disk.
    expect(await stored()).toBe(before);
  });

  it('updates changed fields on re-import, keeps admin-verified fields and records a conflict for review', async () => {
    const { c } = await createAdmin();
    await runImport(c, await workbook(ROWS.slice(0, 2)));
    const gac = (await CollegeModel.findOne({ aisheCode: 'C-10001' }).lean())!;
    // An admin corrects the name: the field is now locked against imports.
    expect((await c.patch(`/api/admin/colleges/${gac._id}`, { name: 'Government Arts College, Nandanam' })).status).toBe(200);
    expect((await CollegeModel.findById(gac._id).lean())!.lockedFields).toContain('name');

    const changed = ROWS.slice(0, 2).map((r) => [...r]);
    changed[0]![2] = 'Govt. Arts College'; // the source's spelling
    changed[1]![5] = '2009'; // a corrected establishment year
    const second = await runImport(c, await workbook(changed));
    expect(second.counts).toMatchObject({ created: 0, updated: 1, unchanged: 1, conflicts: 1 });
    expect((await CollegeModel.findById(gac._id).lean())!.name).toBe('Government Arts College, Nandanam');
    expect((await CollegeModel.findOne({ aisheCode: 'C-10002' }).lean())!.yearEstablished).toBe(2009);

    const reviews = (await c.get('/api/admin/directory/reviews?kind=field_conflict')).body.data;
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ field: 'name', currentValue: 'Government Arts College, Nandanam', incomingValue: 'Govt. Arts College', college: { aisheCode: 'C-10001' } });
    // A third import does not pile up another item for the same conflict.
    await runImport(c, await workbook(changed));
    expect(await DirectoryReviewItemModel.countDocuments({ status: 'open' })).toBe(1);

    expect((await c.post(`/api/admin/directory/reviews/${reviews[0].id}/resolve`, { action: 'archive_new' })).status).toBe(422);
    const resolved = await c.post(`/api/admin/directory/reviews/${reviews[0].id}/resolve`, { action: 'accept_incoming', note: 'Checked with AISHE' });
    expect(resolved.body.data).toMatchObject({ status: 'resolved', resolution: 'accept_incoming' });
    expect((await CollegeModel.findById(gac._id).lean())!.name).toBe('Govt. Arts College');
    expect((await c.post(`/api/admin/directory/reviews/${reviews[0].id}/resolve`, { action: 'keep_current' })).status).toBe(404);
  });

  it('holds a possible duplicate of a hand-entered college for review instead of publishing it', async () => {
    const p = await seedPlaces();
    await makeCollege({ slug: 'sri-ram', name: 'Sri Ram Institute of Technology', location: p.noida._id, course: p.btech._id });
    const { c } = await createAdmin();
    const job = await runImport(c, await workbook(ROWS.slice(1, 2)));
    expect(job.counts).toMatchObject({ created: 1, duplicates: 1 });
    const imported = (await CollegeModel.findOne({ aisheCode: 'C-10002' }).lean())!;
    expect(imported.status).toBe('needs_review');
    expect((await request(app).get(`/api/colleges/${imported.slug}`)).status).toBe(404);

    const [item] = (await c.get('/api/admin/directory/reviews?kind=possible_duplicate')).body.data;
    expect(item).toMatchObject({ college: { aisheCode: 'C-10002' }, otherCollege: { slug: 'sri-ram' } });
    await c.post(`/api/admin/directory/reviews/${item.id}/resolve`, { action: 'archive_existing' });
    // Nothing is deleted: the hand-entered twin is archived, the AISHE record is published.
    expect((await CollegeModel.findOne({ slug: 'sri-ram' }).lean())!.status).toBe('archived');
    expect((await CollegeModel.findById(imported._id).lean())!.status).toBe('published');
  });

  it('marks records missing from a later full snapshot as stale without deleting them', async () => {
    const { c } = await createAdmin();
    await runImport(c, await workbook(ROWS.slice(0, 3)), { fullSnapshot: 'yes' });
    const later = await runImport(c, await workbook(ROWS.slice(0, 2)), { fullSnapshot: 'yes' });
    expect(later.failure).toMatch(/^1 earlier record/);
    expect(await CollegeModel.countDocuments({ status: 'published' })).toBe(3);

    const stale = (await c.get('/api/admin/directory/stale?reason=not_in_source')).body.data;
    expect(stale.map((s: { aisheCode: string; reason: string }) => [s.aisheCode, s.reason])).toEqual([['C-10003', 'not_in_source']]);
    const card = (await request(app).get('/api/colleges?q=c-10003')).body.data[0];
    expect(card.stale).toBe(true);
    expect((await request(app).get('/api/colleges?q=c-10001')).body.data[0].stale).toBe(false);

    const coverage = (await c.get('/api/admin/directory/coverage')).body.data;
    expect(coverage.byState).toEqual(expect.arrayContaining([expect.objectContaining({ state: 'Uttar Pradesh', total: 2, colleges: 2, basicListings: 2 })]));
    expect(coverage.overall.partial).toBe(true);
  });

  it('a failed import keeps existing records and can be retried from its checkpoint', async () => {
    const { c } = await createAdmin();
    await runImport(c, await workbook(ROWS.slice(0, 1)));
    const res = await upload(c, await workbook(ROWS.slice(0, 3)));
    // The stored file disappears before the job runs (e.g. disk problem).
    const job = (await CollegeImportJobModel.findById(res.body.data.id).lean())!;
    const file = path.join(env.uploadDir, job.fileKey);
    const saved = await fs.readFile(file);
    await fs.rm(file);
    await processImportQueue();
    const failed = (await c.get(`/api/admin/college-imports/${job._id}`)).body.data;
    expect(failed.status).toBe('failed');
    expect(failed.failure).toMatch(/retry/i);
    expect(await CollegeModel.countDocuments()).toBe(1);
    expect((await c.post(`/api/admin/college-imports/${job._id}/retry`)).status).toBe(202);
    expect((await c.post(`/api/admin/college-imports/${job._id}/retry`)).body.error.code).toBe('NOT_RETRYABLE');

    await fs.writeFile(file, saved);
    await processImportQueue();
    const done = (await c.get(`/api/admin/college-imports/${job._id}`)).body.data;
    expect(done).toMatchObject({ status: 'completed', counts: { created: 2, unchanged: 1 } });
    const list = await c.get('/api/admin/college-imports');
    expect(list.body.meta.total).toBe(2);
  });
});

describe('budget search', () => {
  async function priced() {
    const p = await seedPlaces();
    // Per-year tuition: annual 1.5 L, total 6 L over four years.
    await makeCollege({ slug: 'yearly', location: p.noida._id, course: p.btech._id, tuitionPerYear: 150_000 });
    // Per-semester tuition: annual 2 x 1 L = 2 L, total 8 L.
    await makeCollege({ slug: 'semester', location: p.noida._id, course: p.btech._id, components: [{ key: 'tuition', amountMinor: rupees(100_000), frequency: 'per_semester' }] });
    // A single whole-course amount: total 5 L, no annual figure (not comparable per year).
    await makeCollege({ slug: 'lump', location: p.chennai._id, course: p.btech._id, components: [{ key: 'tuition', amountMinor: rupees(500_000), frequency: 'total_course' }] });
    // No published fee at all: never treated as zero.
    await makeCollege({ slug: 'unpriced', location: p.chennai._id, course: p.btech._id });
    return p;
  }
  const get = (qs: string) => request(app).get(`/api/colleges?course=btech-be&${qs.includes('sort=') ? '' : 'sort=name&'}${qs}`);

  it('matches the budget on the chosen basis and never treats a missing fee as zero', async () => {
    await priced();
    expect(slugsOf(await get(`feeBasis=total&maxBudget=${rupees(600_000)}`))).toEqual(['lump', 'yearly']);
    expect(slugsOf(await get(`feeBasis=annual&maxBudget=${rupees(150_000)}`))).toEqual(['yearly']);
    expect(slugsOf(await get(`feeBasis=annual&minBudget=${rupees(160_000)}&maxBudget=${rupees(250_000)}`))).toEqual(['semester']);
    expect(slugsOf(await get(`feeBasis=annual&maxBudget=0`))).toEqual([]);
    // Unverified (and not-comparable) colleges only when asked for, and flagged as such.
    const wide = await get(`feeBasis=annual&maxBudget=${rupees(150_000)}&includeUnverified=yes`);
    expect(slugsOf(wide)).toEqual(['lump', 'unpriced', 'yearly']);
    const status = Object.fromEntries(wide.body.data.map((x: { slug: string; fee: { status: string } }) => [x.slug, x.fee.status]));
    expect(status).toEqual({ lump: 'not_comparable', unpriced: 'not_verified', yearly: 'verified' });
  });

  it('sorts by fee on the chosen basis with unpriced colleges last', async () => {
    await priced();
    expect(slugsOf(await get('feeBasis=total&sort=fee_low'))).toEqual(['lump', 'yearly', 'semester', 'unpriced']);
    expect(slugsOf(await get('feeBasis=annual&sort=fee_low'))).toEqual(['yearly', 'semester', 'lump', 'unpriced']);
    const page = await get('feeBasis=annual&sort=fee_low&limit=2&page=2');
    expect(page.body.meta).toMatchObject({ total: 4, totalPages: 2, page: 2 });
    expect(slugsOf(page)).toEqual(['lump', 'unpriced']);
    const card = (await get('feeBasis=annual&q=yearly')).body.data[0];
    expect(card.fee).toMatchObject({ basis: 'annual', amountMinor: rupees(150_000), status: 'verified', academicYear: '2026-27' });
  });

  it('rejects invalid search parameters', async () => {
    for (const qs of ['minBudget=500&maxBudget=100', 'feeBasis=monthly', 'maxBudget=-1', 'ownership=public-ish', 'sort=random', 'page=0', 'limit=500', 'district=../etc', 'unknown=1']) {
      const res = await request(app).get(`/api/colleges?${qs}`);
      expect(res.status, qs).toBe(422);
    }
  });

  it('compares fees with the annual figure only where it is comparable', async () => {
    await priced();
    const res = await request(app).get('/api/colleges/compare?colleges=yearly,lump&course=btech-be');
    expect(res.status).toBe(200);
    const fee = (slug: string) => res.body.data.colleges.find((x: { slug: string }) => x.slug === slug).offering.fees[0];
    expect(fee('yearly')).toMatchObject({ annualOfficialMinor: rupees(150_000) });
    expect(fee('lump')).toMatchObject({ annualOfficialMinor: null });
  });
});

describe('college links and images', () => {
  it('returns only safe absolute website and https image URLs, and filters featured colleges', async () => {
    const p = await seedPlaces();
    const { college: good } = await makeCollege({ slug: 'good', location: p.noida._id, course: p.btech._id, featured: true });
    const { college: bad } = await makeCollege({ slug: 'bad', location: p.noida._id, course: p.btech._id });
    // Written straight to the database (bypassing admin validation) to prove the output check itself.
    await CollegeModel.updateOne({ _id: good._id }, { $set: { website: 'http://www.good.edu.in/', coverUrl: 'https://img.good.edu.in/campus.jpg', logoUrl: 'https://img.good.edu.in/logo.png' } });
    await CollegeModel.updateOne({ _id: bad._id }, { $set: { website: 'javascript:alert(1)', coverUrl: 'http://insecure.example.com/a.jpg', logoUrl: 'data:image/png;base64,AAAA' } });

    const cards = (await request(app).get('/api/colleges?sort=name')).body.data;
    expect(cards.find((x: { slug: string }) => x.slug === 'good')).toMatchObject({ website: 'http://www.good.edu.in/', coverUrl: 'https://img.good.edu.in/campus.jpg', logoUrl: 'https://img.good.edu.in/logo.png' });
    expect(cards.find((x: { slug: string }) => x.slug === 'bad')).toMatchObject({ website: null, coverUrl: null, logoUrl: null });
    expect((await request(app).get('/api/colleges/bad')).body.data).toMatchObject({ website: null, coverUrl: null });
    expect(slugsOf(await request(app).get('/api/colleges?featured=yes'))).toEqual(['good']);
    expect((await request(app).get('/api/colleges?featured=no')).status).toBe(422);

    // Admins may enter http or https websites, but never other schemes; images stay https.
    const { c } = await createAdmin();
    expect((await c.patch(`/api/admin/colleges/${bad._id}`, { website: 'http://www.bad.ac.in' })).status).toBe(200);
    for (const website of ['javascript:alert(1)', 'ftp://bad.ac.in', 'www.bad.ac.in', 'https://localhost']) {
      expect((await c.patch(`/api/admin/colleges/${bad._id}`, { website })).status, website).toBe(422);
    }
    expect((await c.patch(`/api/admin/colleges/${bad._id}`, { coverUrl: 'http://img.bad.ac.in/x.jpg' })).status).toBe(422);
  });
});
