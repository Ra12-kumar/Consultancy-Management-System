import mongoose from 'mongoose';
import { AdmissionApplicationModel } from '../models/Admission.js';
import { AppointmentModel } from '../models/Appointment.js';
import { CollegeModel } from '../models/College.js';
import { CourseModel } from '../models/Course.js';
import { EnquiryEventModel, type EnquiryStatus } from '../models/Enquiry.js';
import { LocationModel } from '../models/Location.js';
import { UserModel } from '../models/User.js';
import { allowedTransitions, STUDENT_LABELS } from './enquiryWorkflow.js';

// What students and admins see of enquiries. Student views are built from an explicit whitelist so internal
// notes, contact attempts, status-change reasons, outcome notes and evidence verifiers can never leak.

type Lean = Record<string, any> & { _id: mongoose.Types.ObjectId }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function names(model: mongoose.Model<any>, ids: unknown[], fields = 'name slug') { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!ids.length) return new Map<string, Lean>();
  const docs = (await model.find({ _id: { $in: ids } }).select(fields).lean()) as Lean[];
  return new Map(docs.map((d) => [String(d._id), d]));
}

async function preferenceNames(e: Lean) {
  const p = e.preferences;
  const [courses, colleges, locations] = await Promise.all([names(CourseModel, p.courses), names(CollegeModel, p.colleges), names(LocationModel, p.locations)]);
  const pick = (m: Map<string, Lean>, ids: unknown[]) => ids.map((id) => m.get(String(id))).filter(Boolean).map((d) => ({ id: String(d!._id), name: d!.name as string, slug: d!.slug as string }));
  return {
    courses: pick(courses, p.courses),
    colleges: pick(colleges, p.colleges),
    locations: pick(locations, p.locations),
    specialization: p.specialization,
    institutionTypes: p.institutionTypes,
    budgetMinor: p.budgetMinor ?? null,
    hostel: p.hostel,
    scholarship: p.scholarship,
    admissionYear: p.admissionYear,
    intake: p.intake,
    entranceExamNotes: p.entranceExamNotes,
    counsellingRequest: p.counsellingRequest,
  };
}

const feeEstimates = (e: Lean) =>
  (e.feeEstimates ?? []).map((f: Lean) => ({
    college: String(f.college),
    collegeName: f.collegeName,
    course: String(f.course),
    courseName: f.courseName,
    version: f.version,
    academicYear: f.academicYear,
    intake: f.intake,
    officialTotalMinor: f.officialTotalMinor,
    consultancyServiceChargeMinor: f.consultancyServiceChargeMinor,
    estimatedTotalMinor: f.estimatedTotalMinor,
    isSample: Boolean(f.isSample),
  }));

const documents = (e: Lean) =>
  (e.documents ?? []).map((d: Lean) => ({ id: String(d._id), name: d.name, status: d.status, note: d.note, requestedAt: d.requestedAt, receivedAt: d.receivedAt ?? null, files: (d.files ?? []).map((f: unknown) => ({ id: String(f), url: `/api/files/${String(f)}` })) }));

// ---- Student projections ----

export const toStudentEvent = (ev: Lean) => ({
  id: String(ev._id),
  type: ev.type as string,
  toStatus: (ev.toStatus as EnquiryStatus | null) ?? null,
  statusLabel: ev.toStatus ? STUDENT_LABELS[ev.toStatus as EnquiryStatus] : null,
  body: ev.body as string,
  by: ev.actor?.role === 'student' ? 'You' : (ev.actor?.name ?? 'Udaan team'),
  createdAt: ev.createdAt as Date,
  // Courses suggested by the counsellor, with the eligibility worked out when they were suggested.
  ...(ev.type === 'recommendation' && { recommendations: ((ev.meta as { items?: unknown[] } | null)?.items ?? []) as Array<Record<string, unknown>> }),
});

export const toStudentApplication = (a: Lean) => ({
  reference: a.reference,
  collegeName: a.collegeName,
  courseName: a.courseName,
  applicationNumber: a.applicationNumber,
  status: a.status,
  submittedAt: a.submittedAt ?? null,
  decisionAt: a.decisionAt ?? null,
  admissionConfirmed: a.status === 'admitted',
});

export const toStudentAppointment = (a: Lean, counsellorName: string, reference?: string) => ({
  id: String(a._id),
  enquiryReference: reference ?? null,
  startsAt: a.startsAt,
  durationMinutes: a.durationMinutes,
  mode: a.mode,
  meetingDetails: a.meetingDetails,
  agenda: a.agenda,
  status: a.status,
  studentNote: a.studentNote,
  counsellor: counsellorName,
});

const callbackRequestView = (e: Lean) => {
  const r = e.callbackRequest;
  return r?.requestedAt ? { kind: r.kind, preferredDate: r.preferredDate ?? null, slot: r.slot, mode: r.mode, note: r.note, requestedAt: r.requestedAt, handledAt: r.handledAt ?? null } : null;
};

export async function studentEnquirySummary(e: Lean) {
  const prefs = await preferenceNames(e);
  return { reference: e.reference, status: e.status, statusLabel: STUDENT_LABELS[e.status as EnquiryStatus], courses: prefs.courses, colleges: prefs.colleges, createdAt: e.createdAt, lastActivityAt: e.lastActivityAt };
}

