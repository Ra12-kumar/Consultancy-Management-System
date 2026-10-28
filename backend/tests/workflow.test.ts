import { describe, expect, it } from 'vitest';
import { AuditLogModel } from '../src/models/AuditLog.js';
import { EnquiryEventModel } from '../src/models/Enquiry.js';
import { allowedTransitions, reasonRequired } from '../src/services/enquiryWorkflow.js';
import { processEmailQueue } from '../src/services/emailWorker.js';
import { enquiryWorld, submitEnquiry } from './enquiryFixtures.js';
import { createLimitedAdmin, outbox, useTestDb } from './helpers.js';

describe('status rules', () => {
  it('never offers ADMITTED manually; finished enquiries can only be reopened', () => {
    for (const s of ['NEW', 'CONTACTED', 'SUBMITTED', 'OFFER_RECEIVED', 'ON_HOLD'] as const) expect(allowedTransitions(s)).not.toContain('ADMITTED');
    expect(allowedTransitions('NEW')).toEqual(expect.arrayContaining(['CONTACTED', 'COUNSELLING_SCHEDULED', 'ON_HOLD', 'CLOSED']));
    expect(allowedTransitions('NEW')).not.toContain('NEW');
    expect(allowedTransitions('SUBMITTED')).toContain('APPLICATION_IN_PROGRESS');
    expect(allowedTransitions('SUBMITTED')).not.toContain('CONTACTED');
    expect(allowedTransitions('CLOSED')).toEqual(['CONTACTED']);
    expect(allowedTransitions('ADMITTED')).toEqual(['CLOSED']);
    expect(reasonRequired('NEW', 'CONTACTED')).toBe(false);
    expect(reasonRequired('NEW', 'ON_HOLD')).toBe(true);
    expect(reasonRequired('SUBMITTED', 'APPLICATION_IN_PROGRESS')).toBe(true);
    expect(reasonRequired('CLOSED', 'CONTACTED')).toBe(true);
  });
});

