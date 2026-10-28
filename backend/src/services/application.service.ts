import type { Request } from 'express';
import { AdmissionApplicationModel } from '../models/Admission.js';
import { CollegeModel } from '../models/College.js';
import { CourseModel } from '../models/Course.js';
import { EnquiryModel } from '../models/Enquiry.js';
import { ApiError } from '../utils/ApiError.js';
import { actorFrom, audit } from './audit.service.js';
import { pageMeta } from './catalog.service.js';
import { enquiryDetail, enquiryOr404 } from './enquiryAdmin.service.js';
import { addEvent, eventActor, nextReference, safeEmail, statusLabel, studentEnquiryLink } from './enquiryShared.js';
import { toAdminApplication } from './enquiryViews.js';
import { isOpen } from './enquiryWorkflow.js';

type Lean = Record<string, any> & { _id: import('mongoose').Types.ObjectId }; // eslint-disable-line @typescript-eslint/no-explicit-any
const LABELS: Record<string, string> = { planned: 'planned', submitted: 'submitted', offer_received: 'offer received', admitted: 'admission confirmed', rejected: 'not successful', withdrawn: 'withdrawn' };

async function applicationOr404(id: string) {
  const a = await AdmissionApplicationModel.findById(id).lean();
  if (!a) throw ApiError.notFound('Application not found');
  return a as Lean;
}

export async function createApplication(enquiryId: string, input: { college: string; course: string; applicationNumber: string; status: 'planned' | 'submitted'; internalNote: string }, req: Request) {
  const e = await enquiryOr404(enquiryId);
  const [college, course] = await Promise.all([CollegeModel.findById(input.college).select('name').lean(), CourseModel.findById(input.course).select('name').lean()]);
  if (!college) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a college', [{ field: 'college', message: 'Choose a college' }]);
  if (!course) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a course', [{ field: 'course', message: 'Choose a course' }]);
  const a = await AdmissionApplicationModel.create({
    ...input,
    reference: await nextReference('APP'),
    enquiry: e._id,
    student: e.student,
    collegeName: college.name,
    courseName: course.name,
    submittedAt: input.status === 'submitted' ? new Date() : null,
  });
  await addEvent(e._id, { type: 'application', visibility: 'student', actor: eventActor(req), body: `Application ${a.reference} to ${college.name} for ${course.name}: ${LABELS[input.status]}.` });
  await EnquiryModel.updateOne({ _id: e._id }, { $set: { lastActivityAt: new Date() } });
  await audit(actorFrom(req), 'application.created', { type: 'application', id: String(a._id) }, req, { enquiry: enquiryId });
  return enquiryDetail(enquiryId);
}

// Any change except admission, which needs confirmAdmission. Confirmed admissions are locked.
export async function updateApplication(id: string, patch: { applicationNumber?: string; status?: string; internalNote?: string }, req: Request) {
  const a = await applicationOr404(id);
  if (a.status === 'admitted') throw new ApiError(409, 'APPLICATION_LOCKED', 'A confirmed admission cannot be changed');
  const set: Record<string, unknown> = { ...patch };
  if (patch.status === 'submitted' && !a.submittedAt) set.submittedAt = new Date();
  if (patch.status && ['offer_received', 'rejected', 'withdrawn'].includes(patch.status)) set.decisionAt = new Date();
  await AdmissionApplicationModel.updateOne({ _id: id }, { $set: set });
  if (patch.status && patch.status !== a.status) {
    await addEvent(a.enquiry, { type: 'application', visibility: 'student', actor: eventActor(req), body: `Application ${a.reference} (${a.collegeName}): ${LABELS[patch.status]}.` });
  }
  await EnquiryModel.updateOne({ _id: a.enquiry }, { $set: { lastActivityAt: new Date() } });
  await audit(actorFrom(req), 'application.updated', { type: 'application', id }, req, { fields: Object.keys(patch), status: patch.status ?? null });
  return enquiryDetail(String(a.enquiry));
}

// The only way to a confirmed admission: an offer on record, evidence, and an admin with admissions.confirm.
// The application becomes `admitted` and the enquiry `ADMITTED`.
export async function confirmAdmission(id: string, input: { evidenceType: string; evidenceReference: string; studentMessage: string }, req: Request) {
  const a = await applicationOr404(id);
  if (a.status !== 'offer_received') throw new ApiError(422, 'NEEDS_OFFER', 'Record the college’s offer on this application before confirming admission', [{ field: 'status', message: 'Record the offer first' }]);
  const e = await enquiryOr404(String(a.enquiry));
  if (!isOpen(e.status)) throw new ApiError(409, 'ENQUIRY_FINISHED', 'Reopen the enquiry before confirming an admission');
  const now = new Date();
  const confirmed = await AdmissionApplicationModel.findOneAndUpdate(
    { _id: id, status: 'offer_received' },
    { $set: { status: 'admitted', decisionAt: now, evidence: { type: input.evidenceType, reference: input.evidenceReference, verifiedBy: req.user!.id, verifiedAt: now } } },
    { new: true },
  ).lean();
  if (!confirmed) throw new ApiError(409, 'APPLICATION_CHANGED', 'This application was just changed. Reload and try again.');
  const message = input.studentMessage || `Your admission to ${a.collegeName} for ${a.courseName} is confirmed.`;
  const updated = await EnquiryModel.findOneAndUpdate({ _id: e._id, status: e.status }, { $set: { status: 'ADMITTED', studentMessage: message, lastActivityAt: now } }, { new: true }).lean();
  if (updated) {
    await addEvent(e._id, { type: 'status_change', visibility: 'student', actor: eventActor(req), fromStatus: e.status, toStatus: 'ADMITTED', reason: `Evidence: ${input.evidenceType} ${input.evidenceReference}`, body: message, meta: { application: a.reference } });
    await safeEmail({ to: e.studentSnapshot.email, template: 'enquiry_status', params: { reference: e.reference, name: e.studentSnapshot.name, status: statusLabel('ADMITTED'), message, link: studentEnquiryLink(e.reference) }, dedupeKey: `enq-admitted:${String(e._id)}:${id}` });
  }
  await audit(actorFrom(req), 'application.admission_confirmed', { type: 'application', id }, req, { enquiry: String(e._id), evidenceType: input.evidenceType });
  return enquiryDetail(String(e._id));
}

export async function listApplications({ status, page, limit }: { status?: string; page: number; limit: number }) {
  const filter = status ? { status } : {};
  const [items, total] = await Promise.all([AdmissionApplicationModel.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), AdmissionApplicationModel.countDocuments(filter)]);
  const refs = new Map((await EnquiryModel.find({ _id: { $in: items.map((a) => a.enquiry) } }).select('reference studentSnapshot.name').lean()).map((e) => [String(e._id), e]));
  return {
    items: (items as Lean[]).map((a) => ({ ...toAdminApplication(a), enquiryReference: refs.get(String(a.enquiry))?.reference ?? null, studentName: refs.get(String(a.enquiry))?.studentSnapshot?.name ?? null })),
    meta: pageMeta(page, limit, total),
  };
}
