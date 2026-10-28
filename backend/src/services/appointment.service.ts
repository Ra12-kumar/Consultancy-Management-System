import type { Request } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ACTIVE_APPOINTMENT, AppointmentModel } from '../models/Appointment.js';
import { EnquiryModel } from '../models/Enquiry.js';
import { UserModel } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { actorFrom, audit } from './audit.service.js';
import { pageMeta } from './catalog.service.js';
import { autoStatus, enquiryDetail, enquiryOr404 } from './enquiryAdmin.service.js';
import { addEvent, eventActor, fmtIST, frontendLink, oid, safeEmail } from './enquiryShared.js';
import { toAdminAppointment, toStudentAppointment } from './enquiryViews.js';
import { isOpen } from './enquiryWorkflow.js';

type Lean = Record<string, any> & { _id: mongoose.Types.ObjectId }; // eslint-disable-line @typescript-eslint/no-explicit-any
const MODES: Record<string, string> = { phone: 'phone', video: 'video', office: 'in-person' };
const STUDENT_LINK = frontendLink('/student/appointments');
const ADMIN_LINK = frontendLink('/admin/appointments');

async function appointmentOr404(filter: Record<string, unknown>) {
  const a = await AppointmentModel.findOne(filter).lean();
  if (!a) throw ApiError.notFound('Appointment not found');
  return a as Lean;
}

async function assertCounsellor(id: string) {
  if (!(await UserModel.exists({ _id: id, role: 'admin', status: 'active', permissions: 'enquiries.manage' }))) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a counsellor from the list', [{ field: 'counsellor', message: 'Choose a counsellor' }]);
  }
}

// A counsellor cannot be in two active sessions at once.
async function assertFree(counsellor: string, startsAt: Date, durationMinutes: number, exceptId?: unknown) {
  const end = new Date(startsAt.getTime() + durationMinutes * 60_000);
  const clash = await AppointmentModel.exists({
    counsellor: oid(counsellor),
    status: { $in: ACTIVE_APPOINTMENT },
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
    startsAt: { $lt: end },
    $expr: { $gt: [{ $add: ['$startsAt', { $multiply: ['$durationMinutes', 60_000] }] }, startsAt] },
  });
  if (clash) throw new ApiError(409, 'COUNSELLOR_BUSY', 'The counsellor already has a session at that time');
}

async function emailStudent(a: Lean, template: 'appointment_scheduled' | 'appointment_updated' | 'appointment_cancelled', extra: Record<string, string> = {}) {
  const [e, counsellor] = await Promise.all([EnquiryModel.findById(a.enquiry).select('reference studentSnapshot').lean(), UserModel.findById(a.counsellor).select('name').lean()]);
  if (!e) return;
  await safeEmail({
    to: e.studentSnapshot!.email,
    template,
    params: { name: e.studentSnapshot!.name, reference: e.reference, when: fmtIST(a.startsAt), mode: MODES[a.mode]!, counsellor: counsellor?.name ?? 'your counsellor', details: a.meetingDetails, link: STUDENT_LINK, ...extra },
    dedupeKey: `appt:${String(a._id)}:${template}:${Date.now()}`,
    related: { type: 'appointment', id: String(a._id) },
  });
}

// ---- Admin ----

export async function scheduleAppointment(enquiryId: string, input: { startsAt: Date; durationMinutes: number; mode: string; meetingDetails: string; agenda: string; counsellor?: string }, req: Request) {
  const e = await enquiryOr404(enquiryId);
  if (!isOpen(e.status)) throw new ApiError(409, 'ENQUIRY_FINISHED', 'This enquiry is finished');
  if (input.startsAt.getTime() <= Date.now()) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a time in the future', [{ field: 'startsAt', message: 'Choose a time in the future' }]);
  const counsellor = input.counsellor ?? (e.assignedTo ? String(e.assignedTo) : req.user!.id);
  await assertCounsellor(counsellor);
  await assertFree(counsellor, input.startsAt, input.durationMinutes);
  const a = await AppointmentModel.create({ ...input, counsellor, enquiry: e._id, student: e.student });
  await addEvent(e._id, { type: 'appointment', visibility: 'student', actor: eventActor(req), body: `Counselling session booked for ${fmtIST(input.startsAt)} (${MODES[input.mode]}).` });
  await audit(actorFrom(req), 'appointment.scheduled', { type: 'appointment', id: String(a._id) }, req, { enquiry: enquiryId });
  await emailStudent(a.toObject() as Lean, 'appointment_scheduled');
  await autoStatus(e, 'COUNSELLING_SCHEDULED', ['NEW', 'CONTACTED'], eventActor(req), 'Counselling session booked');
  return enquiryDetail(enquiryId);
}

