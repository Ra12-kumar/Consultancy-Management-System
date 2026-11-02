import type { Request } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { AdmissionApplicationModel } from '../models/Admission.js';
import { AppointmentModel } from '../models/Appointment.js';
import { AuthTokenModel } from '../models/AuthToken.js';
import { EmailDeliveryModel } from '../models/EmailDelivery.js';
import { EnquiryModel } from '../models/Enquiry.js';
import { ScholarshipApplicationModel } from '../models/Scholarship.js';
import { SessionModel } from '../models/Session.js';
import { SavedComparisonModel, ShortlistModel } from '../models/Shortlist.js';
import { StudentProfileModel } from '../models/StudentProfile.js';
import { DataRequestModel, FeedbackModel } from '../models/Support.js';
import { UserModel, toPublicUser } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { actorFrom, audit } from './audit.service.js';
import { pageMeta } from './catalog.service.js';
import { addEvent, eventActor, frontendLink, nextReference, oid, safeEmail } from './enquiryShared.js';
import { DOCUMENT_TYPES, PHOTO_TYPES, deleteStoredFiles, saveUpload } from './files.service.js';

type Lean = Record<string, any> & { _id: mongoose.Types.ObjectId }; // eslint-disable-line @typescript-eslint/no-explicit-any
const me = (req: Request) => oid(req.user!.id);

// ---- Profile photo ----

export async function setMyPhoto(req: Request) {
  const file = await saveUpload(req.file, { owner: req.user!.id, uploadedBy: req.user!.id, kind: 'photo', allowed: PHOTO_TYPES });
  const before = await UserModel.findByIdAndUpdate(req.user!.id, { $set: { photoFile: file._id } }).lean();
  if (before?.photoFile) await deleteStoredFiles({ _id: before.photoFile, owner: me(req) });
  return toPublicUser((await UserModel.findById(req.user!.id).lean())!);
}

export async function removeMyPhoto(req: Request) {
  const before = await UserModel.findByIdAndUpdate(req.user!.id, { $set: { photoFile: null } }).lean();
  if (before?.photoFile) await deleteStoredFiles({ _id: before.photoFile, owner: me(req) });
  return toPublicUser((await UserModel.findById(req.user!.id).lean())!);
}

// ---- Requested documents ----

// A student uploads a file for a document their counsellor requested (their own enquiry only).
export async function uploadEnquiryDocument(req: Request, reference: string, docId: string) {
  const e = (await EnquiryModel.findOne({ reference, student: me(req) }).lean()) as Lean | null;
  if (!e) throw ApiError.notFound('Enquiry not found');
  const doc = (e.documents ?? []).find((d: Lean) => String(d._id) === docId);
  if (!doc) throw ApiError.notFound('Document not found');
  if (doc.status !== 'requested') throw new ApiError(409, 'DOCUMENT_CLOSED', 'This document is no longer needed');
  if ((doc.files?.length ?? 0) >= 5) throw new ApiError(409, 'TOO_MANY_FILES', 'You can upload up to 5 files for one document');
  const file = await saveUpload(req.file, { owner: req.user!.id, uploadedBy: req.user!.id, kind: 'document', allowed: DOCUMENT_TYPES, enquiry: e._id, documentId: doc._id });
  const r = await EnquiryModel.updateOne({ _id: e._id, 'documents._id': oid(docId) }, { $push: { 'documents.$.files': file._id }, $set: { lastActivityAt: new Date() } });
  if (!r.modifiedCount) {
    await deleteStoredFiles({ _id: file._id });
    throw new ApiError(409, 'DOCUMENT_CLOSED', 'This document is no longer needed');
  }
  const ev = await addEvent(e._id, { type: 'document', visibility: 'student', actor: eventActor(req), body: `Uploaded ${file.originalName} for ${doc.name}.` });
  if (e.assignedTo) {
    const counsellor = await UserModel.findById(e.assignedTo).select('email').lean();
    if (counsellor) await safeEmail({ to: counsellor.email, template: 'enquiry_message', params: { reference: e.reference, from: e.studentSnapshot.name, body: `Uploaded a file for “${doc.name}”. Check it and mark the document as received.`, link: frontendLink(`/admin/enquiries/${String(e._id)}`) }, dedupeKey: `doc-upload:${String(ev._id)}` });
  }
  return { id: String(file._id), url: `/api/files/${String(file._id)}`, name: file.originalName };
}

