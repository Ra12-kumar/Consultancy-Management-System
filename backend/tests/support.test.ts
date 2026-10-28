import fs from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';
import { AuditLogModel } from '../src/models/AuditLog.js';
import { EnquiryEventModel, EnquiryModel } from '../src/models/Enquiry.js';
import { StudentProfileModel } from '../src/models/StudentProfile.js';
import { FeedbackModel, StoredFileModel } from '../src/models/Support.js';
import { UserModel } from '../src/models/User.js';
import { csvCell } from '../src/services/reports.service.js';
import { submitEnquiry, enquiryWorld } from './enquiryFixtures.js';
import { ORIGIN, PASSWORD, app, client, createLimitedAdmin, registerStudent, useTestDb } from './helpers.js';

useTestDb();
afterAll(async () => {
  // Only the dedicated test upload folder is removed.
  expect(env.uploadDir).toMatch(/test-uploads$/);
  await fs.rm(env.uploadDir, { recursive: true, force: true });
});

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const PDF = Buffer.from('%PDF-1.4\n% test document\n%%EOF\n');
const upload = (c: ReturnType<typeof client>, method: 'put' | 'post', url: string, buf: Buffer, name: string) => c.agent[method](url).set('Origin', ORIGIN).attach('file', buf, name);

describe('private uploads', () => {
  it('profile photos: content-checked, size-limited, readable only by the owner and permitted admins', async () => {
    const s = await registerStudent();
    const fake = await upload(s.c, 'put', '/api/students/me/photo', Buffer.from('<script>alert(1)</script>'), 'photo.png');
    expect(fake.status).toBe(415);
    expect((await upload(s.c, 'put', '/api/students/me/photo', Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]), 'big.png')).status).toBe(413);
    const ok = await upload(s.c, 'put', '/api/students/me/photo', PNG, 'me.png');
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const url = ok.body.data.photoUrl as string;
    expect(url).toMatch(/^\/api\/files\/[a-f0-9]{24}$/);
    const own = await s.c.get(url);
    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toBe('image/png');
    expect(own.headers['cache-control']).toContain('no-store');

    const other = await registerStudent({ name: 'Arjun Mehta' });
    expect((await other.c.get(url)).status).toBe(404);
    expect((await request(app).get(url)).status).toBe(401);
    expect((await (await createLimitedAdmin(['students.read'])).c.get(url)).status).toBe(200);
    expect((await (await createLimitedAdmin(['enquiries.manage'])).c.get(url)).status).toBe(404);

    // Replacing removes the old file from disk.
    const first = await StoredFileModel.findOne().lean();
    await upload(s.c, 'put', '/api/students/me/photo', PNG, 'new.png');
    await expect(fs.access(path.join(env.uploadDir, first!.key))).rejects.toThrow();
    expect(await StoredFileModel.countDocuments()).toBe(1);
  });

  it('students upload requested documents for their own enquiry; counsellors can open them', async () => {
    const w = await enquiryWorld();
    const { reference, id } = await submitEnquiry(w);
    const docs = await w.admin.c.post(`/api/admin/enquiries/${id}/documents`, { names: ['Class 12 marksheet'] });
    const docId = docs.body.data.documents[0].id;
    const url = `/api/enquiries/${reference}/documents/${docId}/files`;
    const other = await registerStudent({ name: 'Arjun Mehta' });
    expect((await upload(other.c, 'post', url, PDF, 'x.pdf')).status).toBe(404);
    expect((await upload(w.student.c, 'post', url, Buffer.from('MZ\x90\x00 not a pdf'), 'marks.pdf')).status).toBe(415);
    const ok = await upload(w.student.c, 'post', url, PDF, 'marks sheet.pdf');
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const mine = (await w.student.c.get(`/api/enquiries/${reference}`)).body.data;
    expect(mine.documents[0].files).toHaveLength(1);
    const file = await w.admin.c.get(ok.body.data.url);
    expect(file.status).toBe(200);
    expect(file.headers['content-disposition']).toContain('attachment');
    // Closed documents take no more files.
    await w.admin.c.patch(`/api/admin/enquiries/${id}/documents/${docId}`, { status: 'received' });
    expect((await upload(w.student.c, 'post', url, PDF, 'again.pdf')).body.error.code).toBe('DOCUMENT_CLOSED');
  });
});

