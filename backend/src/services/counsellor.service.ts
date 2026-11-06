import type { Request } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { CollegeModel } from '../models/College.js';
import { CollegeCourseModel } from '../models/CollegeCourse.js';
import { CourseModel } from '../models/Course.js';
import { EnquiryModel, FINISHED_STATUSES, type EnquiryStatus } from '../models/Enquiry.js';
import { StudentProfileModel } from '../models/StudentProfile.js';
import { UserModel, toPublicUser } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { actorFrom, audit } from './audit.service.js';
import { enqueueEmail } from './email.service.js';
import * as admin from './enquiryAdmin.service.js';
import { addEvent, eventActor } from './enquiryShared.js';
import { checkEligibility, type StudentAcademics } from './eligibility.service.js';
import { endAllSessions } from './session.service.js';
import { getSiteSettings } from './settings.service.js';
import { marksOf } from './student.service.js';
import { issueToken } from './token.service.js';

// Counsellors: accounts with role "counsellor" that work only on the enquiries assigned to them. Admins manage
// them (create, edit, activate/deactivate), assign work and see each counsellor's performance.

type Lean = Record<string, any> & { _id: mongoose.Types.ObjectId }; // eslint-disable-line @typescript-eslint/no-explicit-any
const oid = (id: string) => new mongoose.Types.ObjectId(id);
const frontend = (path: string) => `${env.FRONTEND_URL.replace(/\/+$/, '')}${path}`;
const CONTACTED: EnquiryStatus[] = ['CONTACTED', 'INTERESTED', 'ELIGIBILITY_CHECK', 'COUNSELLING_SCHEDULED', 'COUNSELLING_COMPLETED', 'DOCUMENTS_PENDING', 'APPLICATION_IN_PROGRESS', 'SUBMITTED', 'OFFER_RECEIVED', 'ADMITTED'];
const CLOSED: EnquiryStatus[] = ['NOT_INTERESTED', 'REJECTED', 'WITHDRAWN', 'CLOSED'];

// ---- The counsellor's own work ----

// Any enquiry not assigned to this counsellor answers 404 (no hint that it exists).
async function assignedOr404(id: string, userId: string) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Enquiry not found');
  const e = (await EnquiryModel.findOne({ _id: id, assignedTo: oid(userId) }).lean()) as Lean | null;
  if (!e) throw ApiError.notFound('Enquiry not found');
  return e;
}

export async function counsellorSummary(userId: string) {
  const me = oid(userId);
  const open = { assignedTo: me, status: { $nin: FINISHED_STATUSES } };
  const { start, end } = admin.istDay();
  const [assignedOpen, assignedTotal, converted, followUpsToday, followUpsOverdue] = await Promise.all([
    EnquiryModel.countDocuments(open),
    EnquiryModel.countDocuments({ assignedTo: me }),
    EnquiryModel.countDocuments({ assignedTo: me, status: 'ADMITTED' }),
    EnquiryModel.countDocuments({ ...open, followUpAt: { $gte: start, $lt: end } }),
    EnquiryModel.countDocuments({ ...open, followUpAt: { $lt: start } }),
  ]);
  return { assignedOpen, assignedTotal, converted, followUpsToday, followUpsOverdue };
}

// The admin list and filters, always limited to "assigned to me".
export async function listMine(req: Request, q: Parameters<typeof admin.listEnquiries>[1]) {
  return admin.listEnquiries(req, { ...q, assigned: 'me' });
}

async function academicsOf(e: Lean): Promise<StudentAcademics & { stream: string; graduationDegree: string; exams: Array<{ name: string; score: string; year: number | null }> }> {
  const p = (await StudentProfileModel.findOne({ user: e.student }).lean()) as Lean | null;
  const marks = marksOf(p?.marks);
  const snap = e.studentSnapshot ?? {};
  const exams = ((p?.academic?.entranceExams ?? snap.entranceExams ?? []) as Array<{ name: string; score: string; year: number | null }>).map(({ name, score, year }) => ({ name, score, year }));
  return {
    highestQualification: p?.academic?.highestQualification ?? snap.qualification ?? null,
    percentage: p?.academic?.percentage ?? snap.percentage ?? null,
    marks: { class10: marks.class10.percentage ?? snap.marks?.class10 ?? null, class12: marks.class12.percentage ?? snap.marks?.class12 ?? null, graduation: marks.graduation.percentage ?? snap.marks?.graduation ?? null },
    entranceExams: exams.map((x) => x.name),
    stream: marks.class12.stream,
    graduationDegree: marks.graduation.degree,
    exams,
  };
}

