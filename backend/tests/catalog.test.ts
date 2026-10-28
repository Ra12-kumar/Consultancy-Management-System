import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AuditLogModel } from '../src/models/AuditLog.js';
import { CollegeModel } from '../src/models/College.js';
import { CollegeFeeModel } from '../src/models/CollegeFee.js';
import { CourseModel } from '../src/models/Course.js';
import { LocationModel } from '../src/models/Location.js';
import { ShortlistModel } from '../src/models/Shortlist.js';
import { removeSampleColleges } from '../src/services/catalog.service.js';
import { seedCatalog } from '../../database/seeds/catalog-data.js';
import { makeCollege, rupees, seedPlaces } from './catalogFixtures.js';
import { app, createAdmin, registerStudent, useTestDb } from './helpers.js';

useTestDb();

const slugs = (res: request.Response) => res.body.data.map((c: { slug: string }) => c.slug);

describe('access to catalogue administration', () => {
  it('anonymous users get 401 and students 403 on every admin catalogue and fee route', async () => {
    const id = '0123456789abcdef01234567';
    const routes: Array<['get' | 'post' | 'patch' | 'put' | 'del', string]> = [
      ['get', '/api/admin/colleges'],
      ['post', '/api/admin/colleges'],
      ['get', `/api/admin/colleges/${id}`],
      ['patch', `/api/admin/colleges/${id}`],
      ['post', `/api/admin/colleges/${id}/publish`],
      ['post', `/api/admin/colleges/${id}/offerings`],
      ['get', '/api/admin/courses'],
      ['post', '/api/admin/courses'],
      ['get', '/api/admin/locations'],
      ['post', '/api/admin/locations'],
      ['get', `/api/admin/offerings/${id}/fees`],
      ['post', `/api/admin/offerings/${id}/fees`],
      ['put', `/api/admin/fees/${id}`],
      ['post', `/api/admin/fees/${id}/publish`],
      ['post', '/api/admin/fees/preview'],
      ['del', `/api/admin/offerings/${id}`],
    ];
    const { c } = await registerStudent();
    for (const [method, url] of routes) {
      const anon = method === 'del' ? request(app).delete(url) : request(app)[method](url);
      expect((await anon.set('Origin', 'http://localhost:3000')).status, `anon ${method} ${url}`).toBe(401);
      const r = method === 'get' ? await c.get(url) : await c[method](url, {});
      expect(r.status, `student ${method} ${url}`).toBe(403);
    }
  });
});

