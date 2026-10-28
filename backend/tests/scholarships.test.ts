import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ScholarshipApplicationModel, ScholarshipModel } from '../src/models/Scholarship.js';
import { removeSampleColleges } from '../src/services/catalog.service.js';
import { processEmailQueue } from '../src/services/emailWorker.js';
import { checkEligibility } from '../src/services/scholarshipEligibility.js';
import { seedCatalog } from '../../database/seeds/catalog-data.js';
import { rupees } from './catalogFixtures.js';
import { enquiryWorld } from './enquiryFixtures.js';
import { app, createLimitedAdmin, outbox, registerStudent, useTestDb } from './helpers.js';

const none = { courses: [], minPercentage: null, maxFamilyIncomeMinor: null, states: [], categories: [], genders: [] };
const facts = { courses: [], percentage: null, familyIncomeMinor: null, state: null, category: null, gender: null };

describe('preliminary eligibility', () => {
  it('passes, fails, or asks for review when facts are missing', () => {
    const rules = { ...none, minPercentage: 80, maxFamilyIncomeMinor: rupees(600_000), categories: ['sc', 'st'] };
    expect(checkEligibility(rules, { ...facts, percentage: 85, familyIncomeMinor: rupees(500_000), category: 'sc' }).result).toBe('likely_eligible');
    const low = checkEligibility(rules, { ...facts, percentage: 70, familyIncomeMinor: rupees(500_000), category: 'sc' });
    expect(low.result).toBe('not_eligible');
    expect(low.reasons.find((r) => r.rule === 'percentage')).toMatchObject({ ok: false, message: 'Needs at least 80% (you have 70%)' });
    const unknown = checkEligibility(rules, { ...facts, percentage: 90 });
    expect(unknown.result).toBe('needs_review');
    expect(unknown.reasons.filter((r) => r.ok === null).map((r) => r.rule)).toEqual(['income', 'category']);
    expect(checkEligibility(none, facts).result).toBe('likely_eligible');
    expect(checkEligibility(none, facts, { deadline: new Date('2020-01-01') }).result).toBe('not_eligible');
  });
});

