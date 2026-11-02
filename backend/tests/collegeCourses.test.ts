import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { CollegeModel } from '../src/models/College.js';
import { CollegeCourseModel } from '../src/models/CollegeCourse.js';
import { ShortlistModel } from '../src/models/Shortlist.js';
import { StoredFileModel } from '../src/models/Support.js';
import { createInviteFromCli } from '../src/services/inviteCode.service.js';
import { makeCollege, seedPlaces } from './catalogFixtures.js';
import { ORIGIN, app, client, codeFromEmail, createAdmin, registerStudent, useTestDb } from './helpers.js';

useTestDb();

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 3)]);
const upload = (c: ReturnType<typeof client>, url: string, buf: Buffer, name: string) => c.agent.post(url).set('Origin', ORIGIN).attach('file', buf, name);

async function world() {
  const p = await seedPlaces();
  const { college, offering } = await makeCollege({ slug: 'alpha', name: 'Alpha Institute', location: p.noida._id, course: p.btech._id, tuitionPerYear: 150_000 });
  const admin = await createAdmin();
  return { p, college, offering, admin, id: String(college._id) };
}

describe('college management (phase 2)', () => {
  it('social links must be https pages of the right network; admission information and links show on the public page', async () => {
    const w = await world();
    const base = `/api/admin/colleges/${w.id}`;
    expect((await w.admin.c.patch(base, { social: { instagram: 'https://www.facebook.com/alpha' } })).status).toBe(422);
    expect((await w.admin.c.patch(base, { social: { instagram: 'http://instagram.com/alpha' } })).status).toBe(422);
    expect((await w.admin.c.patch(base, { social: { facebook: 'javascript:alert(1)' } })).status).toBe(422);
    const ok = await w.admin.c.patch(base, {
      social: { instagram: 'https://www.instagram.com/alpha', facebook: 'https://facebook.com/alpha', youtube: '', linkedin: 'https://in.linkedin.com/school/alpha'.replace('in.', ''), x: 'https://x.com/alpha' },
      admissionInfo: 'Counselling rounds in June and July.',
      contact: { phone: '+91 120 400 0000', email: 'admissions@alpha.example.com' },
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const pub = (await request(app).get('/api/colleges/alpha')).body.data;
    expect(pub.social).toMatchObject({ instagram: 'https://www.instagram.com/alpha', x: 'https://x.com/alpha' });
    expect(pub.admissionInfo).toBe('Counselling rounds in June and July.');
    expect(pub.contact).toMatchObject({ email: 'admissions@alpha.example.com' });
  });

  it('logo and brochure uploads are checked by content; old files are removed; brochures are served as PDFs only', async () => {
    const w = await world();
    expect((await upload(w.admin.c, `/api/admin/colleges/${w.id}/logo`, Buffer.from('<svg onload=alert(1)>'), 'logo.png')).status).toBe(415);
    const logo = await upload(w.admin.c, `/api/admin/colleges/${w.id}/logo`, PNG, 'logo.png');
    expect(logo.status, JSON.stringify(logo.body)).toBe(201);
    expect(logo.body.data.url).toMatch(/^\/api\/colleges\/images\/[a-f0-9]{24}$/);
    expect((await request(app).get('/api/colleges/alpha')).body.data.logoUrl).toBe(logo.body.data.url);
    const again = await upload(w.admin.c, `/api/admin/colleges/${w.id}/logo`, PNG, 'logo2.png');
    expect(await StoredFileModel.countDocuments({ kind: 'college_image' })).toBe(1);
    expect((await request(app).get(again.body.data.url)).status).toBe(200);

    expect((await upload(w.admin.c, `/api/admin/colleges/${w.id}/brochure`, PNG, 'brochure.pdf')).status).toBe(415);
    const br = await upload(w.admin.c, `/api/admin/colleges/${w.id}/brochure`, PDF, 'Alpha brochure.pdf');
    expect(br.status).toBe(201);
    const file = await request(app).get(br.body.data.url);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect((await request(app).get('/api/colleges/alpha')).body.data.brochureUrl).toBe(br.body.data.url);

    // Private student documents are never reachable through the public brochure route.
    const doc = await StoredFileModel.create({ owner: new mongoose.Types.ObjectId(), kind: 'document', key: `documents/${'a'.repeat(32)}.pdf`, originalName: 'marksheet.pdf', mime: 'application/pdf', size: 10, sha256: 'b'.repeat(64), uploadedBy: new mongoose.Types.ObjectId() });
    expect((await request(app).get(`/api/colleges/brochures/${doc._id}`)).status).toBe(404);

    expect((await w.admin.c.del(`/api/admin/colleges/${w.id}/logo`)).body.data.removed).toBe(true);
    expect((await CollegeModel.findById(w.id).lean())!.logoUrl).toBe('');
  });

  it('students see only active (published) colleges and active courses; publish and unpublish switch it', async () => {
    const w = await world();
    await CollegeCourseModel.create({ college: w.college._id, course: w.p.mba._id, durationMonths: 24, status: 'inactive' });
    let detail = (await request(app).get('/api/colleges/alpha')).body.data;
    expect(detail.offerings.map((o: { course: { slug: string } }) => o.course.slug)).toEqual(['btech-be']);

    expect((await w.admin.c.post(`/api/admin/colleges/${w.id}/archive`)).status).toBe(200);
    expect((await request(app).get('/api/colleges/alpha')).status).toBe(404);
    expect((await request(app).get('/api/courses/offerings')).body.data).toHaveLength(0);
    expect((await w.admin.c.post(`/api/admin/colleges/${w.id}/restore`)).status).toBe(200);
    expect((await request(app).get('/api/colleges/alpha')).status).toBe(404); // draft
    expect((await w.admin.c.post(`/api/admin/colleges/${w.id}/publish`)).status).toBe(200);
    detail = (await request(app).get('/api/colleges/alpha')).body.data;
    expect(detail.name).toBe('Alpha Institute');
  });

  it('only unused, unpublished colleges can be deleted, with their courses and files', async () => {
    const w = await world();
    expect((await w.admin.c.del(`/api/admin/colleges/${w.id}`)).body.error.code).toBe('COLLEGE_ACTIVE');
    await w.admin.c.post(`/api/admin/colleges/${w.id}/archive`);
    await ShortlistModel.create({ student: new mongoose.Types.ObjectId(), college: w.college._id });
    expect((await w.admin.c.del(`/api/admin/colleges/${w.id}`)).body.error.code).toBe('IN_USE');

    const draft = await w.admin.c.post('/api/admin/colleges', { name: 'Beta College', slug: 'beta', type: 'private' });
    const bid = draft.body.data.id as string;
    await w.admin.c.post(`/api/admin/colleges/${bid}/offerings`, { course: String(w.p.btech._id), durationMonths: 48 });
    await upload(w.admin.c, `/api/admin/colleges/${bid}/brochure`, PDF, 'beta.pdf');
    const del = await w.admin.c.del(`/api/admin/colleges/${bid}`);
    expect(del.status, JSON.stringify(del.body)).toBe(200);
    expect(await CollegeModel.exists({ _id: bid })).toBeNull();
    expect(await CollegeCourseModel.countDocuments({ college: bid })).toBe(0);
    expect(await StoredFileModel.countDocuments({ kind: 'brochure' })).toBe(0);
  });

  it('students and counsellors can never add, edit, upload to or delete colleges', async () => {
    const w = await world();
    const { c: student } = await registerStudent();
    const code = await createInviteFromCli({ role: 'counsellor' });
    await client().post('/api/auth/register', { name: 'Meera Nair', email: 'meera@example.com', mobile: '9876512345', password: 'Str0ng-pass-2026', accountType: 'counsellor', inviteCode: code.code });
    const counsellor = client();
    await counsellor.post('/api/auth/verify-otp', { email: 'meera@example.com', code: await codeFromEmail('meera@example.com') });
    expect((await counsellor.post('/api/auth/login', { email: 'meera@example.com', password: 'Str0ng-pass-2026' })).status).toBe(200);
    for (const c of [student, counsellor]) {
      expect((await c.post('/api/admin/colleges', { name: 'Hack', slug: 'hack', type: 'private' })).status).toBe(403);
      expect((await c.patch(`/api/admin/colleges/${w.id}`, { name: 'Hacked' })).status).toBe(403);
      expect((await c.del(`/api/admin/colleges/${w.id}`)).status).toBe(403);
      expect((await upload(c, `/api/admin/colleges/${w.id}/logo`, PNG, 'x.png')).status).toBe(403);
    }
    expect((await CollegeModel.findById(w.id).lean())!.name).toBe('Alpha Institute');
  });
});

describe('course management and browsing (phase 3)', () => {
  it('admins add courses with description, mode, minimum qualification, picture and brochure', async () => {
    const w = await world();
    expect((await w.admin.c.post(`/api/admin/colleges/${w.id}/offerings`, { course: String(w.p.mba._id), durationMonths: 24, mode: 'remote' })).status).toBe(422);
    const created = await w.admin.c.post(`/api/admin/colleges/${w.id}/offerings`, {
      course: String(w.p.mba._id),
      durationMonths: 24,
      description: 'Two-year MBA with marketing and finance tracks.',
      mode: 'hybrid',
      minQualification: 'undergraduate',
      minPercentage: 50,
      seats: 60,
      entranceExams: ['CAT', 'MAT'],
      applicationDeadline: '2027-03-31',
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const oid = created.body.data.id as string;
    expect(created.body.data).toMatchObject({ mode: 'hybrid', minQualification: 'undergraduate', description: expect.stringContaining('MBA') });
    expect((await upload(w.admin.c, `/api/admin/offerings/${oid}/image`, PNG, 'mba.png')).status).toBe(201);
    expect((await upload(w.admin.c, `/api/admin/offerings/${oid}/brochure`, PDF, 'mba.pdf')).status).toBe(201);
    const pub = (await request(app).get('/api/colleges/alpha')).body.data.offerings.find((o: { id: string }) => o.id === oid);
    expect(pub).toMatchObject({ mode: 'hybrid', minQualification: 'undergraduate', imageUrl: expect.stringMatching(/^\/api\/colleges\/images\//), brochureUrl: expect.stringMatching(/^\/api\/colleges\/brochures\//) });
  });

  it('students browse active courses by degree, place, fee, qualification and mode', async () => {
    const p = await seedPlaces();
    await makeCollege({ slug: 'noida-tech', name: 'Noida Tech', location: p.noida._id, course: p.btech._id, tuitionPerYear: 120_000 });
    const chennai = await makeCollege({ slug: 'chennai-biz', name: 'Chennai Business School', location: p.chennai._id, course: p.mba._id, months: 24, tuitionPerYear: 400_000 });
    await CollegeCourseModel.updateOne({ _id: chennai.offering._id }, { $set: { mode: 'online', minQualification: 'undergraduate' } });
    await makeCollege({ slug: 'hidden', name: 'Hidden Draft', status: 'draft', location: p.noida._id, course: p.btech._id, tuitionPerYear: 50_000 });
    const off = await makeCollege({ slug: 'closed', name: 'Closed Course College', location: p.noida._id, course: p.btech._id, tuitionPerYear: 60_000 });
    await CollegeCourseModel.updateOne({ _id: off.offering._id }, { $set: { status: 'inactive' } });

    const get = async (qs = '') => (await request(app).get(`/api/courses/offerings${qs}`)).body;
    const all = await get();
    expect(all.data.map((o: { college: { slug: string } }) => o.college.slug).sort()).toEqual(['chennai-biz', 'noida-tech']);
    expect((await get('?level=pg')).data.map((o: { course: { slug: string } }) => o.course.slug)).toEqual(['mba-pgdm']);
    expect((await get('?state=Uttar%20Pradesh')).data).toHaveLength(1);
    expect((await get('?city=Chennai')).data[0].college.name).toBe('Chennai Business School');
    expect((await get('?maxFee=200000')).data.map((o: { college: { slug: string } }) => o.college.slug)).toEqual(['noida-tech']);
    expect((await get('?qualification=class_12')).data.map((o: { college: { slug: string } }) => o.college.slug)).toEqual(['noida-tech']);
    expect((await get('?mode=online')).data).toHaveLength(1);
    expect((await get('?q=business')).data).toHaveLength(1);
    const byFee = (await get('?sort=fee')).data;
    expect(byFee[0].fee.yearlyMinor).toBeLessThan(byFee[1].fee.yearlyMinor);
    expect((await request(app).get('/api/courses/offerings?mode=remote')).status).toBe(422);
    expect((await request(app).get('/api/courses/offerings?state[$ne]=x')).status).toBe(422);
  });
});