export async function updateAppointment(id: string, patch: { startsAt?: Date; durationMinutes?: number; mode?: string; meetingDetails?: string; agenda?: string; counsellor?: string }, req: Request) {
  const a = await appointmentOr404({ _id: id });
  if (!ACTIVE_APPOINTMENT.includes(a.status)) throw new ApiError(409, 'APPOINTMENT_CLOSED', 'This appointment is no longer active');
  if (patch.startsAt && patch.startsAt.getTime() <= Date.now()) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a time in the future', [{ field: 'startsAt', message: 'Choose a time in the future' }]);
  const counsellor = patch.counsellor ?? String(a.counsellor);
  if (patch.counsellor) await assertCounsellor(patch.counsellor);
  const startsAt = patch.startsAt ?? a.startsAt;
  const durationMinutes = patch.durationMinutes ?? a.durationMinutes;
  const timeChanged = (patch.startsAt && patch.startsAt.getTime() !== a.startsAt.getTime()) || durationMinutes !== a.durationMinutes || counsellor !== String(a.counsellor);
  if (timeChanged) await assertFree(counsellor, startsAt, durationMinutes, a._id);
  // A new time needs the student's confirmation again and a fresh reminder.
  const set = { ...patch, counsellor: oid(counsellor), ...(timeChanged && { status: 'scheduled', reminderSentAt: null }) };
  const updated = (await AppointmentModel.findByIdAndUpdate(id, { $set: set }, { new: true }).lean()) as Lean;
  await addEvent(a.enquiry, { type: 'appointment', visibility: 'student', actor: eventActor(req), body: timeChanged ? `Counselling session moved to ${fmtIST(startsAt)}.` : 'Counselling session details updated.' });
  await audit(actorFrom(req), 'appointment.updated', { type: 'appointment', id }, req, { fields: Object.keys(patch) });
  await emailStudent(updated, 'appointment_updated');
  return enquiryDetail(String(a.enquiry));
}

export async function closeAppointment(id: string, action: 'cancel' | 'complete' | 'no_show', note: string, req: Request) {
  const a = await appointmentOr404({ _id: id });
  if (!ACTIVE_APPOINTMENT.includes(a.status)) throw new ApiError(409, 'APPOINTMENT_CLOSED', 'This appointment is no longer active');
  const status = { cancel: 'cancelled', complete: 'completed', no_show: 'no_show' }[action];
  await AppointmentModel.updateOne({ _id: id, status: a.status }, { $set: { status, outcomeNote: note } });
  const body = { cancel: `Counselling session on ${fmtIST(a.startsAt)} cancelled.${note ? ` Reason: ${note}` : ''}`, complete: 'Counselling session completed.', no_show: 'Counselling session missed.' }[action];
  // The cancellation reason is shared with the student; completion notes stay internal.
  await addEvent(a.enquiry, { type: 'appointment', visibility: 'student', actor: eventActor(req), body });
  if (action !== 'cancel' && note) await addEvent(a.enquiry, { type: 'note', visibility: 'internal', actor: eventActor(req), body: `Session notes: ${note}` });
  await audit(actorFrom(req), `appointment.${status}`, { type: 'appointment', id }, req);
  if (action === 'cancel') await emailStudent(a, 'appointment_cancelled', { reason: note });
  return enquiryDetail(String(a.enquiry));
}

