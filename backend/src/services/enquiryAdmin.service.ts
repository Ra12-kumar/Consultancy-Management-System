import type { Request } from 'express';
import { env } from '../config/env.js';
import { AdmissionApplicationModel } from '../models/Admission.js';
import { ACTIVE_APPOINTMENT, AppointmentModel } from '../models/Appointment.js';
import { CourseModel } from '../models/Course.js';
import { EnquiryModel, FINISHED_STATUSES, PIPELINE, type EnquiryStatus } from '../models/Enquiry.js';
import { UserModel } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { actorFrom, audit } from './audit.service.js';
import { escapeRegex, pageMeta } from './catalog.service.js';
import { addEvent, adminEnquiryLink, counsellors, eventActor, oid, safeEmail, statusLabel, studentEnquiryLink, type EventActor } from './enquiryShared.js';
import { toAdminEnquiry } from './enquiryViews.js';
import { APPLICATION_GATES, NOTIFY_STATUSES, allowedTransitions, isOpen, reasonRequired } from './enquiryWorkflow.js';

type Lean = Record<string, any> & { _id: import('mongoose').Types.ObjectId }; // eslint-disable-line @typescript-eslint/no-explicit-any
const invalid = (field: string, message: string, code = 'VALIDATION_ERROR') => new ApiError(422, code, message, [{ field, message }]);

export async function enquiryOr404(id: string) {
  const e = await EnquiryModel.findById(id).lean();
  if (!e) throw ApiError.notFound('Enquiry not found');
  return e as Lean;
}

const touch = (id: unknown) => EnquiryModel.updateOne({ _id: id }, { $set: { lastActivityAt: new Date() } });

async function notifyStatus(e: Lean, to: EnquiryStatus, message: string) {
  if (!NOTIFY_STATUSES.includes(to)) return;
  await safeEmail({
    to: e.studentSnapshot.email,
    template: 'enquiry_status',
    params: { reference: e.reference, name: e.studentSnapshot.name, status: statusLabel(to), message, link: studentEnquiryLink(e.reference) },
    dedupeKey: `enq-status:${String(e._id)}:${to}:${Date.now()}`,
    related: { type: 'enquiry', id: String(e._id) },
  });
}

// Moves the status as a side effect of another action (an appointment or a document request), only forward from
// the given earlier statuses. Recorded and emailed like a manual change.
export async function autoStatus(e: Lean, to: EnquiryStatus, fromAllowed: EnquiryStatus[], actor: EventActor, note: string) {
  if (!fromAllowed.includes(e.status)) return e;
  const updated = await EnquiryModel.findOneAndUpdate({ _id: e._id, status: e.status }, { $set: { status: to, studentMessage: '', lastActivityAt: new Date() } }, { new: true }).lean();
  if (!updated) return e;
  await addEvent(e._id, { type: 'status_change', visibility: 'student', actor, fromStatus: e.status, toStatus: to, reason: note, body: '' });
  await notifyStatus(updated as Lean, to, '');
  return updated as Lean;
}

// ---- Lists ----

type ListQuery = { q?: string; status?: EnquiryStatus; open?: 'yes'; assigned?: string; course?: string; college?: string; state?: string; from?: Date; to?: Date; followUpDue?: 'yes'; sort: 'newest' | 'oldest' | 'activity' | 'follow_up'; page: number; limit: number };