describe('admin catalogue management', () => {
  it('creates a draft college (never public), adds a course, and publishes only when the essentials are present', async () => {
    const p = await seedPlaces();
    const { c } = await createAdmin();
    // Derived and protected fields are refused.
    expect((await c.post('/api/admin/colleges', { name: 'Gamma', slug: 'gamma', type: 'private', isSample: true })).status).toBe(422);
    expect((await c.post('/api/admin/colleges', { name: 'Gamma', slug: 'gamma', type: 'private', feeSummary: {} })).status).toBe(422);
    expect((await c.post('/api/admin/colleges', { name: 'Gamma', slug: 'gamma', type: 'private', logoUrl: 'http://insecure.example/logo.png' })).status).toBe(422);

    const created = await c.post('/api/admin/colleges', { name: 'Gamma Institute', slug: 'gamma', type: 'private' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.data.id;
    expect(created.body.data).toMatchObject({ status: 'draft', isSample: false });
    expect((await request(app).get('/api/colleges/gamma')).status).toBe(404);
    expect((await c.post('/api/admin/colleges', { name: 'Again', slug: 'gamma', type: 'private' })).body.error.code).toBe('SLUG_IN_USE');

    const notReady = await c.post(`/api/admin/colleges/${id}/publish`);
    expect(notReady.status).toBe(422);
    expect(notReady.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual(['lastVerifiedAt', 'location']);

    // Only a city can be the college's location.
    expect((await c.patch(`/api/admin/colleges/${id}`, { location: String(p.ncr._id) })).status).toBe(422);
    const updated = await c.patch(`/api/admin/colleges/${id}`, { location: String(p.noida._id), lastVerifiedAt: '2026-06-15', verificationSource: 'College website' });
    expect(updated.body.data).toMatchObject({ city: 'Noida', state: 'Uttar Pradesh', name: 'Gamma Institute' });
    const offering = await c.post(`/api/admin/colleges/${id}/offerings`, { course: String(p.btech._id), durationMonths: 48, minPercentage: 60 });
    expect(offering.status, JSON.stringify(offering.body)).toBe(201);
    expect((await c.post(`/api/admin/colleges/${id}/offerings`, { course: String(p.btech._id), durationMonths: 48 })).status).toBe(409);

    expect((await c.post(`/api/admin/colleges/${id}/publish`)).body.data.status).toBe('published');
    const pub = await request(app).get('/api/colleges/gamma');
    expect(pub.status).toBe(200);
    expect(pub.body.data).toMatchObject({ name: 'Gamma Institute', city: 'Noida', isSample: false });
    expect(pub.body.data.offerings[0]).toMatchObject({ minPercentage: 60, course: { slug: 'btech-be' } });

    await c.post(`/api/admin/colleges/${id}/archive`);
    expect((await request(app).get('/api/colleges/gamma')).status).toBe(404);
    expect(await AuditLogModel.countDocuments({ action: { $regex: /^catalog\.college_/ } })).toBe(4);
  });

  it('manages courses and locations, refusing deletes that are in use and location loops', async () => {
    const p = await seedPlaces();
    await makeCollege({ slug: 'alpha', location: p.noida._id, course: p.btech._id });
    const { c } = await createAdmin();
    const course = await c.post('/api/admin/courses', { name: 'B.Arch', slug: 'barch', level: 'ug', category: 'Architecture', typicalDurationMonths: 60 });
    expect(course.status).toBe(201);
    expect((await c.del(`/api/admin/courses/${p.btech._id}`)).body.error.code).toBe('IN_USE');
    expect((await c.patch(`/api/admin/courses/${course.body.data.id}`, { isActive: false })).body.data.isActive).toBe(false);
    expect((await request(app).get('/api/courses')).body.data.map((x: { slug: string }) => x.slug)).not.toContain('barch');
    expect((await c.del(`/api/admin/courses/${course.body.data.id}`)).status).toBe(200);

    expect((await c.del(`/api/admin/locations/${p.ncr._id}`)).body.error.code).toBe('IN_USE');
    expect((await c.patch(`/api/admin/locations/${p.north._id}`, { parents: [String(p.noida._id)] })).status).toBe(422);
    // Moving Noida out of Delhi NCR updates where its colleges are found.
    await c.patch(`/api/admin/locations/${p.noida._id}`, { parents: [String(p.up._id)] });
    expect(slugs(await request(app).get('/api/colleges?location=delhi-ncr'))).toEqual([]);
    expect(slugs(await request(app).get('/api/colleges?location=north-india'))).toEqual(['alpha']);
  });
});

describe('public directory', () => {
  async function directory() {
    const p = await seedPlaces();
    await makeCollege({ slug: 'noida-tech', name: 'Noida Tech', location: p.noida._id, course: p.btech._id, minPercentage: 60, tuitionPerYear: 150_000, featured: true });
    await makeCollege({ slug: 'chennai-eng', name: 'Chennai Engineering', location: p.chennai._id, course: p.btech._id, minPercentage: 45, tuitionPerYear: 60_000, type: 'government' });
    await makeCollege({ slug: 'chennai-biz', name: 'Chennai Business School', location: p.chennai._id, course: p.mba._id, months: 24, tuitionPerYear: 250_000 });
    await makeCollege({ slug: 'no-fee', name: 'Alpha Unpriced', location: p.chennai._id, course: p.mba._id, months: 24 });
    await makeCollege({ slug: 'hidden', name: 'Hidden Draft', status: 'draft', location: p.noida._id, course: p.btech._id, tuitionPerYear: 1 });
    return p;
  }

  it('never shows drafts; filters by region, course, type, text, eligibility and budget', async () => {
    await directory();
    expect(slugs(await request(app).get('/api/colleges?sort=name'))).toEqual(['no-fee', 'chennai-biz', 'chennai-eng', 'noida-tech']);
    // A region finds colleges in every city under it.
    expect(slugs(await request(app).get('/api/colleges?location=delhi-ncr'))).toEqual(['noida-tech']);
    expect(slugs(await request(app).get('/api/colleges?location=south-india&sort=name'))).toEqual(['no-fee', 'chennai-biz', 'chennai-eng']);
    expect(slugs(await request(app).get('/api/colleges?course=btech-be&sort=name'))).toEqual(['chennai-eng', 'noida-tech']);
    expect(slugs(await request(app).get('/api/colleges?type=government'))).toEqual(['chennai-eng']);
    expect(slugs(await request(app).get('/api/colleges?q=business'))).toEqual(['chennai-biz']);
    // Course names match too, including without punctuation.
    expect(slugs(await request(app).get('/api/colleges?q=btech&sort=name'))).toEqual(['chennai-eng', 'noida-tech']);
    // 50% qualifies for Chennai Engineering (45%) but not Noida Tech (60%).
    expect(slugs(await request(app).get('/api/colleges?course=btech-be&percentage=50'))).toEqual(['chennai-eng']);
    // Budget compares published official totals: 60,000 x 4 years = 2.4 lakh.
    expect(slugs(await request(app).get(`/api/colleges?maxBudget=${rupees(300_000)}`))).toEqual(['chennai-eng']);
    expect(slugs(await request(app).get(`/api/colleges?maxBudget=${rupees(600_000)}&sort=fee_low`))).toEqual(['chennai-eng', 'chennai-biz', 'noida-tech']);
    expect(slugs(await request(app).get('/api/colleges?location=nowhere'))).toEqual([]);
    expect((await request(app).get('/api/colleges/hidden')).status).toBe(404);
  });

  it('sorts (unpriced colleges last by fee) and paginates', async () => {
    await directory();
    expect(slugs(await request(app).get('/api/colleges?sort=fee_low'))).toEqual(['chennai-eng', 'chennai-biz', 'noida-tech', 'no-fee']);
    expect(slugs(await request(app).get('/api/colleges?sort=fee_high'))).toEqual(['noida-tech', 'chennai-biz', 'chennai-eng', 'no-fee']);
    expect(slugs(await request(app).get('/api/colleges'))[0]).toBe('noida-tech');
    const page2 = await request(app).get('/api/colleges?sort=name&limit=3&page=2');
    expect(slugs(page2)).toEqual(['noida-tech']);
    expect(page2.body.meta).toMatchObject({ total: 4, totalPages: 2, page: 2 });
    expect((await request(app).get('/api/colleges?sort=random')).status).toBe(422);
  });

  it('compares 2-4 published colleges, for one course, excluding unpublished ones', async () => {
    await directory();
    const r = await request(app).get('/api/colleges/compare?colleges=noida-tech,chennai-eng,hidden&course=btech-be');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.colleges.map((c: { slug: string }) => c.slug)).toEqual(['noida-tech', 'chennai-eng']);
    expect(r.body.data.missing).toEqual(['hidden']);
    expect(r.body.data.colleges[1].offering.fees[0].breakdown.officialTotalMinor).toBe(rupees(240_000));
    expect((await request(app).get('/api/colleges/compare?colleges=noida-tech')).status).toBe(422);
    expect((await request(app).get('/api/colleges/compare?colleges=a,b,c,d,e')).status).toBe(422);
    expect((await request(app).get('/api/colleges/compare?colleges=noida-tech,hidden')).status).toBe(404);
  });
});

describe('sample data', () => {
  it('seeds labelled fictional colleges with published fees, and removal deletes only samples', async () => {
    const added = await seedCatalog();
    expect(added.colleges).toBeGreaterThanOrEqual(8);
    // Seeding again adds nothing (non-destructive, idempotent).
    expect(await seedCatalog()).toMatchObject({ locations: 0, courses: 0, colleges: 0, offerings: 0, fees: 0 });
    const samples = await CollegeModel.find({ isSample: true }).lean();
    expect(samples.every((c) => c.name.startsWith('Sample ') && c.accreditations.length === 0 && c.lastVerifiedAt === null)).toBe(true);
    const list = await request(app).get('/api/colleges?location=delhi-ncr');
    expect(list.body.meta.hasSamples).toBe(true);
    expect(list.body.data.length).toBeGreaterThan(0);
    expect(list.body.data.every((c: { isSample: boolean; feeFromMinor: number }) => c.isSample && c.feeFromMinor > 0)).toBe(true);

    // A real college and a student's shortlist of a sample.
    const ncr = await LocationModel.findOne({ slug: 'noida' }).lean();
    const btech = await CourseModel.findOne({ slug: 'btech-be' }).lean();
    await makeCollege({ slug: 'real-college', location: ncr!._id, course: btech!._id, tuitionPerYear: 100_000 });
    const s = await registerStudent();
    await s.c.post('/api/students/me/shortlist', { collegeId: String(samples[0]!._id) });

    const removed = await removeSampleColleges();
    expect(removed.colleges).toBe(samples.length);
    expect(await CollegeModel.countDocuments({ isSample: true })).toBe(0);
    expect(await CollegeModel.exists({ slug: 'real-college' })).toBeTruthy();
    expect(await CollegeFeeModel.countDocuments()).toBe(1);
    expect(await ShortlistModel.countDocuments()).toBe(0);
    expect(await LocationModel.countDocuments()).toBeGreaterThan(10);
  });
});