export async function toStudentEnquiry(e: Lean) {
  const [prefs, events, applications, appointments, counsellor] = await Promise.all([
    preferenceNames(e),
    EnquiryEventModel.find({ enquiry: e._id, visibility: 'student' }).sort({ createdAt: 1 }).lean(),
    AdmissionApplicationModel.find({ enquiry: e._id }).sort({ createdAt: 1 }).lean(),
    AppointmentModel.find({ enquiry: e._id }).sort({ startsAt: -1 }).lean(),
    e.assignedTo ? UserModel.findById(e.assignedTo).select('name').lean() : null,
  ]);
  const people = await names(UserModel, appointments.map((a) => a.counsellor), 'name');
  return {
    reference: e.reference,
    status: e.status,
    statusLabel: STUDENT_LABELS[e.status as EnquiryStatus],
    studentMessage: e.studentMessage,
    counsellor: counsellor ? counsellor.name : null,
    callbackTime: e.callbackTime ?? 'any',
    callbackRequest: callbackRequestView(e),
    createdAt: e.createdAt,
    lastActivityAt: e.lastActivityAt,
    preferences: prefs,
    feeEstimates: feeEstimates(e),
    documents: documents(e),
    timeline: (events as Lean[]).map(toStudentEvent),
    applications: (applications as Lean[]).map(toStudentApplication),
    appointments: (appointments as Lean[]).map((a) => toStudentAppointment(a, (people.get(String(a.counsellor))?.name as string) ?? 'Counsellor', e.reference)),
  };
}

// ---- Admin projections ----

export const toAdminApplication = (a: Lean) => ({
  id: String(a._id),
  reference: a.reference,
  enquiry: String(a.enquiry),
  college: String(a.college),
  course: String(a.course),
  collegeName: a.collegeName,
  courseName: a.courseName,
  applicationNumber: a.applicationNumber,
  status: a.status,
  submittedAt: a.submittedAt ?? null,
  decisionAt: a.decisionAt ?? null,
  evidence: a.evidence?.type ? { type: a.evidence.type, reference: a.evidence.reference, verifiedBy: a.evidence.verifiedBy ? String(a.evidence.verifiedBy) : null, verifiedAt: a.evidence.verifiedAt ?? null } : null,
  internalNote: a.internalNote,
  updatedAt: a.updatedAt,
});

export const toAdminAppointment = (a: Lean, people: Map<string, Lean>, reference?: string) => ({
  ...toStudentAppointment(a, (people.get(String(a.counsellor))?.name as string) ?? 'Counsellor', reference),
  enquiry: String(a.enquiry),
  counsellorId: String(a.counsellor),
  outcomeNote: a.outcomeNote,
  reminderSentAt: a.reminderSentAt ?? null,
});

export async function toAdminEnquiry(e: Lean) {
  const [prefs, events, applications, appointments] = await Promise.all([
    preferenceNames(e),
    EnquiryEventModel.find({ enquiry: e._id }).sort({ createdAt: 1 }).lean(),
    AdmissionApplicationModel.find({ enquiry: e._id }).sort({ createdAt: 1 }).lean(),
    AppointmentModel.find({ enquiry: e._id }).sort({ startsAt: -1 }).lean(),
  ]);
  const people = await names(UserModel, [e.assignedTo, ...appointments.map((a) => a.counsellor)].filter(Boolean), 'name email');
  const assigned = e.assignedTo ? people.get(String(e.assignedTo)) : null;
  return {
    id: String(e._id),
    reference: e.reference,
    status: e.status,
    statusLabel: STUDENT_LABELS[e.status as EnquiryStatus],
    allowedTransitions: allowedTransitions(e.status),
    student: { id: String(e.student), ...e.studentSnapshot },
    preferences: prefs,
    feeEstimates: feeEstimates(e),
    documents: documents(e),
    assignedTo: assigned ? { id: String(assigned._id), name: assigned.name, email: assigned.email } : null,
    followUpAt: e.followUpAt ?? null,
    studentMessage: e.studentMessage,
    source: e.source ?? 'direct',
    campaign: e.campaign ?? '',
    callbackTime: e.callbackTime ?? 'any',
    callbackRequest: callbackRequestView(e),
    lastContactAt: e.lastContactAt ?? null,
    createdAt: e.createdAt,
    lastActivityAt: e.lastActivityAt,
    timeline: (events as Lean[]).map((ev) => ({
      id: String(ev._id),
      type: ev.type,
      visibility: ev.visibility,
      actor: ev.actor?.name ?? 'System',
      actorRole: ev.actor?.role ?? 'system',
      fromStatus: ev.fromStatus ?? null,
      toStatus: ev.toStatus ?? null,
      reason: ev.reason,
      body: ev.body,
      meta: ev.meta ?? null,
      createdAt: ev.createdAt,
    })),
    applications: (applications as Lean[]).map(toAdminApplication),
    appointments: (appointments as Lean[]).map((a) => toAdminAppointment(a, people, e.reference)),
  };
}
