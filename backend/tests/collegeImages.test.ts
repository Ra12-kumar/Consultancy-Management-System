import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AuditLogModel } from '../src/models/AuditLog.js';
import { StoredFileModel } from '../src/models/Support.js';
import { makeCollege, seedPlaces } from './catalogFixtures.js';
import { ORIGIN, app, client, createAdmin, createLimitedAdmin, registerStudent, useTestDb } from './helpers.js';

useTestDb();

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
const upload = (c: ReturnType<typeof client>, method: 'post' | 'put', url: string, buf: Buffer, name: string, alt?: string) => {
  const r = c.agent[method](url).set('Origin', ORIGIN).attach('file', buf, name);
  return alt ? r.field('alt', alt) : r;
};

async function world() {
  const p = await seedPlaces();
  const { college } = await makeCollege({ slug: 'alpha', name: 'Alpha Institute', location: p.noida._id, course: p.btech._id, tuitionPerYear: 100_000 });
  const admin = await createAdmin();
  return { p, college, admin, id: String(college._id) };
}

describe('college photo gallery', () => {
  it('admins upload photos (checked by content), choose the primary one, reorder, replace and remove them', async () => {
    const w = await world();
    const base = `/api/admin/colleges/${w.id}/images`;
    // A script renamed to .png is refused by its content, whatever the name says.
    expect((await upload(w.admin.c, 'post', base, Buffer.from('<script>alert(1)</script>'), 'campus.png')).status).toBe(415);
    expect((await upload(w.admin.c, 'post', base, Buffer.from('MZ\x90\x00 executable'), 'setup.exe')).status).toBe(415);
    expect((await upload(w.admin.c, 'post', base, Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]), 'huge.png')).status).toBe(413);

    const first = await upload(w.admin.c, 'post', base, PNG, '../../etc/passwd.png', 'Main building');
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const second = await upload(w.admin.c, 'post', base, JPEG, 'library.jpg', 'Library');
    const [a, b] = second.body.data as Array<{ id: string; url: string; alt: string; primary: boolean }>;
    expect(a).toMatchObject({ alt: 'Main building', primary: true, url: expect.stringMatching(/^\/api\/colleges\/images\/[a-f0-9]{24}$/) });
    expect(b).toMatchObject({ alt: 'Library', primary: false });
    // Stored under a random name, never the client's.
    const stored = await StoredFileModel.findOne({ kind: 'college_image' }).lean();
    expect(stored!.key).toMatch(/^college_images\/[a-f0-9]{32}\.png$/);

    // Public cards and the detail page show the primary photo and the gallery.
    const card = (await request(app).get('/api/colleges?q=Alpha')).body.data[0];
    expect(card.imageUrl).toBe(a!.url);
    const pic = await request(app).get(a!.url);
    expect(pic.status).toBe(200);
    expect(pic.headers['content-type']).toBe('image/png');
    expect(pic.headers['x-content-type-options']).toBe('nosniff');

    const reordered = await w.admin.c.patch(base, { order: [b!.id, a!.id], primary: b!.id, alts: { [a!.id]: 'Front lawn' } });
    expect(reordered.status).toBe(200);
    expect(reordered.body.data.map((i: { id: string; primary: boolean; alt: string }) => [i.id, i.primary, i.alt])).toEqual([[b!.id, true, 'Library'], [a!.id, false, 'Front lawn']]);
    expect((await w.admin.c.patch(base, { order: [a!.id] })).status).toBe(422);

    const replaced = await upload(w.admin.c, 'put', `${base}/${b!.id}`, PNG, 'library-new.png');
    expect(replaced.status).toBe(200);
    expect(replaced.body.data[0]).toMatchObject({ id: b!.id, primary: true, alt: 'Library' });
    expect(replaced.body.data[0].url).not.toBe(b!.url);
    expect((await request(app).get(b!.url)).status).toBe(404); // the old file is gone

    const removed = await w.admin.c.del(`${base}/${b!.id}`);
    expect(removed.body.data).toEqual([expect.objectContaining({ id: a!.id, primary: true })]);
    expect(await StoredFileModel.countDocuments({ kind: 'college_image' })).toBe(1);
    expect(await AuditLogModel.countDocuments({ action: /^catalog\.college_image/ })).toBe(5);
  });

  it('only catalogue admins can change photos; other stored files are never served as college photos', async () => {
    const w = await world();
    const student = await registerStudent();
    const counsellor = await createLimitedAdmin(['enquiries.manage']);
    const base = `/api/admin/colleges/${w.id}/images`;
    expect((await upload(student.c, 'post', base, PNG, 'x.png')).status).toBe(403);
    expect((await upload(counsellor.c, 'post', base, PNG, 'x.png')).status).toBe(403);
    expect((await request(app).post(base).attach('file', PNG, 'x.png')).status).toBe(401);

    // A student's private profile photo is not reachable through the public image route.
    await student.c.agent.put('/api/students/me/photo').set('Origin', ORIGIN).attach('file', PNG, 'me.png');
    const photo = await StoredFileModel.findOne({ kind: 'photo' }).lean();
    expect((await request(app).get(`/api/colleges/images/${String(photo!._id)}`)).status).toBe(404);
    expect((await request(app).get('/api/colleges/images/not-an-id')).status).toBe(422);
  });

  it('limits a gallery to 12 photos', async () => {
    const w = await world();
    const base = `/api/admin/colleges/${w.id}/images`;
    for (let i = 0; i < 12; i += 1) expect((await upload(w.admin.c, 'post', base, PNG, `p${i}.png`)).status).toBe(201);
    const extra = await upload(w.admin.c, 'post', base, PNG, 'p13.png');
    expect(extra.status).toBe(422);
    expect(extra.body.error.code).toBe('TOO_MANY_IMAGES');
    expect(await StoredFileModel.countDocuments({ kind: 'college_image' })).toBe(12);
  });
});

