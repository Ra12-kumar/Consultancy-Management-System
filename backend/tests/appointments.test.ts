import { describe, expect, it } from 'vitest';
import { AppointmentModel } from '../src/models/Appointment.js';
import { sendAppointmentReminders } from '../src/services/appointment.service.js';
import { processEmailQueue } from '../src/services/emailWorker.js';
import { enquiryWorld, submitEnquiry } from './enquiryFixtures.js';
import { createLimitedAdmin, outbox, registerStudent, useTestDb } from './helpers.js';

useTestDb();

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

describe('counselling appointments', () => {
  it('scheduling emails the student and moves the enquiry; the counsellor cannot be double-booked', async () => {
    const w = await enquiryWorld();
    const { reference, id } = await submitEnquiry(w);
    const r = await w.admin.c.post(`/api/admin/enquiries/${id}/appointments`, { startsAt: inHours(48), durationMinutes: 45, mode: 'video', meetingDetails: 'https://meet.example.com/abc', agenda: 'Course options' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.data.status).toBe('COUNSELLING_SCHEDULED');
    expect(r.body.data.appointments[0]).toMatchObject({ mode: 'video', status: 'scheduled', counsellorId: w.admin.id });

    // Overlaps (same counsellor, 30 minutes later) are refused; back-to-back is fine.
    const second = await submitEnquiry(w, { courses: [String(w.p.mba._id)], colleges: [] });
    expect((await w.admin.c.post(`/api/admin/enquiries/${second.id}/appointments`, { startsAt: new Date(Date.parse(inHours(48)) + 30 * 60_000).toISOString(), mode: 'phone' })).body.error.code).toBe('COUNSELLOR_BUSY');
    expect((await w.admin.c.post(`/api/admin/enquiries/${second.id}/appointments`, { startsAt: new Date(Date.parse(inHours(48)) + 45 * 60_000).toISOString(), mode: 'phone' })).status).toBe(201);
    // Past times and insecure links are refused.
    expect((await w.admin.c.post(`/api/admin/enquiries/${second.id}/appointments`, { startsAt: inHours(-1), mode: 'phone' })).status).toBe(422);
    expect((await w.admin.c.post(`/api/admin/enquiries/${second.id}/appointments`, { startsAt: inHours(72), mode: 'video', meetingDetails: 'http://insecure.example' })).status).toBe(422);

    await processEmailQueue();
    expect(outbox.filter((m) => m.to === w.student.email).map((m) => m.subject).join(' | ')).toMatch(/Counselling session booked/);
    const mine = (await w.student.c.get(`/api/enquiries/${reference}`)).body.data;
    expect(mine.appointments[0]).toMatchObject({ meetingDetails: 'https://meet.example.com/abc', agenda: 'Course options' });
    expect(mine.appointments[0].outcomeNote).toBeUndefined();
  });

  it('students can confirm, ask to reschedule or cancel only their own appointments', async () => {
    const w = await enquiryWorld();
    const { id } = await submitEnquiry(w);
    const helper = await createLimitedAdmin(['enquiries.manage']);
    const counsellor = (await w.admin.c.get('/api/admin/counsellors')).body.data.find((c: { email: string }) => c.email === helper.email).id;
    const r = await w.admin.c.post(`/api/admin/enquiries/${id}/appointments`, { startsAt: inHours(30), mode: 'phone', counsellor });
    const apptId = r.body.data.appointments[0].id;
    const other = await registerStudent({ name: 'Arjun Mehta' });

    expect((await other.c.post(`/api/appointments/${apptId}/confirm`, {})).status).toBe(404);
    expect((await other.c.get('/api/appointments')).body.data).toEqual([]);
    expect((await w.student.c.post(`/api/appointments/${apptId}/confirm`, {})).body.data.status).toBe('confirmed');
    expect((await w.student.c.post(`/api/appointments/${apptId}/confirm`, {})).body.error.code).toBe('APPOINTMENT_STATE');
    expect((await w.student.c.post(`/api/appointments/${apptId}/reschedule`, {})).status).toBe(422);
    expect((await w.student.c.post(`/api/appointments/${apptId}/reschedule`, { note: 'Evenings after 6 please' })).body.data.status).toBe('reschedule_requested');
    await processEmailQueue();
    expect(outbox.find((m) => m.to === helper.email && m.subject.includes('asked to reschedule'))?.text).toContain('Evenings after 6');

    // The counsellor picks a new time: the student must confirm again.
    const moved = await helper.c.patch(`/api/admin/appointments/${apptId}`, { startsAt: inHours(50) });
    expect(moved.body.data.appointments[0].status).toBe('scheduled');
    expect((await w.student.c.post(`/api/appointments/${apptId}/cancel`, { note: 'Exam that day' })).body.data.status).toBe('cancelled');
    expect((await helper.c.post(`/api/admin/appointments/${apptId}/complete`, { note: 'x' })).body.error.code).toBe('APPOINTMENT_CLOSED');
  });

  it('sends one reminder for sessions in the next 24 hours, and again after a reschedule', async () => {
    const w = await enquiryWorld();
    const { id } = await submitEnquiry(w);
    const soon = await w.admin.c.post(`/api/admin/enquiries/${id}/appointments`, { startsAt: inHours(5), mode: 'office', meetingDetails: 'EduPath office, 2nd floor' });
    const apptId = soon.body.data.appointments[0].id;
    await w.admin.c.post(`/api/admin/enquiries/${id}/appointments`, { startsAt: inHours(60), mode: 'phone' });

    expect(await Promise.all([sendAppointmentReminders(), sendAppointmentReminders()]).then((n) => n[0] + n[1])).toBe(1);
    expect(await sendAppointmentReminders()).toBe(0);
    await w.admin.c.patch(`/api/admin/appointments/${apptId}`, { startsAt: inHours(6) });
    expect(await sendAppointmentReminders()).toBe(1);
    await processEmailQueue();
    expect(outbox.filter((m) => m.subject.startsWith('Reminder: counselling session'))).toHaveLength(2);

    await w.admin.c.post(`/api/admin/appointments/${apptId}/complete`, { note: 'Discussed B.Tech CSE; private notes' });
    expect((await AppointmentModel.findById(apptId).lean())!.status).toBe('completed');
    expect((await w.admin.c.get('/api/admin/appointments?counsellor=me')).body.meta.total).toBe(2);
    expect(JSON.stringify((await w.student.c.get('/api/appointments')).body)).not.toContain('private notes');
  });
});