export async function listEnquiries(req: Request, q: ListQuery) {
  const filter: Record<string, unknown> = {};
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q.trim()), 'i');
    filter.$or = [{ reference: rx }, { 'studentSnapshot.name': rx }, { 'studentSnapshot.email': rx }, { 'studentSnapshot.mobile': rx }];
  }
  if (q.status) filter.status = q.status;
  else if (q.open === 'yes') filter.status = { $nin: FINISHED_STATUSES };
  if (q.assigned === 'me') filter.assignedTo = oid(req.user!.id);
  else if (q.assigned === 'unassigned') filter.assignedTo = null;
  else if (q.assigned) filter.assignedTo = oid(q.assigned);
  if (q.course) filter['preferences.courses'] = oid(q.course);
  if (q.college) filter['preferences.colleges'] = oid(q.college);
  if (q.state) filter['studentSnapshot.state'] = new RegExp(`^${escapeRegex(q.state)}$`, 'i');
  if (q.from || q.to) filter.createdAt = { ...(q.from && { $gte: q.from }), ...(q.to && { $lte: q.to }) };
  if (q.followUpDue === 'yes') {
    filter.followUpAt = { $lte: new Date() };
    filter.status = filter.status ?? { $nin: FINISHED_STATUSES };
  }
  const order: Record<string, 1 | -1> = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, activity: { lastActivityAt: -1 }, follow_up: { followUpAt: 1, createdAt: 1 } }[q.sort] as Record<string, 1 | -1>;
  const [items, total] = await Promise.all([EnquiryModel.find(filter).sort({ ...order, _id: 1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), EnquiryModel.countDocuments(filter)]);
  const people = new Map((await UserModel.find({ _id: { $in: items.map((i) => i.assignedTo).filter(Boolean) } }).select('name').lean()).map((u) => [String(u._id), u.name]));
  const courseNames = new Map((await CourseModel.find({ _id: { $in: items.flatMap((i) => i.preferences!.courses) } }).select('name').lean()).map((c) => [String(c._id), c.name]));
  const now = Date.now();
  return {
    items: items.map((e) => ({
      id: String(e._id),
      reference: e.reference,
      status: e.status,
      studentName: e.studentSnapshot!.name,
      studentEmail: e.studentSnapshot!.email,
      place: [e.studentSnapshot!.city, e.studentSnapshot!.state].filter(Boolean).join(', '),
      courses: e.preferences!.courses.map((c) => courseNames.get(String(c)) ?? '—'),
      assignedTo: e.assignedTo ? (people.get(String(e.assignedTo)) ?? '—') : null,
      followUpAt: e.followUpAt ?? null,
      followUpDue: Boolean(e.followUpAt && e.followUpAt.getTime() <= now && isOpen(e.status as EnquiryStatus)),
      createdAt: e.createdAt,
      lastActivityAt: e.lastActivityAt,
    })),
    meta: pageMeta(q.page, q.limit, total),
  };
}

export async function enquiryDetail(id: string) {
  return toAdminEnquiry(await enquiryOr404(id));
}

export async function listCounsellors() {
  return (await counsellors()).map((u) => ({ id: String(u._id), name: u.name, email: u.email }));
}

// ---- Assignment and follow-up ----

export async function updateEnquiry(id: string, patch: { assignedTo?: string | null; followUpAt?: Date | null }, req: Request) {
  const e = await enquiryOr404(id);
  const set: Record<string, unknown> = { lastActivityAt: new Date() };
  if (patch.assignedTo !== undefined) {
    if (patch.assignedTo && !(await UserModel.exists({ _id: patch.assignedTo, role: 'admin', status: 'active', permissions: 'enquiries.manage' }))) throw invalid('assignedTo', 'Choose a counsellor from the list');
    set.assignedTo = patch.assignedTo ? oid(patch.assignedTo) : null;
  }
  if (patch.followUpAt !== undefined) set.followUpAt = patch.followUpAt;
  await EnquiryModel.updateOne({ _id: id }, { $set: set });

  if (patch.assignedTo !== undefined && String(patch.assignedTo ?? '') !== String(e.assignedTo ?? '')) {
    const counsellor = patch.assignedTo ? await UserModel.findById(patch.assignedTo).select('name email').lean() : null;
    await addEvent(id, { type: 'assignment', visibility: 'internal', actor: eventActor(req), body: counsellor ? `Assigned to ${counsellor.name}` : 'Unassigned' });
    if (counsellor && String(counsellor._id) !== req.user!.id) {
          const course = await CourseModel.findById(e.preferences.courses[0]).select('name').lean();
      await safeEmail({ to: counsellor.email, template: 'enquiry_assigned', params: { reference: e.reference, name: e.studentSnapshot.name, course: course?.name ?? 'a course', assignedBy: req.user!.name, link: adminEnquiryLink(id) }, dedupeKey: `enq-assign:${id}:${String(counsellor._id)}:${Date.now()}` });
    }
    await audit(actorFrom(req), 'enquiry.assigned', { type: 'enquiry', id }, req, { assignedTo: patch.assignedTo ?? null });
  }
  if (patch.followUpAt !== undefined && String(patch.followUpAt ?? '') !== String(e.followUpAt ?? '')) {
    await addEvent(id, { type: 'follow_up', visibility: 'internal', actor: eventActor(req), body: patch.followUpAt ? `Follow-up set for ${patch.followUpAt.toISOString()}` : 'Follow-up cleared', meta: { followUpAt: patch.followUpAt } });
  }
  return enquiryDetail(id);
}

// ---- Status ----