describe('enquiry workflow (API)', () => {
  useTestDb();

  it('moves through the pipeline with history, reasons, evidence gates and conflict detection', async () => {
    const w = await enquiryWorld();
    const { reference, id } = await submitEnquiry(w);
    const move = (fromStatus: string, toStatus: string, extra: object = {}) => w.admin.c.post(`/api/admin/enquiries/${id}/status`, { fromStatus, toStatus, ...extra });

    expect((await move('NEW', 'CONTACTED')).body.data.status).toBe('CONTACTED');
    // Stale view: someone else already moved it.
    expect((await move('NEW', 'COUNSELLING_SCHEDULED')).body.error.code).toBe('STATUS_CHANGED');
    expect((await move('CONTACTED', 'NEW')).body.error.code).toBe('INVALID_TRANSITION');
    expect((await move('CONTACTED', 'ADMITTED')).body.error.code).toBe('USE_CONFIRM_ADMISSION');
    expect((await move('CONTACTED', 'ON_HOLD')).body.error.details[0].field).toBe('reason');
    // Submitted needs a submitted application on record.
    expect((await move('CONTACTED', 'SUBMITTED')).body.error.code).toBe('NEEDS_APPLICATION');

    const app = await w.admin.c.post(`/api/admin/enquiries/${id}/applications`, { college: String(w.college._id), course: String(w.p.btech._id), applicationNumber: 'AI/2026/77', status: 'submitted' });
    expect(app.status, JSON.stringify(app.body)).toBe(201);
    const appId = app.body.data.applications[0].id;
    expect(app.body.data.applications[0].reference).toMatch(/^APP-\d{4}-\d{6}$/);
    expect((await move('CONTACTED', 'SUBMITTED', { studentMessage: 'Your application has been submitted.' })).body.data.status).toBe('SUBMITTED');
    expect((await move('SUBMITTED', 'OFFER_RECEIVED')).body.error.code).toBe('NEEDS_APPLICATION');
    // `admitted` can't be set through an ordinary update.
    expect((await w.admin.c.patch(`/api/admin/applications/${appId}`, { status: 'admitted' })).status).toBe(422);
    await w.admin.c.patch(`/api/admin/applications/${appId}`, { status: 'offer_received' });
    expect((await move('SUBMITTED', 'OFFER_RECEIVED')).body.data.status).toBe('OFFER_RECEIVED');

    const events = await EnquiryEventModel.find({ type: 'status_change' }).sort({ createdAt: 1 }).lean();
    expect(events.map((e) => `${e.fromStatus}>${e.toStatus}`)).toEqual(['NEW>CONTACTED', 'CONTACTED>SUBMITTED', 'SUBMITTED>OFFER_RECEIVED']);
    expect(events[0]!.actor).toMatchObject({ role: 'admin', name: 'Asha Admin' });
    expect(await AuditLogModel.countDocuments({ action: 'enquiry.status_changed' })).toBe(3);

    // Student sees the student-facing labels and message.
    const mine = (await w.student.c.get(`/api/enquiries/${reference}`)).body.data;
    expect(mine.statusLabel).toBe('Offer received');
    expect(mine.applications[0]).toMatchObject({ collegeName: 'Alpha Institute', status: 'offer_received', admissionConfirmed: false });
    expect(mine.applications[0].internalNote).toBeUndefined();
    await processEmailQueue();
    expect(outbox.filter((m) => m.to === w.student.email && m.subject.startsWith('Update on your enquiry')).map((m) => m.subject)).toEqual([
      expect.stringContaining('Application submitted'),
      expect.stringContaining('Offer received'),
    ]);
  });

  it('confirming an admission needs admissions.confirm, an offer and evidence; then the enquiry is ADMITTED', async () => {
    const w = await enquiryWorld();
    const { reference, id } = await submitEnquiry(w);
    const app = await w.admin.c.post(`/api/admin/enquiries/${id}/applications`, { college: String(w.college._id), course: String(w.p.btech._id), status: 'submitted' });
    const appId = app.body.data.applications[0].id;
    const counsellor = await createLimitedAdmin(['enquiries.manage']);
    const evidence = { evidenceType: 'offer_letter', evidenceReference: 'Offer letter AI/OL/2026/123' };

    expect((await w.admin.c.post(`/api/admin/applications/${appId}/confirm-admission`, evidence)).body.error.code).toBe('NEEDS_OFFER');
    await w.admin.c.patch(`/api/admin/applications/${appId}`, { status: 'offer_received' });
    expect((await counsellor.c.post(`/api/admin/applications/${appId}/confirm-admission`, evidence)).status).toBe(403);
    expect((await w.admin.c.post(`/api/admin/applications/${appId}/confirm-admission`, { evidenceType: 'offer_letter', evidenceReference: '' })).status).toBe(422);

    const ok = await w.admin.c.post(`/api/admin/applications/${appId}/confirm-admission`, evidence);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data.status).toBe('ADMITTED');
    expect(ok.body.data.applications[0].evidence).toMatchObject({ type: 'offer_letter', verifiedBy: w.admin.id });
    expect((await w.admin.c.patch(`/api/admin/applications/${appId}`, { status: 'withdrawn' })).body.error.code).toBe('APPLICATION_LOCKED');
    expect((await w.admin.c.get('/api/admin/dashboard/summary')).body.data.applications.confirmedAdmissions).toBe(1);
    const mine = (await w.student.c.get(`/api/enquiries/${reference}`)).body.data;
    expect(mine).toMatchObject({ status: 'ADMITTED', statusLabel: 'Admission confirmed' });
    expect(JSON.stringify(mine)).not.toContain('AI/OL/2026/123');
  });

  it('closing and reopening need reasons; a student can withdraw their own enquiry', async () => {
    const w = await enquiryWorld();
    const { reference, id } = await submitEnquiry(w);
    const move = (fromStatus: string, toStatus: string, extra: object = {}) => w.admin.c.post(`/api/admin/enquiries/${id}/status`, { fromStatus, toStatus, ...extra });
    expect((await move('NEW', 'CLOSED', { reason: 'Duplicate of phone enquiry' })).body.data.status).toBe('CLOSED');
    expect((await move('CLOSED', 'CONTACTED')).status).toBe(422);
    expect((await move('CLOSED', 'CONTACTED', { reason: 'Student called back' })).body.data.status).toBe('CONTACTED');
    expect((await w.student.c.post(`/api/enquiries/${reference}/withdraw`, { reason: 'x' })).status).toBe(422);
    expect((await w.student.c.post(`/api/enquiries/${reference}/withdraw`, { reason: 'Joined another college' })).body.data.status).toBe('WITHDRAWN');
    expect((await w.student.c.post(`/api/enquiries/${reference}/messages`, { body: 'hello?' })).body.error.code).toBe('ENQUIRY_FINISHED');
  });
});