// Eligibility for the active courses at the colleges the student chose, and for the courses they want elsewhere.
async function eligibilityFor(e: Lean, s: StudentAcademics, limit = 30) {
  const or: Record<string, unknown>[] = [];
  if (e.preferences.colleges?.length) or.push({ college: { $in: e.preferences.colleges } });
  if (e.preferences.courses?.length) or.push({ course: { $in: e.preferences.courses } });
  if (!or.length) return [];
  const candidates = (await CollegeCourseModel.find({ status: 'active', $or: or }).limit(500).lean()) as Lean[];
  const published = new Set((await CollegeModel.find({ _id: { $in: candidates.map((o) => o.college) }, status: 'published' }).select('_id').lean()).map((c) => String(c._id)));
  return offeringRows(candidates.filter((o) => published.has(String(o.college))).slice(0, limit), s);
}

async function offeringRows(offerings: Lean[], s: StudentAcademics) {
  const [courses, colleges] = await Promise.all([
    CourseModel.find({ _id: { $in: offerings.map((o) => o.course) } }).select('name slug level').lean(),
    CollegeModel.find({ _id: { $in: offerings.map((o) => o.college) } }).select('name slug city state').lean(),
  ]);
  const course = new Map(courses.map((c) => [String(c._id), c]));
  const college = new Map(colleges.map((c) => [String(c._id), c]));
  return offerings.map((o) => {
    const c = course.get(String(o.course));
    const k = college.get(String(o.college));
    const check = checkEligibility(s, { level: c?.level ?? 'ug', minQualification: o.minQualification ?? null, minPercentage: o.minPercentage ?? null, entranceExams: o.entranceExams ?? [] });
    return { offeringId: String(o._id), courseName: c?.name ?? 'Course', courseSlug: c?.slug ?? '', specialization: o.specialization ?? '', collegeName: k?.name ?? 'College', collegeSlug: k?.slug ?? '', place: [k?.city, k?.state].filter(Boolean).join(', '), eligibility: check.result, reasons: check.reasons };
  });
}

export async function mineDetail(id: string, userId: string) {
  const e = await assignedOr404(id, userId);
  const view = await admin.enquiryDetail(id);
  const academics = await academicsOf(e);
  return { ...view, academics, eligibility: await eligibilityFor(e, academics) };
}

export async function updateMine(id: string, req: Request, patch: { followUpAt?: Date | null }) {
  await assignedOr404(id, req.user!.id);
  await admin.updateEnquiry(id, { followUpAt: patch.followUpAt }, req);
  return mineDetail(id, req.user!.id);
}
export async function statusMine(id: string, req: Request, input: Parameters<typeof admin.changeStatus>[1]) {
  await assignedOr404(id, req.user!.id);
  await admin.changeStatus(id, input, req);
  return mineDetail(id, req.user!.id);
}
export async function noteMine(id: string, req: Request, body: string) {
  await assignedOr404(id, req.user!.id);
  await admin.addNote(id, body, req);
  return mineDetail(id, req.user!.id);
}
export async function contactMine(id: string, req: Request, input: { channel: string; outcome: string; note: string }) {
  await assignedOr404(id, req.user!.id);
  await admin.addContactAttempt(id, input, req);
  return mineDetail(id, req.user!.id);
}
export async function replyMine(id: string, req: Request, body: string) {
  await assignedOr404(id, req.user!.id);
  await admin.replyToStudent(id, body, req);
  return mineDetail(id, req.user!.id);
}

// Suggested courses, visible to the student with their eligibility (never a promise of admission).
export async function recommend(id: string, req: Request, input: { offerings: string[]; note: string }) {
  const e = req.user!.role === 'counsellor' ? await assignedOr404(id, req.user!.id) : ((await admin.enquiryOr404(id)) as Lean);
  const offerings = (await CollegeCourseModel.find({ _id: { $in: input.offerings.map(oid) }, status: 'active' }).lean()) as Lean[];
  const published = new Set((await CollegeModel.find({ _id: { $in: offerings.map((o) => o.college) }, status: 'published' }).select('_id').lean()).map((c) => String(c._id)));
  const usable = offerings.filter((o) => published.has(String(o.college)));
  if (usable.length !== input.offerings.length) throw new ApiError(422, 'VALIDATION_ERROR', 'Recommend only active courses of active colleges', [{ field: 'offerings', message: 'One or more courses are not available' }]);
  const rows = await offeringRows(usable, await academicsOf(e));
  await addEvent(e._id, { type: 'recommendation', visibility: 'student', actor: eventActor(req), body: input.note, meta: { items: rows } });
  await EnquiryModel.updateOne({ _id: e._id }, { $set: { lastActivityAt: new Date() } });
  await audit(actorFrom(req), 'enquiry.recommended', { type: 'enquiry', id }, req, { offerings: input.offerings });
  return req.user!.role === 'counsellor' ? mineDetail(id, req.user!.id) : admin.enquiryDetail(id);
}