export async function listAppointments(req: Request, q: { from?: Date; to?: Date; counsellor?: string; status?: string; page: number; limit: number }) {
  const filter: Record<string, unknown> = {};
  if (q.counsellor) filter.counsellor = oid(q.counsellor === 'me' ? req.user!.id : q.counsellor);
  if (q.status) filter.status = q.status;
  if (q.from || q.to) filter.startsAt = { ...(q.from && { $gte: q.from }), ...(q.to && { $lte: q.to }) };
  const [items, total] = await Promise.all([AppointmentModel.find(filter).sort({ startsAt: 1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), AppointmentModel.countDocuments(filter)]);
  const people = new Map((await UserModel.find({ _id: { $in: items.map((a) => a.counsellor) } }).select('name').lean()).map((u) => [String(u._id), u as Lean]));
  const enquiries = new Map((await EnquiryModel.find({ _id: { $in: items.map((a) => a.enquiry) } }).select('reference studentSnapshot.name').lean()).map((e) => [String(e._id), e]));
  return {
    items: (items as Lean[]).map((a) => ({ ...toAdminAppointment(a, people, enquiries.get(String(a.enquiry))?.reference), studentName: enquiries.get(String(a.enquiry))?.studentSnapshot?.name ?? null })),
    meta: pageMeta(q.page, q.limit, total),
  };
}

// ---- Student ----

const mine = (req: Request) => oid(req.user!.id);

export async function myAppointments(req: Request) {
  const items = (await AppointmentModel.find({ student: mine(req) }).sort({ startsAt: -1 }).limit(100).lean()) as Lean[];
  const people = new Map((await UserModel.find({ _id: { $in: items.map((a) => a.counsellor) } }).select('name').lean()).map((u) => [String(u._id), u.name]));
  const refs = new Map((await EnquiryModel.find({ _id: { $in: items.map((a) => a.enquiry) } }).select('reference').lean()).map((e) => [String(e._id), e.reference]));
  return items.map((a) => toStudentAppointment(a, people.get(String(a.counsellor)) ?? 'Counsellor', refs.get(String(a.enquiry))));
}

export async function studentAppointmentAction(req: Request, id: string, action: 'confirm' | 'reschedule' | 'cancel', note: string) {
  // Scoped to the student: someone else's appointment looks like it does not exist.
  const a = await appointmentOr404({ _id: id, student: mine(req) });
  const from = { confirm: ['scheduled'], reschedule: ['scheduled', 'confirmed'], cancel: ACTIVE_APPOINTMENT as string[] }[action];
  if (!from.includes(a.status)) throw new ApiError(409, 'APPOINTMENT_STATE', 'This appointment cannot be changed that way now');
  if (action !== 'confirm' && !note) throw new ApiError(422, 'VALIDATION_ERROR', 'Tell your counsellor why', [{ field: 'note', message: 'Add a short note' }]);
  const status = { confirm: 'confirmed', reschedule: 'reschedule_requested', cancel: 'cancelled' }[action];
  const r = await AppointmentModel.updateOne({ _id: id, status: a.status }, { $set: { status, ...(action !== 'confirm' && { studentNote: note }) } });
  if (!r.modifiedCount) throw new ApiError(409, 'APPOINTMENT_STATE', 'This appointment was just changed. Reload and try again.');
  const verb = { confirm: 'confirmed', reschedule: 'asked to reschedule', cancel: 'cancelled' }[action];
  await addEvent(a.enquiry, { type: 'appointment', visibility: 'student', actor: eventActor(req), body: `You ${verb} the session on ${fmtIST(a.startsAt)}.${note ? ` Note: ${note}` : ''}` });
  if (action !== 'confirm') {
    const [counsellor, e] = await Promise.all([UserModel.findById(a.counsellor).select('email').lean(), EnquiryModel.findById(a.enquiry).select('reference').lean()]);
    if (counsellor) {
      await safeEmail({ to: counsellor.email, template: 'appointment_change_request', params: { name: req.user!.name, action: verb, when: fmtIST(a.startsAt), reference: e?.reference ?? '', note, link: ADMIN_LINK }, dedupeKey: `appt:${id}:${action}:${Date.now()}` });
    }
  }
  return (await myAppointments(req)).find((x) => x.id === id);
}

// ---- Reminders ----

// Emails a reminder once for each active session starting within the next 24 hours. Each appointment is claimed
// atomically (reminderSentAt), so overlapping runs or several servers never send twice. Rescheduling clears it.
export async function sendAppointmentReminders(now = new Date()) {
  const due = await AppointmentModel.find({ status: { $in: ['scheduled', 'confirmed'] }, reminderSentAt: null, startsAt: { $gt: now, $lte: new Date(now.getTime() + 24 * 3_600_000) } }).limit(100).lean();
  let sent = 0;
  for (const a of due as Lean[]) {
    const claimed = await AppointmentModel.updateOne({ _id: a._id, reminderSentAt: null }, { $set: { reminderSentAt: now } });
    if (!claimed.modifiedCount) continue;
    const [e, counsellor] = await Promise.all([EnquiryModel.findById(a.enquiry).select('reference studentSnapshot').lean(), UserModel.findById(a.counsellor).select('name').lean()]);
    if (!e) continue;
    await safeEmail({
      to: e.studentSnapshot!.email,
      template: 'appointment_reminder',
      params: { name: e.studentSnapshot!.name, reference: e.reference, when: fmtIST(a.startsAt), mode: MODES[a.mode]!, counsellor: counsellor?.name ?? 'your counsellor', details: a.meetingDetails, link: STUDENT_LINK },
      dedupeKey: `appt-reminder:${String(a._id)}:${a.startsAt.toISOString()}`,
    });
    sent += 1;
  }
  return sent;
}

let timer: NodeJS.Timeout | null = null;
export function startAppointmentReminders(intervalMs = 5 * 60_000) {
  if (timer || env.isTest) return stopAppointmentReminders;
  const run = () => sendAppointmentReminders().catch((err: Error) => logger.error({ err: { name: err.name, message: err.message } }, 'Appointment reminder run failed'));
  timer = setInterval(run, intervalMs);
  timer.unref();
  void run();
  return stopAppointmentReminders;
}
export function stopAppointmentReminders() {
  if (timer) clearInterval(timer);
  timer = null;
}
