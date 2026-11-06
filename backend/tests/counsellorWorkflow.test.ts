import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { CollegeCourseModel } from '../src/models/CollegeCourse.js';
import { EnquiryModel } from '../src/models/Enquiry.js';
import { checkEligibility } from '../src/services/eligibility.service.js';
import { sendFollowUpDigests } from '../src/services/counsellor.service.js';
import { processEmailQueue } from '../src/services/emailWorker.js';
import { enquiryWorld, profile, submitEnquiry } from './enquiryFixtures.js';
import { app, client, outbox, registerStudent, tokenFromEmail, useTestDb } from './helpers.js';

useTestDb();

const PASSWORD = 'Str0ng-pass-2026';
type World = Awaited<ReturnType<typeof enquiryWorld>>;

// An admin creates a counsellor; the counsellor sets a password from the emailed link and signs in.
async function makeCounsellor(w: World, email: string) {
  const created = await w.admin.c.post('/api/admin/team/counsellors', { name: `Counsellor ${email.split('@')[0]}`, email, mobile: '+91 98765 11111' });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  expect(created.body.data.role).toBe('counsellor');
  const c = client();
  expect((await c.post('/api/auth/set-password', { token: await tokenFromEmail(email, '/set-password'), password: PASSWORD })).status).toBe(200);
  expect((await c.post('/api/auth/login', { email, password: PASSWORD })).status).toBe(200);
  return { c, id: created.body.data.id as string };
}

describe('eligibility rules', () => {
  const student = { highestQualification: 'class_12', percentage: 82, marks: { class10: 90, class12: 72, graduation: null }, entranceExams: ['JEE Main'] };
  it('says eligible, potentially eligible or not eligible, with reasons, and never more', () => {
    expect(checkEligibility(student, { level: 'ug', minQualification: 'class_12', minPercentage: 60, entranceExams: ['JEE Main'] }).result).toBe('eligible');
    const near = checkEligibility(student, { level: 'ug', minQualification: 'class_12', minPercentage: 75, entranceExams: [] });
    expect(near.result).toBe('potentially_eligible');
    expect(near.reasons.join(' ')).toMatch(/just below/);
    expect(checkEligibility(student, { level: 'ug', minQualification: null, minPercentage: 90, entranceExams: [] }).result).toBe('not_eligible');
    expect(checkEligibility(student, { level: 'pg', minQualification: 'undergraduate', minPercentage: null, entranceExams: [] }).result).toBe('not_eligible');
    expect(checkEligibility(student, { level: 'ug', minQualification: null, minPercentage: null, entranceExams: ['BITSAT'] }).result).toBe('potentially_eligible');
    expect(checkEligibility({ ...student, marks: { class10: null, class12: null, graduation: null }, highestQualification: null, percentage: null }, { level: 'ug', minQualification: 'class_12', minPercentage: 60, entranceExams: [] }).result).toBe('potentially_eligible');
  });
});