export async function changeStatus(id: string, input: { fromStatus: EnquiryStatus; toStatus: EnquiryStatus; reason: string; studentMessage: string }, req: Request) {
  const e = await enquiryOr404(id);
  if (e.status !== input.fromStatus) throw new ApiError(409, 'STATUS_CHANGED', 'This enquiry was updated by someone else. Reload to see its current status.');
  if (input.toStatus === 'ADMITTED') throw invalid('toStatus', 'Admission is confirmed from a college application with evidence, not set directly', 'USE_CONFIRM_ADMISSION');
  if (!allowedTransitions(e.status).includes(input.toStatus)) throw invalid('toStatus', `An enquiry cannot move from ${e.status} to ${input.toStatus}`, 'INVALID_TRANSITION');
  if (reasonRequired(e.status, input.toStatus) && !input.reason) throw invalid('reason', 'Give a reason for this change');
  const gate = APPLICATION_GATES[input.toStatus];
  if (gate && !(await AdmissionApplicationModel.exists({ enquiry: e._id, status: { $in: gate.statuses } }))) throw invalid('toStatus', gate.message, 'NEEDS_APPLICATION');

  const updated = await EnquiryModel.findOneAndUpdate({ _id: id, status: input.fromStatus }, { $set: { status: input.toStatus, studentMessage: input.studentMessage, lastActivityAt: new Date() } }, { new: true }).lean();
  if (!updated) throw new ApiError(409, 'STATUS_CHANGED', 'This enquiry was updated by someone else. Reload to see its current status.');
  await addEvent(id, { type: 'status_change', visibility: 'student', actor: eventActor(req), fromStatus: input.fromStatus, toStatus: input.toStatus, reason: input.reason, body: input.studentMessage });
  await audit(actorFrom(req), 'enquiry.status_changed', { type: 'enquiry', id }, req, { from: input.fromStatus, to: input.toStatus });
  await notifyStatus(updated as Lean, input.toStatus, input.studentMessage);
  return enquiryDetail(id);
}

// ---- Notes, contact attempts and messages ----

export async function addNote(id: string, body: string, req: Request) {
  await enquiryOr404(id);
  await addEvent(id, { type: 'note', visibility: 'internal', actor: eventActor(req), body });
  await touch(id);
  return enquiryDetail(id);
}

export async function addContactAttempt(id: string, input: { channel: string; outcome: string; note: string }, req: Request) {
  const e = await enquiryOr404(id);
  await addEvent(id, { type: 'contact_attempt', visibility: 'internal', actor: eventActor(req), body: input.note, meta: { channel: input.channel, outcome: input.outcome } });
  await touch(id);
  // Reaching the student for the first time moves a new enquiry to CONTACTED.
  if (input.outcome === 'reached') await autoStatus(e, 'CONTACTED', ['NEW'], eventActor(req), `Reached by ${input.channel}`);
  return enquiryDetail(id);
}

export async function replyToStudent(id: string, body: string, req: Request) {
  const e = await enquiryOr404(id);
  const ev = await addEvent(id, { type: 'message', visibility: 'student', actor: eventActor(req), body });
  await touch(id);
  await safeEmail({ to: e.studentSnapshot.email, template: 'enquiry_message', params: { reference: e.reference, from: `${req.user!.name} (${env.APP_NAME})`, body, link: studentEnquiryLink(e.reference) }, dedupeKey: `enq-msg:${String(ev._id)}` });
  return enquiryDetail(id);
}

// ---- Documents checklist (names only; uploads arrive in a later stage) ----

const DOC_STAGE_BEFORE: EnquiryStatus[] = PIPELINE.slice(0, PIPELINE.indexOf('DOCUMENTS_PENDING')) as EnquiryStatus[];

async function emailDocuments(e: Lean, key: string) {
  const pending = (e.documents ?? []).filter((d: Lean) => d.status === 'requested').map((d: Lean) => d.name);
  if (!pending.length) return false;
  await safeEmail({ to: e.studentSnapshot.email, template: 'documents_requested', params: { reference: e.reference, name: e.studentSnapshot.name, documents: pending.join(', '), link: studentEnquiryLink(e.reference) }, dedupeKey: key });
  return true;
}

export async function requestDocuments(id: string, input: { names: string[]; note: string }, req: Request) {
  const e = await enquiryOr404(id);
  if ((e.documents?.length ?? 0) + input.names.length > 20) throw invalid('names', 'An enquiry can track up to 20 documents');
  const updated = (await EnquiryModel.findByIdAndUpdate(id, { $push: { documents: { $each: input.names.map((name) => ({ name, note: input.note })) } }, $set: { lastActivityAt: new Date() } }, { new: true }).lean()) as Lean;
  const ev = await addEvent(id, { type: 'document', visibility: 'student', actor: eventActor(req), body: `Documents requested: ${input.names.join(', ')}${input.note ? `. ${input.note}` : ''}` });
  await emailDocuments(updated, `docs:${String(ev._id)}`);
  await autoStatus(updated, 'DOCUMENTS_PENDING', DOC_STAGE_BEFORE, eventActor(req), 'Documents requested');
  await audit(actorFrom(req), 'enquiry.documents_requested', { type: 'enquiry', id }, req, { names: input.names });
  return enquiryDetail(id);
}