describe('featured colleges', () => {
  it('admins choose the featured colleges and their order; the public list follows it', async () => {
    const w = await world();
    const { college: beta } = await makeCollege({ slug: 'beta', name: 'Beta College', location: w.p.chennai._id, course: w.p.btech._id, tuitionPerYear: 90_000 });
    const { college: gamma } = await makeCollege({ slug: 'gamma', name: 'Gamma University', location: w.p.chennai._id, course: w.p.btech._id, tuitionPerYear: 80_000 });
    const set = await w.admin.c.put('/api/admin/colleges/featured', { ids: [String(gamma._id), w.id] });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body.data.map((c: { name: string; rank: number }) => [c.name, c.rank])).toEqual([['Gamma University', 1], ['Alpha Institute', 2]]);
    const pub = (await request(app).get('/api/colleges?featured=yes')).body.data.map((c: { name: string }) => c.name);
    expect(pub).toEqual(['Gamma University', 'Alpha Institute']);
    const all = (await request(app).get('/api/colleges?sort=featured')).body.data.map((c: { name: string }) => c.name);
    expect(all).toEqual(['Gamma University', 'Alpha Institute', 'Beta College']);

    // Reordering replaces the list: Alpha moves up, Gamma is no longer featured.
    await w.admin.c.put('/api/admin/colleges/featured', { ids: [w.id, String(beta._id)] });
    expect((await request(app).get('/api/colleges?featured=yes')).body.data.map((c: { name: string }) => c.name)).toEqual(['Alpha Institute', 'Beta College']);
    expect((await w.admin.c.put('/api/admin/colleges/featured', { ids: [w.id, w.id] })).status).toBe(422);
    const student = await registerStudent();
    expect((await student.c.put('/api/admin/colleges/featured', { ids: [] })).status).toBe(403);
  });

  it('validates admission details and official links on colleges', async () => {
    const w = await world();
    const bad = await w.admin.c.patch(`/api/admin/colleges/${w.id}`, { applicationUrl: 'javascript:alert(1)', academicSession: 'next year' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual(['academicSession', 'applicationUrl']);
    const ok = await w.admin.c.patch(`/api/admin/colleges/${w.id}`, {
      applicationUrl: 'https://admissions.alpha.example.in/apply',
      eligibility: '10+2 with PCM, 60% aggregate',
      entranceExams: ['JEE Main'],
      facilities: ['Hostel', 'Library'],
      highlights: ['NAAC A grade'],
      academicSession: '2026-27',
      admissionDeadline: '2026-06-30T00:00:00.000Z',
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const detail = (await request(app).get('/api/colleges/alpha')).body.data;
    expect(detail).toMatchObject({ applicationUrl: 'https://admissions.alpha.example.in/apply', eligibility: '10+2 with PCM, 60% aggregate', entranceExams: ['JEE Main'], facilities: ['Hostel', 'Library'], highlights: ['NAAC A grade'], academicSession: '2026-27', gallery: [] });
  });
});