describe('counsellors (phase 4)', () => {
  it('see only enquiries assigned to them, work them (status, notes, calls, follow-ups, recommendations) and never reassign', async () => {
    const w = await enquiryWorld();
    // Marks in the profile are snapshotted into the enquiry and used for eligibility.
    await w.student.c.put('/api/students/me/profile', { ...profile, marks: { class10: { percentage: 91 }, class12: { percentage: 82, stream: 'PCM' }, graduation: {} } });
    await CollegeCourseModel.updateMany({}, { $set: { minPercentage: 75, minQualification: 'class_12' } });
    const { id, reference } = await submitEnquiry(w);
    expect((await EnquiryModel.findById(id).lean())!.studentSnapshot?.marks).toMatchObject({ class10: 91, class12: 82 });

    const meera = await makeCounsellor(w, 'meera@example.com');
    const ravi = await makeCounsellor(w, 'ravi@example.com');
    expect((await w.admin.c.get('/api/admin/counsellors')).body.data.map((p: { email: string }) => p.email)).toEqual(expect.arrayContaining(['meera@example.com', 'ravi@example.com']));
    expect((await w.admin.c.patch(`/api/admin/enquiries/${id}`, { assignedTo: meera.id })).status).toBe(200);

    expect((await meera.c.get('/api/counsellor/enquiries')).body.data.map((e: { reference: string }) => e.reference)).toEqual([reference]);
    expect((await ravi.c.get('/api/counsellor/enquiries')).body.data).toHaveLength(0);
    expect((await ravi.c.get(`/api/counsellor/enquiries/${id}`)).status).toBe(404);
    expect((await ravi.c.post(`/api/counsellor/enquiries/${id}/notes`, { body: 'peek' })).status).toBe(404);
    expect((await meera.c.patch(`/api/counsellor/enquiries/${id}`, { assignedTo: ravi.id })).status).toBe(422);
    expect((await meera.c.get('/api/admin/enquiries')).status).toBe(403);

    const detail = (await meera.c.get(`/api/counsellor/enquiries/${id}`)).body.data;
    expect(detail.academics).toMatchObject({ highestQualification: 'class_12', marks: { class10: 91, class12: 82 } });
    expect(detail.eligibility[0]).toMatchObject({ collegeName: 'Alpha Institute', eligibility: 'eligible' });

    expect((await meera.c.post(`/api/counsellor/enquiries/${id}/contact-attempts`, { channel: 'whatsapp', outcome: 'reached', note: 'Spoke on WhatsApp' })).status).toBe(201);
    let s = await meera.c.post(`/api/counsellor/enquiries/${id}/status`, { fromStatus: 'CONTACTED', toStatus: 'ELIGIBILITY_CHECK' });
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    s = await meera.c.post(`/api/counsellor/enquiries/${id}/status`, { fromStatus: 'ELIGIBILITY_CHECK', toStatus: 'COUNSELLING_COMPLETED', studentMessage: 'We discussed your options.' });
    expect(s.body.data.status).toBe('COUNSELLING_COMPLETED');
    expect((await meera.c.post(`/api/counsellor/enquiries/${id}/status`, { fromStatus: 'COUNSELLING_COMPLETED', toStatus: 'ADMITTED' })).status).toBe(422);
    expect((await meera.c.post(`/api/counsellor/enquiries/${id}/notes`, { body: 'Prefers hostel' })).status).toBe(201);
    expect((await meera.c.patch(`/api/counsellor/enquiries/${id}`, { followUpAt: new Date(Date.now() - 86_400_000).toISOString() })).status).toBe(200);

    const offering = await CollegeCourseModel.findOne().lean();
    const rec = await meera.c.post(`/api/counsellor/enquiries/${id}/recommendations`, { offerings: [String(offering!._id)], note: 'A good fit for your marks.' });
    expect(rec.status, JSON.stringify(rec.body)).toBe(201);
    const mine = (await w.student.c.get(`/api/enquiries/${reference}`)).body.data;
    const shown = mine.timeline.find((t: { type: string }) => t.type === 'recommendation');
    expect(shown).toMatchObject({ body: 'A good fit for your marks.', recommendations: [expect.objectContaining({ collegeName: 'Alpha Institute', eligibility: 'eligible' })] });
    // Internal notes never reach the student.
    expect(JSON.stringify(mine)).not.toContain('Prefers hostel');

    // Admin: performance and daily reminders.
    const perf = (await w.admin.c.get('/api/admin/team/counsellors')).body.data.find((p: { email: string }) => p.email === 'meera@example.com');
    expect(perf.stats).toMatchObject({ assigned: 1, contacted: 1, overdue: 1, converted: 0 });
    outbox.length = 0;
    const nineIst = new Date();
    nineIst.setUTCHours(4, 0, 0, 0); // 09:30 IST
    expect(await sendFollowUpDigests(new Date(nineIst.getTime() + 30 * 60_000))).toBe(1);
    expect(await sendFollowUpDigests(new Date(nineIst.getTime() + 60 * 60_000))).toBe(1); // queued again but deduplicated
    await processEmailQueue();
    expect(outbox.filter((m) => m.to === 'meera@example.com' && /overdue/.test(m.subject))).toHaveLength(1);

    // Deactivation signs the counsellor out; the enquiry stays for reassignment.
    expect((await w.admin.c.post(`/api/admin/team/counsellors/${meera.id}/deactivate`)).body.data.openEnquiries).toBe(1);
    expect((await meera.c.get('/api/counsellor/summary')).status).toBe(401);
    expect((await client().post('/api/auth/login', { email: 'meera@example.com', password: PASSWORD })).status).toBe(401);
    expect((await w.admin.c.patch(`/api/admin/enquiries/${id}`, { assignedTo: meera.id })).status).toBe(422);
    expect((await w.admin.c.patch(`/api/admin/enquiries/${id}`, { assignedTo: ravi.id })).status).toBe(200);
  });

  it('new enquiries go to the least busy counsellor when automatic assignment is on', async () => {
    const w = await enquiryWorld();
    const a = await makeCounsellor(w, 'asha@example.com');
    const first = await submitEnquiry(w);
    expect((await EnquiryModel.findById(first.id).lean())!.assignedTo).toBeNull();
    expect((await w.admin.c.put('/api/admin/settings/site', { crm: { autoAssign: true } })).status).toBe(200);
    const s2 = await registerStudent();
    await s2.c.put('/api/students/me/profile', profile);
    const r = await s2.c.post('/api/enquiries', { idempotencyKey: crypto.randomUUID(), courses: [String(w.p.btech._id)], colleges: [String(w.college._id)], admissionYear: new Date().getFullYear() });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(String((await EnquiryModel.findOne({ reference: r.body.data.reference }).lean())!.assignedTo)).toBe(a.id);
    // The setting is never shown to visitors.
    expect((await request(app).get('/api/site')).body.data.crm).toBeUndefined();
  });

  it('only admins with the team permission manage counsellors', async () => {
    const w = await enquiryWorld();
    const { c: student } = await registerStudent();
    expect((await student.post('/api/admin/team/counsellors', { name: 'X Y', email: 'x@example.com' })).status).toBe(403);
    expect((await w.admin.c.post('/api/admin/team/counsellors', { name: 'X Y', email: w.admin.email })).status).toBe(409);
  });
});