// Eligibility of any active course for this enquiry's student (counsellor checks a college/course on request).
export async function eligibilityCheck(id: string, req: Request, offeringIds: string[]) {
  const e = req.user!.role === 'counsellor' ? await assignedOr404(id, req.user!.id) : ((await admin.enquiryOr404(id)) as Lean);
  const offerings = (await CollegeCourseModel.find({ _id: { $in: offeringIds.map(oid) }, status: 'active' }).lean()) as Lean[];
  return offeringRows(offerings, await academicsOf(e));
}

// ---- Admin: counsellor accounts and performance ----

export async function performance(range: { from?: Date; to?: Date } = {}) {
  const people = (await UserModel.find({ role: 'counsellor' }).sort({ name: 1 }).lean()) as Lean[];
  const match: Record<string, unknown> = { assignedTo: { $in: people.map((p) => p._id) } };
  if (range.from || range.to) match.createdAt = { ...(range.from && { $gte: range.from }), ...(range.to && { $lte: range.to }) };
  const { start } = admin.istDay();
  const rows = await EnquiryModel.aggregate<{ _id: mongoose.Types.ObjectId; assigned: number; contacted: number; pending: number; converted: number; closed: number; overdue: number }>([
    { $match: match },
    {
      $group: {
        _id: '$assignedTo',
        assigned: { $sum: 1 },
        contacted: { $sum: { $cond: [{ $in: ['$status', CONTACTED] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $in: ['$status', ['NEW', 'CONTACT_PENDING']] }, 1, 0] } },
        converted: { $sum: { $cond: [{ $eq: ['$status', 'ADMITTED'] }, 1, 0] } },
        closed: { $sum: { $cond: [{ $in: ['$status', CLOSED] }, 1, 0] } },
        overdue: { $sum: { $cond: [{ $and: [{ $lt: ['$followUpAt', start] }, { $ne: ['$followUpAt', null] }, { $not: [{ $in: ['$status', FINISHED_STATUSES] }] }] }, 1, 0] } },
      },
    },
  ]);
  const by = new Map(rows.map((r) => [String(r._id), r]));
  return people.map((p) => {
    const r = by.get(String(p._id));
    const assigned = r?.assigned ?? 0;
    return {
      ...toPublicUser(p as never),
      stats: { assigned, contacted: r?.contacted ?? 0, pending: r?.pending ?? 0, converted: r?.converted ?? 0, closed: r?.closed ?? 0, overdue: r?.overdue ?? 0, conversionRate: assigned ? Math.round(((r?.converted ?? 0) / assigned) * 1000) / 10 : 0 },
    };
  });
}

// Creates a counsellor with no password; they set it from an emailed single-use link (like admin invitations).
export async function createCounsellor(input: { name: string; email: string; mobile?: string }, req: Request) {
  if (await UserModel.exists({ email: input.email })) throw new ApiError(409, 'EMAIL_IN_USE', 'An account with this email already exists');
  const user = await UserModel.create({ name: input.name, email: input.email, mobile: input.mobile || undefined, role: 'counsellor', permissions: [], passwordHash: null });
  const { token, id } = await issueToken(String(user._id), 'set_password');
  const setLink = `${frontend('/set-password')}?token=${encodeURIComponent(token)}`;
  await enqueueEmail({ to: input.email, template: 'counsellor_invite', params: { name: input.name, invitedBy: req.user!.name }, secretParams: { link: setLink }, dedupeKey: `counsellor-invite:${id}` });
  await audit(actorFrom(req), 'counsellor.created', { type: 'user', id: String(user._id) }, req, { email: input.email });
  return toPublicUser(user);
}

async function counsellorOr404(id: string) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Counsellor not found');
  const u = await UserModel.findOne({ _id: id, role: 'counsellor' }).lean();
  if (!u) throw ApiError.notFound('Counsellor not found');
  return u;
}