// ---- Feedback ----

const toFeedback = (f: Lean, admin = false) => ({
  id: String(f._id),
  rating: f.rating,
  category: f.category,
  message: f.message,
  status: f.status,
  enquiry: f.enquiry ? String(f.enquiry) : null,
  thread: (f.thread ?? []).map((t: Lean) => ({ role: t.role, name: t.role === 'student' && !admin ? 'You' : t.name, body: t.body, at: t.at })),
  publishConsent: f.publishConsent,
  testimonial: { status: f.testimonial?.status ?? 'none', displayName: f.testimonial?.displayName ?? '' },
  createdAt: f.createdAt,
  updatedAt: f.updatedAt,
  ...(admin && { student: f.studentInfo ?? null }),
});

export async function submitFeedback(req: Request, input: { rating: number; category: string; message: string; enquiry?: string | null; publishConsent: boolean }) {
  if (input.enquiry && !(await EnquiryModel.exists({ _id: input.enquiry, student: me(req) }))) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose one of your enquiries', [{ field: 'enquiry', message: 'Choose one of your enquiries' }]);
  // At most 10 feedback messages a day per student.
  if ((await FeedbackModel.countDocuments({ student: me(req), createdAt: { $gte: new Date(Date.now() - 86_400_000) } })) >= 10) throw new ApiError(429, 'RATE_LIMITED', 'You have sent a lot of feedback today. Please try again tomorrow.');
  const f = await FeedbackModel.create({ ...input, student: me(req) });
  await safeEmail({ to: req.user!.email, template: 'feedback_ack', params: { name: req.user!.name, link: frontendLink('/student/feedback') }, dedupeKey: `fb-ack:${String(f._id)}` });
  const admins = await UserModel.find({ role: 'admin', status: 'active', permissions: 'feedback.manage' }).select('email').lean();
  for (const to of new Set([...admins.map((a) => a.email), ...env.ADMIN_NOTIFY_EMAILS])) {
    await safeEmail({ to, template: 'feedback_admin', params: { name: req.user!.name, rating: String(input.rating), link: frontendLink('/admin/feedback') }, dedupeKey: `fb-new:${String(f._id)}:${to}` });
  }
  return toFeedback(f.toObject() as Lean);
}

export async function myFeedback(req: Request) {
  return ((await FeedbackModel.find({ student: me(req) }).sort({ createdAt: -1 }).limit(100).lean()) as Lean[]).map((f) => toFeedback(f));
}

async function ownFeedback(req: Request, id: string) {
  const f = (await FeedbackModel.findOne({ _id: id, student: me(req) }).lean()) as Lean | null;
  if (!f) throw ApiError.notFound('Feedback not found');
  return f;
}

export async function studentFollowUp(req: Request, id: string, body: string) {
  const f = await ownFeedback(req, id);
  if (f.status === 'resolved') throw new ApiError(409, 'FEEDBACK_RESOLVED', 'This conversation is closed. Send new feedback instead.');
  if ((f.thread?.length ?? 0) >= 30) throw new ApiError(409, 'THREAD_FULL', 'This conversation is full. Send new feedback instead.');
  const updated = await FeedbackModel.findByIdAndUpdate(id, { $push: { thread: { by: me(req), role: 'student', name: req.user!.name, body } }, $set: { status: 'open' } }, { new: true }).lean();
  return toFeedback(updated as Lean);
}

// Students can withdraw publishing consent at any time; an approved testimonial then disappears.
export async function setConsent(req: Request, id: string, publishConsent: boolean) {
  await ownFeedback(req, id);
  const updated = await FeedbackModel.findByIdAndUpdate(id, { $set: { publishConsent, ...(!publishConsent && { 'testimonial.status': 'none' }) } }, { new: true }).lean();
  return toFeedback(updated as Lean);
}

