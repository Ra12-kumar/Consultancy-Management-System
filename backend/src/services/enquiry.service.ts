import type { Request } from 'express';
import { env } from '../config/env.js';
import { AdmissionApplicationModel } from '../models/Admission.js';
import { CollegeModel } from '../models/College.js';
import { CollegeCourseModel } from '../models/CollegeCourse.js';
import { CollegeFeeModel } from '../models/CollegeFee.js';
import { CourseModel } from '../models/Course.js';
import { EnquiryEventModel, EnquiryModel, FINISHED_STATUSES } from '../models/Enquiry.js';
import { LocationModel } from '../models/Location.js';
import { StudentProfileModel } from '../models/StudentProfile.js';
import { UserModel } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import type { CreateEnquiryInput } from '../validators/enquiry.validators.js';
import { actorFrom, audit } from './audit.service.js';
import { pageMeta } from './catalog.service.js';
import { addEvent, adminEnquiryLink, counsellors, eventActor, nextReference, oid, safeEmail, studentEnquiryLink } from './enquiryShared.js';
import { breakdownOf } from './fee.service.js';
import { isOpen } from './enquiryWorkflow.js';
import { studentEnquirySummary, toStudentApplication, toStudentEnquiry, toStudentEvent } from './enquiryViews.js';

type Lean = Record<string, any> & { _id: import('mongoose').Types.ObjectId }; // eslint-disable-line @typescript-eslint/no-explicit-any
const me = (req: Request) => oid(req.user!.id);

// The student's own enquiry by reference. Anyone else's looks like it does not exist.
export async function ownEnquiry(req: Request, reference: string) {
  const e = await EnquiryModel.findOne({ reference, student: me(req) }).lean();
  if (!e) throw ApiError.notFound('Enquiry not found');
  return e as Lean;
}

async function validatePreferences(p: CreateEnquiryInput) {
  const fail = (field: string, message: string) => new ApiError(422, 'VALIDATION_ERROR', message, [{ field, message }]);
  if ((await CourseModel.countDocuments({ _id: { $in: p.courses }, isActive: true })) !== p.courses.length) throw fail('courses', 'Choose courses from the list');
  if (p.locations.length && (await LocationModel.countDocuments({ _id: { $in: p.locations }, isActive: true })) !== p.locations.length) throw fail('locations', 'Choose locations from the list');
  if (p.colleges.length && (await CollegeModel.countDocuments({ _id: { $in: p.colleges }, status: 'published' })) !== p.colleges.length) throw fail('colleges', 'Choose colleges from the directory');
}

// The fee estimate for each preferred college and course, as currently published. Stored with the enquiry and never
// recalculated, so it keeps the original estimate even after fees change.
async function feeSnapshot(collegeIds: string[], courseIds: string[]) {
  if (!collegeIds.length) return [];
  const [colleges, courses] = await Promise.all([CollegeModel.find({ _id: { $in: collegeIds } }).select('name isSample').lean(), CourseModel.find({ _id: { $in: courseIds } }).select('name').lean()]);
  const out = [];
  for (const college of colleges) {
    for (const course of courses) {
      const offerings = await CollegeCourseModel.find({ college: college._id, course: course._id, status: 'active' }).select('_id').lean();
      if (!offerings.length) continue;
      const fee = await CollegeFeeModel.findOne({ collegeCourse: { $in: offerings.map((o) => o._id) }, status: 'published' }).sort({ academicYear: -1, officialTotalMinor: 1 }).lean();
      if (!fee) continue;
      const b = breakdownOf({ components: fee.components as never, durationMonths: fee.durationMonths, consultancyServiceChargeMinor: fee.consultancyServiceChargeMinor ?? 0, discount: (fee.discount as never) ?? null });
      out.push({
        college: college._id,
        collegeName: college.name,
        course: course._id,
        courseName: course.name,
        fee: fee._id,
        version: fee.version,
        academicYear: fee.academicYear,
        intake: fee.intake,
        officialTotalMinor: b.officialAfterDiscountMinor,
        consultancyServiceChargeMinor: b.consultancyServiceChargeMinor,
        estimatedTotalMinor: b.estimatedTotalMinor,
        isSample: Boolean(college.isSample),
      });
    }
  }
  return out;
}