export async function updateDocument(id: string, docId: string, input: { status?: 'requested' | 'received' | 'waived'; note?: string }, req: Request) {
  const e = await enquiryOr404(id);
  const doc = (e.documents ?? []).find((d: Lean) => String(d._id) === docId);
  if (!doc) throw ApiError.notFound('Document not found');
  const set: Record<string, unknown> = { lastActivityAt: new Date() };
  if (input.status) {
    set['documents.$.status'] = input.status;
    set['documents.$.receivedAt'] = input.status === 'received' ? new Date() : null;
  }
  if (input.note !== undefined) set['documents.$.note'] = input.note;
  await EnquiryModel.updateOne({ _id: id, 'documents._id': oid(docId) }, { $set: set });
  if (input.status && input.status !== doc.status) {
    await addEvent(id, { type: 'document', visibility: 'student', actor: eventActor(req), body: `${doc.name}: ${{ requested: 'requested again', received: 'received', waived: 'no longer needed' }[input.status]}` });
  }
  return enquiryDetail(id);
}

export async function remindDocuments(id: string) {
  const e = await enquiryOr404(id);
  const day = new Date().toISOString().slice(0, 10);
  if (!(await emailDocuments(e, `docs-remind:${id}:${day}`))) throw new ApiError(409, 'NOTHING_TO_REMIND', 'No documents are waiting');
  return { reminded: true };
}

// ---- Dashboard counts ----

export type DashboardFilter = { from?: Date; to?: Date; course?: string; college?: string; state?: string; status?: EnquiryStatus; scholarshipStatus?: string };

// Enquiry-based dashboard figures, optionally narrowed by date, course, college, state and status.
export async function enquiryCounts(f: DashboardFilter = {}) {
  const base: Record<string, unknown> = {};
  if (f.from || f.to) base.createdAt = { ...(f.from && { $gte: f.from }), ...(f.to && { $lte: f.to }) };
  if (f.course) base['preferences.courses'] = oid(f.course);
  if (f.college) base['preferences.colleges'] = oid(f.college);
  if (f.state) base['studentSnapshot.state'] = new RegExp(`^${escapeRegex(f.state)}$`, 'i');
  if (f.status) base.status = f.status;
  const filtered = Object.keys(base).length > 0;
  const scope = filtered ? { enquiry: { $in: await EnquiryModel.distinct('_id', base) } } : {};
  const now = new Date();
  const week = new Date(now.getTime() + 7 * 86_400_000);
  const open = { ...base, status: f.status ? f.status : { $nin: FINISHED_STATUSES } };
  const [total, fresh, unassigned, openCount, followUpsDue, inProgress, admitted, upcoming, recent] = await Promise.all([
    EnquiryModel.countDocuments(base),
    f.status && f.status !== 'NEW' ? Promise.resolve(0) : EnquiryModel.countDocuments({ ...base, status: 'NEW' }),
    EnquiryModel.countDocuments({ ...open, assignedTo: null }),
    EnquiryModel.countDocuments(open),
    EnquiryModel.countDocuments({ ...open, followUpAt: { $lte: now } }),
    AdmissionApplicationModel.countDocuments({ ...scope, status: { $in: ['planned', 'submitted', 'offer_received'] } }),
    // Only admissions confirmed with evidence count as confirmed.
    AdmissionApplicationModel.countDocuments({ ...scope, status: 'admitted', 'evidence.verifiedAt': { $ne: null } }),
    AppointmentModel.countDocuments({ ...scope, status: { $in: ACTIVE_APPOINTMENT }, startsAt: { $gte: now, $lte: week } }),
    EnquiryModel.find(base).sort({ createdAt: -1 }).limit(6).select('reference status studentSnapshot.name createdAt').lean(),
  ]);
  return {
    filtered,
    enquiries: { total, new: fresh, unassigned, open: openCount, followUpsDue },
    applications: { inProgress, confirmedAdmissions: admitted },
    appointments: { next7Days: upcoming },
    recentEnquiries: recent.map((e) => ({ id: String(e._id), reference: e.reference, status: e.status, studentName: e.studentSnapshot!.name, createdAt: e.createdAt })),
  };
}