export async function adminFeedback(q: { status?: string; category?: string; rating?: number; testimonial?: 'candidates'; page: number; limit: number }) {
  const filter: Record<string, unknown> = {};
  if (q.status) filter.status = q.status;
  if (q.category) filter.category = q.category;
  if (q.rating) filter.rating = q.rating;
  if (q.testimonial === 'candidates') Object.assign(filter, { publishConsent: true, 'testimonial.status': 'none' });
  const [items, total] = await Promise.all([FeedbackModel.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), FeedbackModel.countDocuments(filter)]);
  const students = new Map((await UserModel.find({ _id: { $in: items.map((f) => f.student) } }).select('name email').lean()).map((u) => [String(u._id), { id: String(u._id), name: u.name, email: u.email }]));
  return { items: (items as Lean[]).map((f) => toFeedback({ ...f, studentInfo: students.get(String(f.student)) ?? null }, true)), meta: pageMeta(q.page, q.limit, total) };
}

export async function respondToFeedback(id: string, input: { body: string; resolve: boolean }, req: Request) {
  const f = (await FeedbackModel.findById(id).lean()) as Lean | null;
  if (!f) throw ApiError.notFound('Feedback not found');
  if ((f.thread?.length ?? 0) >= 30) throw new ApiError(409, 'THREAD_FULL', 'This conversation is full');
  const updated = (await FeedbackModel.findByIdAndUpdate(id, { $push: { thread: { by: me(req), role: 'admin', name: req.user!.name, body: input.body } }, $set: { status: input.resolve ? 'resolved' : 'responded' } }, { new: true }).lean()) as Lean;
  await audit(actorFrom(req), 'feedback.responded', { type: 'feedback', id }, req, { resolved: input.resolve });
  const student = await UserModel.findById(f.student).select('name email anonymisedAt').lean();
  if (student && !student.anonymisedAt) await safeEmail({ to: student.email, template: 'feedback_response', params: { name: student.name, body: input.body, link: frontendLink('/student/feedback') }, dedupeKey: `fb-reply:${id}:${updated.thread.length}` });
  return toFeedback(updated, true);
}

export async function resolveFeedback(id: string, req: Request) {
  const updated = await FeedbackModel.findByIdAndUpdate(id, { $set: { status: 'resolved' } }, { new: true }).lean();
  if (!updated) throw ApiError.notFound('Feedback not found');
  await audit(actorFrom(req), 'feedback.resolved', { type: 'feedback', id }, req);
  return toFeedback(updated as Lean, true);
}

// Only feedback the student agreed to publish can become a testimonial, and only by an admin's decision.
export async function reviewTestimonial(id: string, decision: 'approved' | 'rejected', req: Request) {
  const f = (await FeedbackModel.findById(id).lean()) as Lean | null;
  if (!f) throw ApiError.notFound('Feedback not found');
  if (decision === 'approved' && !f.publishConsent) throw new ApiError(409, 'NO_CONSENT', 'The student has not agreed to publish this feedback');
  let displayName = '';
  if (decision === 'approved') {
    const [student, profile] = await Promise.all([UserModel.findById(f.student).select('name').lean(), StudentProfileModel.findOne({ user: f.student }).select('personal.city').lean()]);
    displayName = [student?.name.split(/\s+/)[0], profile?.personal?.city].filter(Boolean).join(', ');
  }
  const updated = await FeedbackModel.findByIdAndUpdate(id, { $set: { testimonial: { status: decision, displayName, reviewedBy: me(req), reviewedAt: new Date() } } }, { new: true }).lean();
  await audit(actorFrom(req), `feedback.testimonial_${decision}`, { type: 'feedback', id }, req);
  return toFeedback(updated as Lean, true);
}

// Public: approved, consented testimonials only, as first name and city.
export async function publicTestimonials() {
  const items = await FeedbackModel.find({ publishConsent: true, 'testimonial.status': 'approved' }).sort({ 'testimonial.reviewedAt': -1 }).limit(6).lean();
  return items.map((f) => ({ id: String(f._id), rating: f.rating, quote: f.message.length > 300 ? `${f.message.slice(0, 297)}…` : f.message, name: f.testimonial?.displayName || 'An Udaan student' }));
}