export async function createEnquiry(req: Request, input: CreateEnquiryInput) {
  // A retried submission (same key) returns the enquiry already created.
  const again = await EnquiryModel.findOne({ student: me(req), idempotencyKey: input.idempotencyKey }).lean();
  if (again) return { enquiry: await toStudentEnquiry(again as Lean), duplicate: true };

  await validatePreferences(input);
  // One open enquiry per student and main course.
  const open = await EnquiryModel.findOne({ student: me(req), 'preferences.courses.0': oid(input.courses[0]!), status: { $nin: FINISHED_STATUSES } }).select('reference').lean();
  if (open) throw new ApiError(409, 'DUPLICATE_ENQUIRY', `You already have an open enquiry for this course (${open.reference}). Add details to it instead.`, [{ field: 'reference', message: open.reference }]);

  const [user, profile] = await Promise.all([UserModel.findById(req.user!.id).lean(), StudentProfileModel.findOne({ user: req.user!.id }).lean()]);
  const { idempotencyKey, source, campaign, callbackTime, ...preferences } = input;
  let created;
  try {
    created = await EnquiryModel.create({
      reference: await nextReference('ENQ'),
      student: me(req),
      idempotencyKey,
      source,
      campaign,
      callbackTime,
      studentSnapshot: {
        name: user!.name,
        email: user!.email,
        mobile: user!.mobile ?? null,
        city: profile?.personal?.city ?? '',
        state: profile?.personal?.state ?? '',
        qualification: profile?.academic?.highestQualification ?? null,
        percentage: profile?.academic?.percentage ?? null,
        passingYear: profile?.academic?.passingYear ?? null,
        entranceExams: profile?.academic?.entranceExams ?? [],
        marks: { class10: profile?.marks?.class10?.percentage ?? null, class12: profile?.marks?.class12?.percentage ?? null, graduation: profile?.marks?.graduation?.percentage ?? null },
      },
      preferences,
      feeEstimates: await feeSnapshot(input.colleges, input.courses),
    });
  } catch (err) {
    // Two identical submissions at the same moment: the second gets the first's enquiry.
    if ((err as { code?: number }).code === 11000) {
      const first = await EnquiryModel.findOne({ student: me(req), idempotencyKey }).lean();
      if (first) return { enquiry: await toStudentEnquiry(first as Lean), duplicate: true };
    }
    throw err;
  }
  await addEvent(created._id, { type: 'created', visibility: 'student', actor: eventActor(req), toStatus: 'NEW', body: 'Enquiry received.' });
  await audit(actorFrom(req), 'enquiry.created', { type: 'enquiry', id: String(created._id) }, req, { reference: created.reference });
  // Optional (site setting): hand the enquiry to the least busy active counsellor. Never blocks the enquiry.
  await (await import('./counsellor.service.js')).autoAssign(created._id).catch(() => null);

  // Notifications (queued; a mail problem never fails the enquiry).
  const e = created.toObject() as Lean;
  const summary = await studentEnquirySummary(e);
  const course = summary.courses.map((c) => c.name).join(', ');
  const colleges = summary.colleges.map((c) => c.name).join(', ');
  const admins = new Set([...(await counsellors()).map((a) => a.email), ...env.ADMIN_NOTIFY_EMAILS]);
  for (const to of admins) {
    await safeEmail({ to, template: 'enquiry_received_admin', params: { reference: e.reference, name: user!.name, course, colleges, year: String(input.admissionYear), link: adminEnquiryLink(e._id) }, dedupeKey: `enq-new:${String(e._id)}:${to}`, related: { type: 'enquiry', id: String(e._id) } });
  }
  await safeEmail({ to: user!.email, template: 'enquiry_ack', params: { reference: e.reference, name: user!.name, course, link: studentEnquiryLink(e.reference) }, dedupeKey: `enq-ack:${String(e._id)}`, related: { type: 'enquiry', id: String(e._id) } });
  return { enquiry: await toStudentEnquiry(e), duplicate: false };
}

export async function listMyEnquiries(req: Request) {
  const items = (await EnquiryModel.find({ student: me(req) }).sort({ createdAt: -1 }).limit(100).lean()) as Lean[];
  return Promise.all(items.map(studentEnquirySummary));
}

export async function getMyEnquiry(req: Request, reference: string) {
  return toStudentEnquiry(await ownEnquiry(req, reference));
}

// A message from the student to their counsellor (visible to both).
export async function studentMessage(req: Request, reference: string, body: string) {
  const e = await ownEnquiry(req, reference);
  if (!isOpen(e.status)) throw new ApiError(409, 'ENQUIRY_FINISHED', 'This enquiry is finished. Start a new enquiry if you need more help.');
  const ev = await addEvent(e._id, { type: 'message', visibility: 'student', actor: eventActor(req), body });
  await EnquiryModel.updateOne({ _id: e._id }, { $set: { lastActivityAt: new Date() } });
  const counsellor = e.assignedTo ? await UserModel.findById(e.assignedTo).select('email').lean() : null;
  const recipients = counsellor ? [counsellor.email] : env.ADMIN_NOTIFY_EMAILS;
  for (const to of recipients) {
    await safeEmail({ to, template: 'enquiry_message', params: { reference: e.reference, from: e.studentSnapshot.name, body, link: adminEnquiryLink(e._id) }, dedupeKey: `enq-msg:${String(ev._id)}:${to}` });
  }
  return toStudentEnquiry({ ...e, lastActivityAt: new Date() });
}