export async function updateCounsellor(id: string, patch: { name?: string; mobile?: string }, req: Request) {
  await counsellorOr404(id);
  const user = await UserModel.findOneAndUpdate({ _id: id, role: 'counsellor' }, { $set: patch }, { new: true, runValidators: true }).lean();
  await audit(actorFrom(req), 'counsellor.updated', { type: 'user', id }, req, { fields: Object.keys(patch) });
  return toPublicUser(user!);
}

// Deactivating signs the counsellor out everywhere; their enquiries stay assigned so they can be reassigned.
export async function setCounsellorActive(id: string, active: boolean, req: Request) {
  await counsellorOr404(id);
  const user = await UserModel.findOneAndUpdate({ _id: id, role: 'counsellor' }, { $set: { status: active ? 'active' : 'disabled' } }, { new: true }).lean();
  if (!active) await endAllSessions(id);
  const open = await EnquiryModel.countDocuments({ assignedTo: oid(id), status: { $nin: FINISHED_STATUSES } });
  await audit(actorFrom(req), active ? 'counsellor.activated' : 'counsellor.deactivated', { type: 'user', id }, req, { openEnquiries: open });
  return { ...toPublicUser(user!), openEnquiries: open };
}

// ---- Automatic assignment (site setting, off by default) ----

// The active counsellor with the fewest open enquiries (ties: the one assigned least recently by name order).
export async function autoAssign(enquiryId: unknown) {
  const settings = await getSiteSettings();
  if (!settings.crm?.autoAssign) return null;
  const people = await UserModel.find({ role: 'counsellor', status: 'active' }).select('name email').sort({ name: 1 }).lean();
  if (!people.length) return null;
  const loads = await EnquiryModel.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([{ $match: { assignedTo: { $in: people.map((p) => p._id) }, status: { $nin: FINISHED_STATUSES } } }, { $group: { _id: '$assignedTo', n: { $sum: 1 } } }]);
  const load = new Map(loads.map((l) => [String(l._id), l.n]));
  const pick = [...people].sort((a, b) => (load.get(String(a._id)) ?? 0) - (load.get(String(b._id)) ?? 0))[0]!;
  const done = await EnquiryModel.updateOne({ _id: enquiryId, assignedTo: null }, { $set: { assignedTo: pick._id } });
  if (!done.modifiedCount) return null;
  await addEvent(enquiryId as mongoose.Types.ObjectId, { type: 'assignment', visibility: 'internal', actor: { user: null, role: 'system', name: 'Automatic assignment' }, body: `Assigned to ${pick.name} (fewest open enquiries)` });
  return pick;
}

// ---- Daily follow-up reminders (sent once a day after 09:00 IST) ----

export async function sendFollowUpDigests(now = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60_000);
  if (ist.getUTCHours() < 9) return 0;
  const day = ist.toISOString().slice(0, 10);
  const { start, end } = admin.istDay(now);
  const people = await UserModel.find({ role: 'counsellor', status: 'active' }).select('name email').lean();
  let sent = 0;
  for (const p of people) {
    const open = { assignedTo: p._id, status: { $nin: FINISHED_STATUSES } };
    const [today, overdue] = await Promise.all([EnquiryModel.countDocuments({ ...open, followUpAt: { $gte: start, $lt: end } }), EnquiryModel.countDocuments({ ...open, followUpAt: { $lt: start } })]);
    if (!today && !overdue) continue;
    await enqueueEmail({ to: p.email, template: 'followup_digest', params: { name: p.name, today: String(today), overdue: String(overdue) }, secretParams: { link: frontend('/counsellor/enquiries?quick=today') }, dedupeKey: `followup-digest:${String(p._id)}:${day}` });
    sent += 1;
  }
  return sent;
}

// New enquiries assigned to this counsellor per India-time day, for the last `days` days (oldest first, days with
// none included as 0). One aggregation instead of one request per day.
export async function counsellorTrend(userId: string, days: number) {
  const { start } = admin.istDay();
  const since = new Date(start.getTime() - (days - 1) * 86_400_000);
  const rows = await EnquiryModel.aggregate<{ _id: string; count: number }>([
    { $match: { assignedTo: oid(userId), createdAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } }, count: { $sum: 1 } } },
  ]);
  const byDay = new Map(rows.map((r) => [r._id, r.count]));
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(since.getTime() + i * 86_400_000 + 330 * 60_000).toISOString().slice(0, 10);
    return { day, count: byDay.get(day) ?? 0 };
  });
}
