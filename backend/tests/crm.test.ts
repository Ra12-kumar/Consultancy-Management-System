import { describe, expect, it } from 'vitest';
import { AuditLogModel } from '../src/models/AuditLog.js';
import { EnquiryModel } from '../src/models/Enquiry.js';
import { istDay } from '../src/services/enquiryAdmin.service.js';
import { allowedTransitions, isOpen } from '../src/services/enquiryWorkflow.js';
import { enquiryWorld, submitEnquiry } from './enquiryFixtures.js';
import { createLimitedAdmin, useTestDb } from './helpers.js';

useTestDb();

describe('enquiry CRM statuses', () => {
  it('supports Contact pending, Interested and Not interested alongside the existing pipeline', async () => {
    expect(allowedTransitions('NEW')).toEqual(expect.arrayContaining(['CONTACT_PENDING', 'CONTACTED', 'INTERESTED', 'NOT_INTERESTED']));
    expect(allowedTransitions('NEW')).not.toContain('ADMITTED');
    expect(isOpen('NOT_INTERESTED')).toBe(false);
    expect(allowedTransitions('NOT_INTERESTED')).toEqual(['CONTACTED']);

    const w = await enquiryWorld();
    const { id, reference } = await submitEnquiry(w);
    const move = (fromStatus: string, toStatus: string, reason = '') => w.admin.c.post(`/api/admin/enquiries/${id}/status`, { fromStatus, toStatus, reason });
    expect((await move('NEW', 'CONTACT_PENDING')).status).toBe(200);
    expect((await move('CONTACT_PENDING', 'INTERESTED')).status).toBe(200);
    expect((await move('INTERESTED', 'NOT_INTERESTED')).status).toBe(422); // needs a reason
    expect((await move('INTERESTED', 'NOT_INTERESTED', 'Chose another city')).status).toBe(200);
    const mine = await w.student.c.get(`/api/enquiries/${reference}`);
    expect(mine.body.data).toMatchObject({ status: 'NOT_INTERESTED', statusLabel: 'Closed at your request' });
  });
});

