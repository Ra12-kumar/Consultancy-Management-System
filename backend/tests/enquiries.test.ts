import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { EmailDeliveryModel } from '../src/models/EmailDelivery.js';
import { EnquiryEventModel, EnquiryModel } from '../src/models/Enquiry.js';
import { processEmailQueue } from '../src/services/emailWorker.js';
import { rupees } from './catalogFixtures.js';
import { enquiryBody, enquiryWorld, profile, submitEnquiry } from './enquiryFixtures.js';
import { app, createLimitedAdmin, failSends, outbox, registerStudent, useTestDb } from './helpers.js';

useTestDb();

describe('submitting an enquiry', () => {
  it('creates a NEW enquiry with a reference, server snapshots and fee estimates, and notifies the team and the student', async () => {
    const w = await enquiryWorld();
    const r = await w.student.c.post('/api/enquiries', enquiryBody(w));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const d = r.body.data;
    expect(d.reference).toMatch(new RegExp(`^ENQ-${new Date().getFullYear()}-\\d{6}$`));
    expect(d).toMatchObject({ status: 'NEW', statusLabel: 'Received', duplicate: false });
    expect(d.preferences.courses[0].slug).toBe('btech-be');
    // 4 years × ₹1,00,000 official fees, estimate recorded from the published fee.
    expect(d.feeEstimates).toEqual([expect.objectContaining({ collegeName: 'Alpha Institute', courseName: 'B.Tech / B.E.', officialTotalMinor: rupees(400_000), version: 1 })]);

    const stored = await EnquiryModel.findOne({ reference: d.reference }).lean();
    expect(stored!.studentSnapshot).toMatchObject({ email: w.student.email, city: 'Chennai', percentage: 82 });

    // Visible to admins at once.
    const list = await w.admin.c.get('/api/admin/enquiries');
    expect(list.body.data.map((e: { reference: string }) => e.reference)).toEqual([d.reference]);
    expect((await w.admin.c.get('/api/admin/dashboard/summary')).body.data.enquiries).toMatchObject({ total: 1, new: 1, unassigned: 1 });

    await processEmailQueue();
    expect(outbox.find((m) => m.to === w.admin.email && m.subject.includes(d.reference))).toBeTruthy();
    expect(outbox.find((m) => m.to === w.student.email && m.subject.includes(d.reference))?.text).toContain('/student/enquiries/');
  });

  it('still succeeds when the email provider is failing (emails retry later)', async () => {
    const w = await enquiryWorld();
    failSends(10);
    const r = await w.student.c.post('/api/enquiries', enquiryBody(w));
    expect(r.status).toBe(201);
    await processEmailQueue();
    expect(await EmailDeliveryModel.countDocuments({ template: { $in: ['enquiry_ack', 'enquiry_received_admin'] }, status: 'retrying' })).toBe(2);
  });

  it('requires a verified email; protected and unknown fields are refused', async () => {
    const w = await enquiryWorld();
    const unverified = await registerStudent({ verify: false, name: 'Neha Verma' });
    const r = await unverified.c.post('/api/enquiries', enquiryBody(w));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    for (const extra of [{ status: 'ADMITTED' }, { reference: 'ENQ-2026-999999' }, { feeEstimates: [] }, { student: w.admin.id }]) {
      expect((await w.student.c.post('/api/enquiries', enquiryBody(w, extra))).status, JSON.stringify(extra)).toBe(422);
    }
    expect((await w.student.c.post('/api/enquiries', enquiryBody(w, { courses: [] }))).status).toBe(422);
    // A draft (unpublished) college cannot be chosen.
    expect((await w.student.c.post('/api/enquiries', enquiryBody(w, { colleges: ['0123456789abcdef01234567'] }))).status).toBe(422);
    expect((await request(app).post('/api/enquiries').set('Origin', 'http://localhost:3000').send(enquiryBody(w))).status).toBe(401);
    expect((await w.admin.c.post('/api/enquiries', enquiryBody(w))).status).toBe(403);
  });

  it('is protected against double submits and duplicate open enquiries', async () => {
    const w = await enquiryWorld();
    const body = enquiryBody(w);
    const [a, b] = await Promise.all([w.student.c.post('/api/enquiries', body), w.student.c.post('/api/enquiries', body)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.data.reference).toBe(b.body.data.reference);
    expect(await EnquiryModel.countDocuments()).toBe(1);

    const dup = await w.student.c.post('/api/enquiries', enquiryBody(w));
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({ code: 'DUPLICATE_ENQUIRY', details: [{ field: 'reference', message: a.body.data.reference }] });
    // Another course is fine, and so is the same course after withdrawing.
    expect((await w.student.c.post('/api/enquiries', enquiryBody(w, { courses: [String(w.p.mba._id)], colleges: [] }))).status).toBe(201);
    expect((await w.student.c.post(`/api/enquiries/${a.body.data.reference}/withdraw`, { reason: 'Changed my plans' })).body.data.status).toBe('WITHDRAWN');
    expect((await w.student.c.post('/api/enquiries', enquiryBody(w))).status).toBe(201);
  });
});

describe('privacy and access', () => {
  it('a student cannot see, message or withdraw another student’s enquiry', async () => {
    const w = await enquiryWorld();
    const { reference } = await submitEnquiry(w);
    const other = await registerStudent({ name: 'Arjun Mehta' });
    expect((await other.c.get(`/api/enquiries/${reference}`)).status).toBe(404);
    expect((await other.c.post(`/api/enquiries/${reference}/messages`, { body: 'hi' })).status).toBe(404);
    expect((await other.c.post(`/api/enquiries/${reference}/withdraw`, { reason: 'mine now' })).status).toBe(404);
    expect((await other.c.get('/api/enquiries')).body.data).toEqual([]);
    expect((await other.c.get('/api/students/me/updates')).body.data).toEqual([]);
  });

  it('students never receive internal notes, contact attempts, reasons or outcome notes', async () => {
    const w = await enquiryWorld();
    const { reference, id } = await submitEnquiry(w);
    const SECRET = 'INTERNAL-ONLY-7731';
    await w.admin.c.post(`/api/admin/enquiries/${id}/notes`, { body: `Family budget is tight ${SECRET}` });
    await w.admin.c.post(`/api/admin/enquiries/${id}/contact-attempts`, { channel: 'phone', outcome: 'reached', note: `Spoke to father ${SECRET}` });
    await w.admin.c.post(`/api/admin/enquiries/${id}/status`, { fromStatus: 'CONTACTED', toStatus: 'ON_HOLD', reason: `Waiting on loan ${SECRET}`, studentMessage: 'We will continue once you are ready.' });
    await w.admin.c.post(`/api/admin/enquiries/${id}/messages`, { body: 'Please share your marksheet.' });
    for (const url of [`/api/enquiries/${reference}`, '/api/enquiries', '/api/students/me/updates', '/api/admissions', '/api/appointments']) {
      const r = await w.student.c.get(url);
      expect(r.status, url).toBe(200);
      expect(JSON.stringify(r.body), url).not.toContain(SECRET);
    }
    const mine = (await w.student.c.get(`/api/enquiries/${reference}`)).body.data;
    expect(mine).toMatchObject({ status: 'ON_HOLD', statusLabel: 'On hold', studentMessage: 'We will continue once you are ready.' });
    expect(mine.timeline.map((t: { body: string }) => t.body)).toContain('Please share your marksheet.');
    // The admin sees everything, including who did what.
    const full = (await w.admin.c.get(`/api/admin/enquiries/${id}`)).body.data;
    expect(full.timeline.filter((t: { visibility: string }) => t.visibility === 'internal').length).toBeGreaterThanOrEqual(2);
    await processEmailQueue();
    expect(outbox.some((m) => m.text.includes(SECRET) || m.html.includes(SECRET))).toBe(false);
  });

  it('students are refused admin enquiry routes; admins need enquiries.manage', async () => {
    const w = await enquiryWorld();
    const { id } = await submitEnquiry(w);
    const viewer = await createLimitedAdmin(['students.read']);
    for (const url of ['/api/admin/enquiries', `/api/admin/enquiries/${id}`, '/api/admin/applications', '/api/admin/appointments', '/api/admin/counsellors']) {
      expect((await w.student.c.get(url)).status, url).toBe(403);
      expect((await viewer.c.get(url)).status, url).toBe(403);
    }
    expect((await w.student.c.post(`/api/admin/enquiries/${id}/status`, { fromStatus: 'NEW', toStatus: 'CONTACTED' })).status).toBe(403);
  });

  it('enquiry history is append-only', async () => {
    const w = await enquiryWorld();
    await submitEnquiry(w);
    await expect(EnquiryEventModel.updateMany({}, { $set: { body: 'x' } })).rejects.toThrow(/append-only/);
    await expect(EnquiryEventModel.deleteMany({})).rejects.toThrow(/append-only/);
  });
});

describe('conversation, assignment and documents', () => {
  it('assigns a counsellor (emailed), requests documents (student emailed, status moves) and keeps the fee estimate after prices change', async () => {
    const w = await enquiryWorld();
    const { reference, id } = await submitEnquiry(w);
    const helper = await createLimitedAdmin(['enquiries.manage']);
    const counsellors = (await w.admin.c.get('/api/admin/counsellors')).body.data;
    const helperId = counsellors.find((c: { email: string }) => c.email === helper.email).id;
    expect((await w.admin.c.patch(`/api/admin/enquiries/${id}`, { assignedTo: helperId, followUpAt: '2020-01-01T10:00:00.000Z' })).body.data.assignedTo.email).toBe(helper.email);
    expect((await helper.c.get('/api/admin/enquiries?assigned=me')).body.meta.total).toBe(1);
    expect((await helper.c.get('/api/admin/enquiries?followUpDue=yes')).body.meta.total).toBe(1);
    // Only counsellors can be assigned.
    expect((await w.admin.c.patch(`/api/admin/enquiries/${id}`, { assignedTo: w.student.id })).status).toBe(422);

    const docs = await helper.c.post(`/api/admin/enquiries/${id}/documents`, { names: ['Class 12 marksheet', 'Aadhaar card'], note: 'Self-attested copies' });
    expect(docs.body.data.status).toBe('DOCUMENTS_PENDING');
    const docId = docs.body.data.documents[0].id;
    await helper.c.patch(`/api/admin/enquiries/${id}/documents/${docId}`, { status: 'received' });
    const mine = (await w.student.c.get(`/api/enquiries/${reference}`)).body.data;
    expect(mine.documents.map((d: { status: string }) => d.status)).toEqual(['received', 'requested']);
    expect(mine.counsellor).toBe('Limited Admin');

    // The student writes back; the counsellor is emailed.
    expect((await w.student.c.post(`/api/enquiries/${reference}/messages`, { body: 'Uploaded via WhatsApp' })).status).toBe(201);
    await processEmailQueue();
    expect(outbox.filter((m) => m.to === helper.email).map((m) => m.subject).join(' | ')).toMatch(/assigned to you.*New message/);
    expect(outbox.find((m) => m.to === w.student.email && m.subject.startsWith('Documents needed'))?.text).toContain('Aadhaar card');

    // Fees change later: the enquiry keeps the estimate it was given.
    const { CollegeFeeModel } = await import('../src/models/CollegeFee.js');
    await CollegeFeeModel.updateMany({}, { $set: { officialTotalMinor: 1 } }).catch(() => undefined);
    expect((await w.student.c.get(`/api/enquiries/${reference}`)).body.data.feeEstimates[0].officialTotalMinor).toBe(rupees(400_000));
  });
});

describe('many students at once', () => {
  it('parallel enquiries from different students each get their own enquiry and a unique reference', async () => {
    const w = await enquiryWorld();
    const students = [w.student];
    for (let i = 0; i < 7; i += 1) {
      const s = await registerStudent({ name: `Parallel Student ${'ABCDEFG'[i]}` });
      expect((await s.c.put('/api/students/me/profile', profile)).status).toBe(200);
      students.push(s);
    }
    const results = await Promise.all(students.map((s) => s.c.post('/api/enquiries', enquiryBody(w))));
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(201));
    const refs = results.map((r) => r.body.data.reference as string);
    expect(new Set(refs).size).toBe(8);
    expect(await EnquiryModel.countDocuments()).toBe(8);
    // Each student sees only their own.
    for (const [i, s] of students.entries()) {
      const mine = await s.c.get('/api/enquiries');
      expect(mine.body.data.map((e: { reference: string }) => e.reference)).toEqual([refs[i]]);
    }
  });
});