describe('scholarships (API)', () => {
  useTestDb();

  async function world() {
    const w = await enquiryWorld();
    const body = {
      name: 'Alpha Merit Scholarship',
      slug: 'alpha-merit',
      providerType: 'college',
      college: String(w.college._id),
      benefit: { type: 'tuition_percent', value: 25, maxMinor: rupees(50_000) },
      eligibility: { courses: [String(w.p.btech._id)], minPercentage: 80, maxFamilyIncomeMinor: rupees(800_000) },
      documentsRequired: ['Marksheet'],
      applicationDeadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    };
    const created = await w.admin.c.post('/api/admin/scholarships', body);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    return { ...w, sid: created.body.data.id as string };
  }

  it('admins create drafts and publish only complete scholarships; the public sees published ones only', async () => {
    const w = await world();
    expect((await request(app).get('/api/scholarships/alpha-merit')).status).toBe(404);
    const notReady = await w.admin.c.post(`/api/admin/scholarships/${w.sid}/publish`);
    expect(notReady.body.error).toMatchObject({ code: 'NOT_READY', details: [{ field: 'lastVerifiedAt' }] });
    await w.admin.c.patch(`/api/admin/scholarships/${w.sid}`, { lastVerifiedAt: '2026-10-01' });
    expect((await w.admin.c.post(`/api/admin/scholarships/${w.sid}/publish`)).body.data.status).toBe('published');
    // Government schemes need their official page.
    const gov = await w.admin.c.post('/api/admin/scholarships', { name: 'State Scheme', slug: 'state-scheme', providerType: 'government', benefit: { type: 'other' }, lastVerifiedAt: '2026-10-01' });
    expect((await w.admin.c.post(`/api/admin/scholarships/${gov.body.data.id}/publish`)).body.error.details[0].field).toBe('officialUrl');
    expect((await w.admin.c.post('/api/admin/scholarships', { name: 'Bad', slug: 'bad', providerType: 'government', benefit: { type: 'other' }, officialUrl: 'http://insecure.example' })).status).toBe(422);

    const pub = await request(app).get('/api/scholarships?course=btech-be');
    expect(pub.body.data.map((s: { slug: string }) => s.slug)).toEqual(['alpha-merit']);
    expect(pub.body.data[0]).toMatchObject({ providerName: 'Alpha Institute', open: true, eligibility: { minPercentage: 80, courses: [{ slug: 'btech-be' }] } });
    expect((await request(app).get('/api/scholarships?course=mba-pgdm')).body.data).toEqual([]);
    // The college directory can filter colleges that offer scholarships.
    expect((await request(app).get('/api/colleges?scholarship=yes')).body.data.map((c: { slug: string }) => c.slug)).toEqual(['alpha']);
  });

  it('students get a preliminary check from their profile and declared facts, then apply once', async () => {
    const w = await world();
    await w.admin.c.patch(`/api/admin/scholarships/${w.sid}`, { lastVerifiedAt: '2026-10-01' });
    await w.admin.c.post(`/api/admin/scholarships/${w.sid}/publish`);
    // Profile: 82% (fixture). No course or income declared yet.
    const first = (await w.student.c.get('/api/scholarships/alpha-merit/eligibility')).body.data;
    expect(first).toMatchObject({ preliminary: true, facts: { percentage: 82 } });
    expect(first.results[0].result).toBe('needs_review');
    const ok = (await w.student.c.get(`/api/scholarships/alpha-merit/eligibility?familyIncomeMinor=${rupees(500_000)}&course=${w.p.btech._id}`)).body.data;
    expect(ok.results[0].result).toBe('likely_eligible');
    const tooRich = await w.student.c.post('/api/scholarship-applications', { scholarship: w.sid, familyIncomeMinor: rupees(900_000), course: String(w.p.btech._id) });
    expect(tooRich.status).toBe(422);
    expect(tooRich.body.error.code).toBe('NOT_ELIGIBLE');

    const applied = await w.student.c.post('/api/scholarship-applications', { scholarship: w.sid, familyIncomeMinor: rupees(500_000), course: String(w.p.btech._id), statement: 'First in family to attend college' });
    expect(applied.status, JSON.stringify(applied.body)).toBe(201);
    expect(applied.body.data).toMatchObject({ status: 'submitted', preliminary: { result: 'likely_eligible' } });
    expect(applied.body.data.reference).toMatch(/^SCH-\d{4}-\d{6}$/);
    expect((await w.student.c.post('/api/scholarship-applications', { scholarship: w.sid, familyIncomeMinor: rupees(500_000), course: String(w.p.btech._id) })).body.error.code).toBe('ALREADY_APPLIED');
    // Unverified students cannot apply; students cannot pick the status.
    const unverified = await registerStudent({ verify: false, name: 'Neha Verma' });
    expect((await unverified.c.post('/api/scholarship-applications', { scholarship: w.sid })).status).toBe(403);
    expect((await w.student.c.post('/api/scholarship-applications', { scholarship: w.sid, status: 'approved' })).status).toBe(422);
    await processEmailQueue();
    expect(outbox.find((m) => m.to === w.student.email && m.subject.includes(applied.body.data.reference))).toBeTruthy();
    expect(outbox.find((m) => m.to === w.admin.email && m.subject.startsWith('New scholarship application'))).toBeTruthy();
  });

  it('review needs scholarships.manage, decisions need scholarships.approve; students see only their own, without internal notes', async () => {
    const w = await world();
    await w.admin.c.patch(`/api/admin/scholarships/${w.sid}`, { lastVerifiedAt: '2026-10-01' });
    await w.admin.c.post(`/api/admin/scholarships/${w.sid}/publish`);
    const applied = await w.student.c.post('/api/scholarship-applications', { scholarship: w.sid, familyIncomeMinor: rupees(500_000), course: String(w.p.btech._id) });
    const appId = (await ScholarshipApplicationModel.findOne({ reference: applied.body.data.reference }).lean())!._id;
    const reviewer = await createLimitedAdmin(['scholarships.manage']);
    const outsider = await createLimitedAdmin(['enquiries.manage']);

    expect((await outsider.c.get('/api/admin/scholarship-applications')).status).toBe(403);
    expect((await w.student.c.get('/api/admin/scholarship-applications')).status).toBe(403);
    expect((await reviewer.c.post(`/api/admin/scholarship-applications/${appId}/review`, { status: 'documents_pending', note: 'Please share your income certificate', internalNote: 'SCH-INTERNAL-SECRET' })).body.data.status).toBe('documents_pending');
    expect((await reviewer.c.post(`/api/admin/scholarship-applications/${appId}/decision`, { decision: 'approved', note: 'Well done' })).status).toBe(403);
    const decided = await w.admin.c.post(`/api/admin/scholarship-applications/${appId}/decision`, { decision: 'approved', note: 'Approved for 2026-27', awardMinor: rupees(50_000) });
    expect(decided.body.data).toMatchObject({ status: 'approved', decisionBy: w.admin.id });
    expect((await w.admin.c.post(`/api/admin/scholarship-applications/${appId}/decision`, { decision: 'rejected', note: 'Changed mind' })).body.error.code).toBe('INVALID_TRANSITION');

    const mine = await w.student.c.get('/api/scholarship-applications');
    expect(mine.body.data[0]).toMatchObject({ status: 'approved', decision: { awardMinor: rupees(50_000), note: 'Approved for 2026-27' } });
    expect(mine.body.data[0].history.map((h: { status: string }) => h.status)).toEqual(['submitted', 'documents_pending', 'approved']);
    expect(JSON.stringify(mine.body)).not.toContain('SCH-INTERNAL-SECRET');
    const other = await registerStudent({ name: 'Arjun Mehta' });
    expect((await other.c.get('/api/scholarship-applications')).body.data).toEqual([]);
    expect((await other.c.post(`/api/scholarship-applications/${applied.body.data.reference}/withdraw`)).status).toBe(404);
    expect((await w.admin.c.get('/api/admin/dashboard/summary')).body.data.scholarships).toMatchObject({ published: 1, applications: { approved: 1 } });
    await processEmailQueue();
    expect(outbox.find((m) => m.to === w.student.email && m.subject.startsWith('Scholarship approved'))).toBeTruthy();
    expect(outbox.some((m) => m.text.includes('SCH-INTERNAL-SECRET'))).toBe(false);
  });

  it('sample scholarships are seeded labelled and removed with the sample colleges', async () => {
    await seedCatalog();
    const samples = await ScholarshipModel.find({ isSample: true }).lean();
    expect(samples.length).toBe(4);
    expect(new Set(samples.map((s) => s.providerType))).toEqual(new Set(['college', 'consultancy', 'government']));
    expect(samples.every((s) => s.name.startsWith('Sample ') && s.lastVerifiedAt === null)).toBe(true);
    expect((await request(app).get('/api/scholarships')).body.data.every((s: { isSample: boolean }) => s.isSample)).toBe(true);
    const removed = await removeSampleColleges();
    expect(removed.scholarships).toBe(4);
    expect(await ScholarshipModel.countDocuments()).toBe(0);
  });
});