describe('lead source, callback time and callback requests', () => {
  it('records where the enquiry came from and when to call', async () => {
    const w = await enquiryWorld();
    const { id } = await submitEnquiry(w, { source: 'featured_college', campaign: 'diwali-2026', callbackTime: 'evening' });
    const detail = await w.admin.c.get(`/api/admin/enquiries/${id}`);
    expect(detail.body.data).toMatchObject({ source: 'featured_college', campaign: 'diwali-2026', callbackTime: 'evening', lastContactAt: null });
    expect((await w.student.c.post('/api/enquiries', { source: 'hacker', idempotencyKey: 'abcdefgh-1', courses: [], admissionYear: 2026 })).status).toBe(422);
  });

  it('a student requests a call; the team sees it, and recording a contact settles it', async () => {
    const w = await enquiryWorld();
    const { id, reference } = await submitEnquiry(w);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const r = await w.student.c.post(`/api/enquiries/${reference}/callback-request`, { kind: 'callback', preferredDate: tomorrow, slot: 'morning', note: 'After my exam' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.callbackRequest).toMatchObject({ kind: 'callback', slot: 'morning', handledAt: null });
    expect(r.body.data.timeline.at(-1)).toMatchObject({ type: 'callback_request' });

    const waiting = await w.admin.c.get('/api/admin/enquiries?quick=callback');
    expect(waiting.body.data.map((e: { id: string }) => e.id)).toEqual([id]);
    expect(waiting.body.data[0]).toMatchObject({ callbackRequested: true, studentMobile: expect.stringMatching(/^\+91/), colleges: ['Alpha Institute'] });

    expect((await w.admin.c.post(`/api/admin/enquiries/${id}/contact-attempts`, { channel: 'phone', outcome: 'reached', note: 'Discussed options' })).status).toBe(201);
    expect((await w.admin.c.get('/api/admin/enquiries?quick=callback')).body.data).toEqual([]);
    const detail = (await w.admin.c.get(`/api/admin/enquiries/${id}`)).body.data;
    expect(detail.status).toBe('CONTACTED');
    expect(detail.lastContactAt).not.toBeNull();
    expect(detail.callbackRequest.handledAt).not.toBeNull();
    // Internal call notes never reach the student.
    expect(JSON.stringify((await w.student.c.get(`/api/enquiries/${reference}`)).body)).not.toContain('Discussed options');
  });

  it('only the owner can request a callback, and not on a finished enquiry', async () => {
    const w = await enquiryWorld();
    const { reference } = await submitEnquiry(w);
    const { registerStudent } = await import('./helpers.js');
    const other = await registerStudent({ name: 'Other Student' });
    expect((await other.c.post(`/api/enquiries/${reference}/callback-request`, { kind: 'callback' })).status).toBe(404);
    expect((await w.admin.c.post(`/api/enquiries/${reference}/callback-request`, { kind: 'callback' })).status).toBe(403);
    await w.student.c.post(`/api/enquiries/${reference}/withdraw`, { reason: 'No longer needed' });
    expect((await w.student.c.post(`/api/enquiries/${reference}/callback-request`, { kind: 'counselling', mode: 'video' })).status).toBe(409);
  });
});

describe('quick views, export and dashboard', () => {
  it("lists today's calls and overdue follow-ups (IST days)", async () => {
    const w = await enquiryWorld();
    const today = await submitEnquiry(w);
    const late = await submitEnquiry(w, { courses: [String(w.p.mba._id)], colleges: [] });
    const { start } = istDay();
    await EnquiryModel.updateOne({ _id: today.id }, { $set: { followUpAt: new Date(start.getTime() + 60_000) } });
    await EnquiryModel.updateOne({ _id: late.id }, { $set: { followUpAt: new Date(start.getTime() - 60_000) } });
    const ids = async (quick: string) => (await w.admin.c.get(`/api/admin/enquiries?quick=${quick}`)).body.data.map((e: { id: string }) => e.id);
    expect(await ids('today')).toEqual([today.id]);
    expect(await ids('overdue')).toEqual([late.id]);
    expect(await ids('new')).toHaveLength(2);
    expect(await ids('admitted')).toEqual([]);

    const dash = (await w.admin.c.get('/api/admin/dashboard/summary')).body.data;
    expect(dash.enquiries).toMatchObject({ total: 2, pending: 2, followUpsToday: 1, followUpsOverdue: 1 });
    expect(dash.charts.enquiriesByDay).toHaveLength(30);
    expect(dash.charts.enquiriesByDay.at(-1).count).toBe(2);
    expect(dash.charts.topColleges).toEqual([{ id: String(w.college._id), name: 'Alpha Institute', count: 1 }]);
    expect(dash.charts.bySource).toEqual([{ source: 'direct', count: 2 }]);
    expect(dash.conversionRate).toBe(0);
  });

  it('exports the filtered list as CSV only with reports.export, neutralising formulas, and audits it', async () => {
    const w = await enquiryWorld();
    await submitEnquiry(w);
    await EnquiryModel.updateMany({}, { $set: { 'studentSnapshot.name': '=HYPERLINK("x")' } });
    const res = await w.admin.c.get('/api/admin/enquiries/export?quick=new');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="enquiries-/);
    expect(res.text).toContain('"reference","status"');
    expect(res.text).toContain(`"'=HYPERLINK(""x"")"`);
    expect(await AuditLogModel.countDocuments({ action: 'enquiry.exported' })).toBe(1);

    const counsellor = await createLimitedAdmin(['enquiries.manage']);
    expect((await counsellor.c.get('/api/admin/enquiries/export')).status).toBe(403);
    expect((await counsellor.c.get('/api/admin/enquiries')).status).toBe(200);
    expect((await w.student.c.get('/api/admin/enquiries/export')).status).toBe(403);
  });
});

describe('follow-up date range filter', () => {
  it('lists enquiries whose follow-up falls in the range (used by the counsellor calendar)', async () => {
    const w = await enquiryWorld();
    const { id } = await submitEnquiry(w);
    const at = new Date(Date.now() + 3 * 86_400_000);
    expect((await w.admin.c.patch(`/api/admin/enquiries/${id}`, { followUpAt: at.toISOString() })).status).toBe(200);
    const range = (from: number, to: number) => `followUpFrom=${new Date(Date.now() + from * 86_400_000).toISOString()}&followUpTo=${new Date(Date.now() + to * 86_400_000).toISOString()}`;
    expect((await w.admin.c.get(`/api/admin/enquiries?${range(2, 4)}`)).body.meta.total).toBe(1);
    expect((await w.admin.c.get(`/api/admin/enquiries?${range(5, 9)}`)).body.meta.total).toBe(0);
    expect((await w.admin.c.get('/api/admin/enquiries?followUpFrom=not-a-date')).status).toBe(422);
  });
});