describe('reports, social links and recommendations (phases 6-8)', () => {
  it('reports enquiries by counsellor, college and course with filters; the dashboard shows platform totals', async () => {
    const w = await enquiryWorld();
    const c = await makeCounsellor(w, 'kiran@example.com');
    const { id } = await submitEnquiry(w);
    await w.admin.c.patch(`/api/admin/enquiries/${id}`, { assignedTo: c.id });
    const r = (await w.admin.c.get('/api/admin/reports/enquiries')).body.data;
    expect(r.totals).toMatchObject({ total: 1, new: 1, pending: 1, converted: 0 });
    expect(r.byCounsellor[0]).toMatchObject({ name: 'Counsellor kiran', total: 1 });
    expect(r.byCollege[0]).toMatchObject({ name: 'Alpha Institute', total: 1 });
    expect(r.byCourse[0]).toMatchObject({ name: 'B.Tech / B.E.', total: 1 });
    expect((await w.admin.c.get(`/api/admin/reports/enquiries?counsellor=unassigned`)).body.data.totals.total).toBe(0);
    expect((await w.admin.c.get(`/api/admin/reports/enquiries?status=CLOSED`)).body.data.totals.total).toBe(0);
    const totals = (await w.admin.c.get('/api/admin/dashboard/summary')).body.data.totals;
    expect(totals).toMatchObject({ students: 1, activeColleges: 1, activeCourses: 1, counsellors: 1, enquiries: 1, new: 1, pending: 1 });
    expect((await c.c.get('/api/admin/reports/enquiries')).status).toBe(403);
  });

  it('Instagram and Facebook links are https pages of that network and appear on the public site', async () => {
    const w = await enquiryWorld();
    expect((await w.admin.c.put('/api/admin/settings/site', { organisation: { instagram: 'https://evil.example.com/x' } })).status).toBe(422);
    expect((await w.admin.c.put('/api/admin/settings/site', { organisation: { instagram: 'https://www.instagram.com/edupath', facebook: 'https://www.facebook.com/edupath', whatsapp: '+91 98765 43210' } })).status).toBe(200);
    expect((await request(app).get('/api/site')).body.data.organisation).toMatchObject({ instagram: 'https://www.instagram.com/edupath', facebook: 'https://www.facebook.com/edupath' });
  });

  it('student suggestions carry eligibility for the wanted course', async () => {
    const w = await enquiryWorld();
    await w.student.c.put('/api/students/me/profile', { ...profile, marks: { class10: {}, class12: { percentage: 50 }, graduation: {} } });
    await CollegeCourseModel.updateMany({}, { $set: { minPercentage: 75 } });
    await submitEnquiry(w);
    // The enquired college is suggested only when not shortlisted; check the eligibility shape on any item.
    const rec = (await w.student.c.get('/api/students/me/recommendations')).body.data;
    const alpha = rec.items.find((i: { slug: string }) => i.slug === 'alpha');
    expect(alpha.eligibility).toMatchObject({ result: 'not_eligible', course: 'B.Tech / B.E.' });
  });
});

describe('counsellor trend', () => {
  it('counts new enquiries assigned to me per India-time day, with empty days as 0', async () => {
    const w = await enquiryWorld();
    const me = await makeCounsellor(w, 'trend@example.com');
    const { id } = await submitEnquiry(w);
    expect((await w.admin.c.patch(`/api/admin/enquiries/${id}`, { assignedTo: me.id })).status).toBe(200);
    const res = await me.c.get('/api/counsellor/trend?days=7');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(7);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    expect(res.body.data[6]).toEqual({ day: today, count: 1 });
    expect(res.body.data.slice(0, 6).every((d: { count: number }) => d.count === 0)).toBe(true);
    expect((await me.c.get('/api/counsellor/trend?days=99')).status).toBe(422);
    // Students and visitors cannot read it.
    expect((await w.student.c.get('/api/counsellor/trend')).status).toBe(403);
    expect((await request(app).get('/api/counsellor/trend')).status).toBe(401);
  });
});