const SLOT_LABELS: Record<string, string> = { any: 'any time', morning: 'morning (9am–12pm)', afternoon: 'afternoon (12pm–4pm)', evening: 'evening (4pm–7pm)' };

// The student asks for a phone call or a counselling session. The counsellor (or the team) is told, the request
// shows on the enquiry until someone acts on it, and the follow-up date moves to the requested day if sooner.
export async function requestCallback(req: Request, reference: string, input: { kind: 'callback' | 'counselling'; preferredDate: Date | null; slot: 'any' | 'morning' | 'afternoon' | 'evening'; mode: 'phone' | 'video' | 'office'; note: string }) {
  const e = await ownEnquiry(req, reference);
  if (!isOpen(e.status)) throw new ApiError(409, 'ENQUIRY_FINISHED', 'This enquiry is finished. Start a new enquiry if you need more help.');
  const now = new Date();
  const request = { ...input, requestedAt: now, handledAt: null };
  const due = input.preferredDate && input.preferredDate > now ? input.preferredDate : now;
  const followUpAt = e.followUpAt && e.followUpAt < due ? e.followUpAt : due;
  await EnquiryModel.updateOne({ _id: e._id }, { $set: { callbackRequest: request, followUpAt, lastActivityAt: now } });
  const when = [input.preferredDate ? input.preferredDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : 'as soon as possible', SLOT_LABELS[input.slot]].join(', ');
  const what = input.kind === 'callback' ? 'Phone call requested' : `Counselling session requested (${input.mode})`;
  const body = [`${what}: ${when}.`, input.note].filter(Boolean).join(' ');
  const ev = await addEvent(e._id, { type: 'callback_request', visibility: 'student', actor: eventActor(req), body, meta: { kind: input.kind, slot: input.slot, mode: input.mode, preferredDate: input.preferredDate } });
  const counsellor = e.assignedTo ? await UserModel.findById(e.assignedTo).select('email').lean() : null;
  const recipients = counsellor ? [counsellor.email] : [...new Set([...(await counsellors()).map((a) => a.email), ...env.ADMIN_NOTIFY_EMAILS])];
  for (const to of recipients) {
    await safeEmail({ to, template: 'enquiry_message', params: { reference: e.reference, from: e.studentSnapshot.name, body, link: adminEnquiryLink(e._id) }, dedupeKey: `enq-callback:${String(ev._id)}:${to}` });
  }
  await audit(actorFrom(req), 'enquiry.callback_requested', { type: 'enquiry', id: String(e._id) }, req, { kind: input.kind });
  return toStudentEnquiry({ ...e, callbackRequest: request, followUpAt, lastActivityAt: now });
}

// Students can withdraw their own open enquiry.
export async function withdrawEnquiry(req: Request, reference: string, reason: string) {
  const e = await ownEnquiry(req, reference);
  if (!isOpen(e.status)) throw new ApiError(409, 'ENQUIRY_FINISHED', 'This enquiry is already finished');
  const updated = await EnquiryModel.findOneAndUpdate({ _id: e._id, status: e.status }, { $set: { status: 'WITHDRAWN', studentMessage: 'You withdrew this enquiry.', lastActivityAt: new Date() } }, { new: true }).lean();
  if (!updated) throw new ApiError(409, 'STATUS_CHANGED', 'This enquiry was just updated. Reload and try again.');
  await addEvent(e._id, { type: 'status_change', visibility: 'student', actor: eventActor(req), fromStatus: e.status, toStatus: 'WITHDRAWN', reason, body: `Withdrawn by you: ${reason}` });
  await audit(actorFrom(req), 'enquiry.withdrawn', { type: 'enquiry', id: String(e._id) }, req);
  return toStudentEnquiry(updated as Lean);
}

// The student's notifications feed: student-visible events across their enquiries.
export async function myUpdates(req: Request, { page, limit }: { page: number; limit: number }) {
  const enquiries = await EnquiryModel.find({ student: me(req) }).select('reference').lean();
  const refs = new Map(enquiries.map((e) => [String(e._id), e.reference]));
  const filter = { enquiry: { $in: enquiries.map((e) => e._id) }, visibility: 'student' };
  const [items, total] = await Promise.all([EnquiryEventModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), EnquiryEventModel.countDocuments(filter)]);
  return { items: (items as Lean[]).map((ev) => ({ ...toStudentEvent(ev), reference: refs.get(String(ev.enquiry)) })), meta: pageMeta(page, limit, total) };
}

export async function myApplications(req: Request) {
  const apps = (await AdmissionApplicationModel.find({ student: me(req) }).sort({ createdAt: -1 }).lean()) as Lean[];
  const refs = new Map((await EnquiryModel.find({ _id: { $in: apps.map((a) => a.enquiry) } }).select('reference').lean()).map((e) => [String(e._id), e.reference]));
  return apps.map((a) => ({ ...toStudentApplication(a), enquiryReference: refs.get(String(a.enquiry)) ?? null }));
}