// ---- Personal data requests ----

const toRequest = (r: Lean) => ({ reference: r.reference, id: String(r._id), type: r.type, details: r.details, status: r.status, resolutionNote: r.resolutionNote, handledAt: r.handledAt ?? null, createdAt: r.createdAt });

export async function createDataRequest(req: Request, input: { type: 'correction' | 'deletion'; details: string }) {
  if (input.type === 'correction' && input.details.length < 5) throw new ApiError(422, 'VALIDATION_ERROR', 'Tell us what should be corrected', [{ field: 'details', message: 'Tell us what should be corrected' }]);
  try {
    const r = await DataRequestModel.create({ ...input, reference: await nextReference('DRQ'), student: me(req) });
    await audit(actorFrom(req), 'privacy.request_created', { type: 'data_request', id: String(r._id) }, req, { type: input.type });
    const admins = await UserModel.find({ role: 'admin', status: 'active', permissions: 'privacy.manage' }).select('email').lean();
    for (const to of new Set([...admins.map((a) => a.email), ...env.ADMIN_NOTIFY_EMAILS])) {
      await safeEmail({ to, template: 'data_request_admin', params: { reference: r.reference, type: input.type, link: frontendLink('/admin/data-requests') }, dedupeKey: `drq-new:${String(r._id)}:${to}` });
    }
    return toRequest(r.toObject() as Lean);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new ApiError(409, 'REQUEST_PENDING', `You already have a pending ${input.type} request`);
    throw err;
  }
}

export async function myDataRequests(req: Request) {
  return ((await DataRequestModel.find({ student: me(req) }).sort({ createdAt: -1 }).lean()) as Lean[]).map(toRequest);
}

export async function cancelDataRequest(req: Request, reference: string) {
  const r = await DataRequestModel.findOneAndUpdate({ reference, student: me(req), status: 'pending' }, { $set: { status: 'cancelled', handledAt: new Date() } }, { new: true }).lean();
  if (!r) throw ApiError.notFound('Pending request not found');
  return toRequest(r as Lean);
}