describe('feedback and testimonials', () => {
  it('only consented, admin-approved feedback is published, as first name and city', async () => {
    const w = await enquiryWorld();
    const f = await w.student.c.post('/api/feedback', { rating: 5, category: 'counselling', message: 'My counsellor explained every option clearly.', publishConsent: false });
    expect(f.status, JSON.stringify(f.body)).toBe(201);
    const fid = f.body.data.id;
    const manager = await createLimitedAdmin(['feedback.manage']);
    expect((await w.student.c.get('/api/admin/feedback')).status).toBe(403);
    expect((await manager.c.post(`/api/admin/feedback/${fid}/testimonial`, { decision: 'approved' })).body.error.code).toBe('NO_CONSENT');
    await w.student.c.patch(`/api/feedback/${fid}/consent`, { publishConsent: true });
    expect((await manager.c.get('/api/admin/feedback?testimonial=candidates')).body.meta.total).toBe(1);
    expect((await manager.c.post(`/api/admin/feedback/${fid}/testimonial`, { decision: 'approved' })).status).toBe(200);
    const pub = await request(app).get('/api/testimonials');
    expect(pub.body.data).toEqual([{ id: fid, rating: 5, quote: 'My counsellor explained every option clearly.', name: 'Priya, Chennai' }]);
    expect(JSON.stringify(pub.body)).not.toContain(w.student.email);
    // Withdrawing consent removes it at once.
    await w.student.c.patch(`/api/feedback/${fid}/consent`, { publishConsent: false });
    expect((await request(app).get('/api/testimonials')).body.data).toEqual([]);

    // The conversation: reply, follow-up, resolve; other students cannot touch it.
    expect((await manager.c.post(`/api/admin/feedback/${fid}/respond`, { body: 'Thank you, Priya!' })).body.data.status).toBe('responded');
    const other = await registerStudent({ name: 'Arjun Mehta' });
    expect((await other.c.post(`/api/feedback/${fid}/messages`, { body: 'hi' })).status).toBe(404);
    expect((await other.c.get('/api/feedback')).body.data).toEqual([]);
    expect((await w.student.c.post(`/api/feedback/${fid}/messages`, { body: 'Happy to help others.' })).body.data.thread.map((t: { name: string }) => t.name)).toEqual(['Limited Admin', 'You']);
    expect((await manager.c.post(`/api/admin/feedback/${fid}/resolve`)).body.data.status).toBe('resolved');
  });
});

describe('personal data requests', () => {
  it('a deletion request, once approved, anonymises the student everywhere and removes their files', async () => {
    const w = await enquiryWorld();
    const { id } = await submitEnquiry(w);
    await w.student.c.post(`/api/enquiries/${(await EnquiryModel.findById(id).lean())!.reference}/messages`, { body: 'My phone is 98765 43210' });
    await upload(w.student.c, 'put', '/api/students/me/photo', PNG, 'me.png');
    const r = await w.student.c.post('/api/students/me/data-requests', { type: 'deletion', details: 'Please delete my account' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.data.reference).toMatch(/^DRQ-\d{4}-\d{6}$/);
    expect((await w.student.c.post('/api/students/me/data-requests', { type: 'deletion' })).body.error.code).toBe('REQUEST_PENDING');
    expect((await (await createLimitedAdmin(['students.read'])).c.get('/api/admin/data-requests')).status).toBe(403);

    const list = await w.admin.c.get('/api/admin/data-requests?status=pending');
    const done = await w.admin.c.post(`/api/admin/data-requests/${list.body.data[0].id}/resolve`, { action: 'complete', note: 'Your account was deleted as requested.' });
    expect(done.body.data.status).toBe('completed');

    const user = await UserModel.findById(w.student.id).lean();
    expect(user).toMatchObject({ name: 'Deleted student', mobile: null, status: 'disabled', photoFile: null });
    expect(user!.email).toMatch(/@deleted\.invalid$/);
    expect(await StudentProfileModel.countDocuments({ user: w.student.id })).toBe(0);
    expect(await StoredFileModel.countDocuments({ owner: w.student.id })).toBe(0);
    const e = await EnquiryModel.findById(id).lean();
    expect(e!.studentSnapshot).toMatchObject({ name: 'Deleted student', mobile: null });
    expect(e!.status).toBe('NEW');
    const events = await EnquiryEventModel.find({ enquiry: id, 'actor.user': w.student.id }).lean();
    expect(events.every((ev) => !ev.body.includes('98765'))).toBe(true);
    // The old session and password no longer work.
    expect((await w.student.c.get('/api/auth/me')).status).toBe(401);
    expect((await client().post('/api/auth/login', { email: w.student.email, password: PASSWORD })).status).toBe(401);
    expect(await AuditLogModel.countDocuments({ action: 'privacy.request_completed' })).toBe(1);
  });

  it('correction requests are completed by an admin who corrects the details', async () => {
    const s = await registerStudent();
    await s.c.post('/api/students/me/data-requests', { type: 'correction', details: 'My name is spelled Priya Sharmaa' });
    const { c } = await createLimitedAdmin(['privacy.manage', 'students.write']);
    expect((await c.patch(`/api/admin/students/${s.id}`, { name: 'Priya Sharmaa', role: 'admin' })).status).toBe(422);
    expect((await c.patch(`/api/admin/students/${s.id}`, { name: 'Priya Sharmaa' })).body.data.name).toBe('Priya Sharmaa');
    const req = (await c.get('/api/admin/data-requests')).body.data[0];
    await c.post(`/api/admin/data-requests/${req.id}/resolve`, { action: 'complete', note: 'Name corrected.' });
    expect((await s.c.get('/api/students/me/data-requests')).body.data[0]).toMatchObject({ status: 'completed', resolutionNote: 'Name corrected.' });
  });
});

describe('reports and exports', () => {
  it('reports define their metrics; exports whitelist fields, hide personal data by default, neutralise formulas and are audited', async () => {
    const w = await enquiryWorld();
    await submitEnquiry(w);
    await EnquiryModel.updateOne({}, { $set: { 'studentSnapshot.city': '=HYPERLINK("http://evil")' } });
    const summary = (await w.admin.c.get('/api/admin/reports/summary')).body.data;
    expect(summary.enquiries).toMatchObject({ total: 1, conversion: { confirmedAdmissions: 0, rate: 0 } });
    expect(summary.definitions.conversion).toMatch(/verified evidence/);
    expect(summary.enquiries.byCourse).toEqual([{ label: 'B.Tech / B.E.', count: 1 }]);

    const plain = await w.admin.c.get('/api/admin/reports/export/enquiries');
    expect(plain.status).toBe(200);
    expect(plain.headers['content-type']).toContain('text/csv');
    expect(plain.text).not.toContain(w.student.email);
    expect(plain.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
    const withPii = await w.admin.c.get('/api/admin/reports/export/enquiries?fields=reference,studentEmail');
    expect(withPii.text).toContain(w.student.email);
    expect((await w.admin.c.get('/api/admin/reports/export/enquiries?fields=reference,passwordHash')).status).toBe(422);
    expect((await w.admin.c.get('/api/admin/reports/export/users')).status).toBe(422);
    expect((await (await createLimitedAdmin(['enquiries.manage'])).c.get('/api/admin/reports/export/enquiries')).status).toBe(403);
    const logs = await AuditLogModel.find({ action: 'report.exported' }).sort({ _id: 1 }).lean();
    expect(logs.map((l) => (l.metadata as { personalData: string[] }).personalData)).toEqual([[], ['studentEmail']]);
    expect(csvCell('+1')).toBe(`"'+1"`);
    expect(await FeedbackModel.countDocuments()).toBe(0);
  });
});