export async function adminDataRequests(q: { status?: string; page: number; limit: number }) {
  const filter = q.status ? { status: q.status } : {};
  const [items, total] = await Promise.all([DataRequestModel.find(filter).sort({ status: 1, createdAt: 1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), DataRequestModel.countDocuments(filter)]);
  const users = new Map((await UserModel.find({ _id: { $in: items.map((r) => r.student) } }).select('name email anonymisedAt').lean()).map((u) => [String(u._id), u]));
  return {
    items: (items as Lean[]).map((r) => ({ ...toRequest(r), student: (({ _id, name, email, anonymisedAt }) => ({ id: String(_id), name, email, anonymised: Boolean(anonymisedAt) }))(users.get(String(r.student)) ?? { _id: r.student, name: '—', email: '—', anonymisedAt: null }) })),
    meta: pageMeta(q.page, q.limit, total),
  };
}

const REMOVED = '[removed at the student’s request]';

// Anonymises a student: the account can no longer sign in, personal details are removed everywhere, uploaded
// files are deleted, and enquiry/application records are kept without identifying details (for statistics and
// accounting). Audit records are kept as the legal record of the request.
export async function anonymiseStudent(studentId: mongoose.Types.ObjectId) {
  const placeholderEmail = `deleted-${String(studentId)}@deleted.invalid`;
  const user = await UserModel.findById(studentId).lean();
  if (!user || user.role !== 'student') throw ApiError.notFound('Student not found');
  const enquiryIds = await EnquiryModel.distinct('_id', { student: studentId });
  const counts = {
    files: await deleteStoredFiles({ owner: studentId }),
    sessions: (await SessionModel.deleteMany({ user: studentId })).deletedCount,
    tokens: (await AuthTokenModel.deleteMany({ user: studentId })).deletedCount,
    profile: (await StudentProfileModel.deleteMany({ user: studentId })).deletedCount,
    shortlist: (await ShortlistModel.deleteMany({ student: studentId })).deletedCount,
    comparisons: (await SavedComparisonModel.deleteMany({ student: studentId })).deletedCount,
  };
  await EnquiryModel.updateMany(
    { student: studentId },
    { $set: { 'studentSnapshot.name': 'Deleted student', 'studentSnapshot.email': placeholderEmail, 'studentSnapshot.mobile': null, 'studentSnapshot.city': '', 'studentSnapshot.entranceExams': [], 'preferences.counsellingRequest': '', 'preferences.entranceExamNotes': '', 'documents.$[].files': [] } },
  );
  // History is append-only for the application; a privacy redaction is the one documented exception, done with the
  // raw driver: the student's own words are removed, the status history stays.
  await mongoose.connection.db!.collection('enquiryEvents').updateMany({ enquiry: { $in: enquiryIds }, 'actor.user': studentId }, { $set: { body: REMOVED, reason: '', 'actor.name': 'Deleted student' } });
  await AppointmentModel.updateMany({ student: studentId }, { $set: { studentNote: '' } });
  await AdmissionApplicationModel.updateMany({ student: studentId }, { $set: { applicationNumber: '' } });
  await ScholarshipApplicationModel.updateMany({ student: studentId }, { $set: { 'studentSnapshot.name': 'Deleted student', 'studentSnapshot.email': placeholderEmail, declared: { familyIncomeMinor: null, category: null, gender: null, course: null }, statement: '' } });
  await FeedbackModel.updateMany({ student: studentId }, { $set: { message: REMOVED, thread: [], publishConsent: false, 'testimonial.status': 'none', 'testimonial.displayName': '' } });
  await EmailDeliveryModel.updateMany({ to: user.email }, { $set: { to: placeholderEmail, params: {} } });
  await UserModel.updateOne(
    { _id: studentId },
    { $set: { name: 'Deleted student', email: placeholderEmail, mobile: null, passwordHash: null, status: 'disabled', emailVerifiedAt: null, photoFile: null, anonymisedAt: new Date() } },
  );
  return counts;
}

export async function resolveDataRequest(id: string, input: { action: 'complete' | 'reject'; note: string }, req: Request) {
  const r = (await DataRequestModel.findById(id).lean()) as Lean | null;
  if (!r) throw ApiError.notFound('Request not found');
  if (r.status !== 'pending') throw new ApiError(409, 'REQUEST_CLOSED', 'This request is already closed');
  const student = await UserModel.findById(r.student).select('name email').lean();
  const status = input.action === 'complete' ? 'completed' : 'rejected';
  // Tell the student first: after anonymisation their address is gone.
  if (student) {
    await safeEmail({ to: student.email, template: 'data_request_update', params: { name: student.name, reference: r.reference, type: r.type, status, note: input.note }, dedupeKey: `drq-done:${id}` });
  }
  let counts: Record<string, number> | null = null;
  if (input.action === 'complete' && r.type === 'deletion') counts = await anonymiseStudent(r.student);
  const updated = await DataRequestModel.findOneAndUpdate({ _id: id, status: 'pending' }, { $set: { status, resolutionNote: input.note, handledBy: me(req), handledAt: new Date() } }, { new: true }).lean();
  await audit(actorFrom(req), `privacy.request_${status}`, { type: 'data_request', id }, req, { type: r.type, ...(counts && { removed: counts }) });
  return toRequest(updated as Lean);
}

// Admin correction of a student's contact details (students.write), used to complete correction requests.
export async function adminCorrectStudent(id: string, patch: { name?: string; mobile?: string }, req: Request) {
  const u = await UserModel.findOneAndUpdate({ _id: id, role: 'student', anonymisedAt: null }, { $set: patch }, { new: true }).lean();
  if (!u) throw ApiError.notFound('Student not found');
  await audit(actorFrom(req), 'student.corrected', { type: 'user', id }, req, { fields: Object.keys(patch) });
  return toPublicUser(u);
}

