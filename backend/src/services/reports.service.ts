import type { Request } from 'express';
import { AdmissionApplicationModel } from '../models/Admission.js';
import { CollegeModel } from '../models/College.js';
import { CollegeFeeModel } from '../models/CollegeFee.js';
import { CourseModel } from '../models/Course.js';
import { EmailDeliveryModel } from '../models/EmailDelivery.js';
import { EnquiryModel, FINISHED_STATUSES } from '../models/Enquiry.js';
import { ScholarshipApplicationModel } from '../models/Scholarship.js';
import { StudentProfileModel } from '../models/StudentProfile.js';
import { UserModel } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { actorFrom, audit } from './audit.service.js';

// Operational reports. Every metric states what it counts; enquiries are never counted as admissions.

type Range = { from: Date; to: Date };
const named = async (model: typeof CourseModel | typeof CollegeModel, rows: Array<{ _id: unknown; n: number }>) => {
  const names = new Map((await (model as typeof CourseModel).find({ _id: { $in: rows.map((r) => r._id) } }).select('name').lean()).map((d) => [String(d._id), d.name]));
  return rows.map((r) => ({ label: names.get(String(r._id)) ?? 'Unknown', count: r.n }));
};

export function defaultRange(q: { from?: Date; to?: Date }): Range {
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - 90 * 86_400_000);
  if (from > to) throw new ApiError(422, 'VALIDATION_ERROR', '"from" must be before "to"', [{ field: 'from', message: 'Must be before "to"' }]);
  return { from, to };
}

export async function reportSummary(q: { from?: Date; to?: Date }) {
  const { from, to } = defaultRange(q);
  const created = { createdAt: { $gte: from, $lte: to } };
  const [registrations, byCourse, byState, byCollege, enquiryStatuses, appStatuses, confirmed, followUps, schStatuses, awards, emailFailures, fees] = await Promise.all([
    UserModel.aggregate<{ _id: string; n: number }>([
      { $match: { role: 'student', ...created } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } }, n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    EnquiryModel.aggregate<{ _id: unknown; n: number }>([{ $match: created }, { $group: { _id: { $arrayElemAt: ['$preferences.courses', 0] }, n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 20 }]),
    EnquiryModel.aggregate<{ _id: string; n: number }>([{ $match: created }, { $group: { _id: '$studentSnapshot.state', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 20 }]),
    EnquiryModel.aggregate<{ _id: unknown; n: number }>([{ $match: created }, { $unwind: '$preferences.colleges' }, { $group: { _id: '$preferences.colleges', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 20 }]),
    EnquiryModel.aggregate<{ _id: string; n: number }>([{ $match: created }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    AdmissionApplicationModel.aggregate<{ _id: string; n: number }>([{ $match: created }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    // Enquiries made in the period that led to an admission confirmed with evidence.
    AdmissionApplicationModel.distinct('enquiry', { status: 'admitted', 'evidence.verifiedAt': { $ne: null }, enquiry: { $in: await EnquiryModel.distinct('_id', created) } }),
    EnquiryModel.countDocuments({ status: { $nin: FINISHED_STATUSES }, followUpAt: { $lte: new Date() } }),
    ScholarshipApplicationModel.aggregate<{ _id: string; n: number }>([{ $match: created }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    ScholarshipApplicationModel.aggregate<{ _id: null; total: number }>([{ $match: { ...created, status: 'approved' } }, { $group: { _id: null, total: { $sum: { $ifNull: ['$decision.awardMinor', 0] } } } }]),
    EmailDeliveryModel.aggregate<{ _id: string; n: number }>([{ $match: { ...created, status: 'failed' } }, { $group: { _id: '$template', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
    CollegeFeeModel.aggregate<{ _id: unknown; n: number; min: number; avg: number; max: number }>([
      { $match: { status: 'published' } },
      { $group: { _id: '$course', n: { $sum: 1 }, min: { $min: '$officialTotalMinor' }, avg: { $avg: '$officialTotalMinor' }, max: { $max: '$officialTotalMinor' } } },
      { $sort: { n: -1 } },
    ]),
  ]);
  const totalEnquiries = enquiryStatuses.reduce((t, s) => t + s.n, 0);
  const courseNames = new Map((await CourseModel.find({ _id: { $in: fees.map((f) => f._id) } }).select('name').lean()).map((c) => [String(c._id), c.name]));
  return {
    range: { from, to },
    definitions: {
      conversion: 'Enquiries created in the period that have at least one college application confirmed as admitted with verified evidence, divided by all enquiries created in the period.',
      byCourse: "Enquiries by the student's main (first) course.",
      byCollege: 'Each preferred college counts once per enquiry, so totals can exceed the number of enquiries.',
      fees: 'Currently published official course totals (whole course, before discounts; excludes the consultancy charge and optional fees).',
    },
    registrations: registrations.map((r) => ({ date: r._id, count: r.n })),
    enquiries: {
      total: totalEnquiries,
      byStatus: Object.fromEntries(enquiryStatuses.map((s) => [s._id, s.n])),
      byCourse: await named(CourseModel, byCourse),
      byState: byState.map((s) => ({ label: s._id || 'Not given', count: s.n })),
      byCollege: await named(CollegeModel, byCollege),
      conversion: { confirmedAdmissions: confirmed.length, rate: totalEnquiries ? Math.round((confirmed.length / totalEnquiries) * 1000) / 10 : 0 },
      pendingFollowUps: followUps,
    },
    applications: Object.fromEntries(appStatuses.map((s) => [s._id, s.n])),
    scholarships: { byStatus: Object.fromEntries(schStatuses.map((s) => [s._id, s.n])), approvedAwardsMinor: awards[0]?.total ?? 0 },
    fees: fees.map((f) => ({ course: courseNames.get(String(f._id)) ?? 'Unknown', published: f.n, minMinor: f.min, avgMinor: Math.round(f.avg), maxMinor: f.max })),
    emailFailures: emailFailures.map((e) => ({ template: e._id, count: e.n })),
  };
}

// ---- CSV exports ----

type Row = Record<string, unknown>;
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : '');
const rupees = (m: unknown) => (typeof m === 'number' ? (m / 100).toFixed(2) : '');

// Each dataset lists the fields that may be exported. Personal data fields are marked; they are only included
// when asked for explicitly.
export const DATASETS = {
  students: { pii: ['name', 'email', 'mobile'], fields: ['createdAt', 'emailVerified', 'city', 'state', 'percentage', 'name', 'email', 'mobile'] },
  enquiries: { pii: ['studentName', 'studentEmail', 'studentMobile'], fields: ['reference', 'status', 'createdAt', 'courses', 'colleges', 'city', 'state', 'budgetRupees', 'admissionYear', 'assignedTo', 'studentName', 'studentEmail', 'studentMobile'] },
  applications: { pii: ['studentName'], fields: ['reference', 'enquiryReference', 'collegeName', 'courseName', 'status', 'submittedAt', 'decisionAt', 'admissionConfirmed', 'studentName'] },
  'scholarship-applications': { pii: ['studentName', 'studentEmail'], fields: ['reference', 'scholarshipName', 'status', 'preliminaryResult', 'awardRupees', 'createdAt', 'studentName', 'studentEmail'] },
} as const;
export type Dataset = keyof typeof DATASETS;
export const MAX_EXPORT_ROWS = 5000;
// Byte-order mark so spreadsheet apps read the file as UTF-8 (₹ and Indian names).
const BOM = String.fromCharCode(0xfeff);

async function rows(dataset: Dataset, r: Range): Promise<Row[]> {
  const created = { createdAt: { $gte: r.from, $lte: r.to } };
  if (dataset === 'students') {
    const users = await UserModel.find({ role: 'student', anonymisedAt: null, ...created }).sort({ createdAt: 1 }).limit(MAX_EXPORT_ROWS + 1).lean();
    const profiles = new Map((await StudentProfileModel.find({ user: { $in: users.map((u) => u._id) } }).lean()).map((p) => [String(p.user), p]));
    return users.map((u) => {
      const p = profiles.get(String(u._id));
      return { createdAt: iso(u.createdAt), emailVerified: u.emailVerifiedAt ? 'yes' : 'no', city: p?.personal?.city ?? '', state: p?.personal?.state ?? '', percentage: p?.academic?.percentage ?? '', name: u.name, email: u.email, mobile: u.mobile ?? '' };
    });
  }
  if (dataset === 'enquiries') {
    const list = await EnquiryModel.find(created).sort({ createdAt: 1 }).limit(MAX_EXPORT_ROWS + 1).lean();
    const ids = (k: 'courses' | 'colleges') => list.flatMap((e) => e.preferences?.[k] ?? []);
    const [courses, colleges, admins] = await Promise.all([
      CourseModel.find({ _id: { $in: ids('courses') } }).select('name').lean(),
      CollegeModel.find({ _id: { $in: ids('colleges') } }).select('name').lean(),
      UserModel.find({ _id: { $in: list.map((e) => e.assignedTo).filter(Boolean) } }).select('name').lean(),
    ]);
    const n = (a: Array<{ _id: unknown; name: string }>) => new Map(a.map((x) => [String(x._id), x.name]));
    const [cn, gn, an] = [n(courses), n(colleges), n(admins)];
    return list.map((e) => ({
      reference: e.reference,
      status: e.status,
      createdAt: iso(e.createdAt),
      courses: (e.preferences?.courses ?? []).map((c) => cn.get(String(c))).join('; '),
      colleges: (e.preferences?.colleges ?? []).map((c) => gn.get(String(c))).join('; '),
      city: e.studentSnapshot?.city ?? '',
      state: e.studentSnapshot?.state ?? '',
      budgetRupees: rupees(e.preferences?.budgetMinor),
      admissionYear: e.preferences?.admissionYear ?? '',
      assignedTo: e.assignedTo ? (an.get(String(e.assignedTo)) ?? '') : '',
      studentName: e.studentSnapshot?.name ?? '',
      studentEmail: e.studentSnapshot?.email ?? '',
      studentMobile: e.studentSnapshot?.mobile ?? '',
    }));
  }
  if (dataset === 'applications') {
    const list = await AdmissionApplicationModel.find(created).sort({ createdAt: 1 }).limit(MAX_EXPORT_ROWS + 1).lean();
    const enq = new Map((await EnquiryModel.find({ _id: { $in: list.map((a) => a.enquiry) } }).select('reference studentSnapshot.name').lean()).map((e) => [String(e._id), e]));
    return list.map((a) => ({
      reference: a.reference,
      enquiryReference: enq.get(String(a.enquiry))?.reference ?? '',
      collegeName: a.collegeName,
      courseName: a.courseName,
      status: a.status,
      submittedAt: iso(a.submittedAt),
      decisionAt: iso(a.decisionAt),
      admissionConfirmed: a.status === 'admitted' && a.evidence?.verifiedAt ? 'yes' : 'no',
      studentName: enq.get(String(a.enquiry))?.studentSnapshot?.name ?? '',
    }));
  }
  const list = await ScholarshipApplicationModel.find(created).sort({ createdAt: 1 }).limit(MAX_EXPORT_ROWS + 1).lean();
  return list.map((a) => ({
    reference: a.reference,
    scholarshipName: a.scholarshipName,
    status: a.status,
    preliminaryResult: a.preliminary?.result ?? '',
    awardRupees: rupees(a.decision?.awardMinor),
    createdAt: iso(a.createdAt),
    studentName: a.studentSnapshot?.name ?? '',
    studentEmail: a.studentSnapshot?.email ?? '',
  }));
}

// Quotes every cell and neutralises spreadsheet formulas (=, +, -, @, tab, CR) so a cell can never execute.
export function csvCell(v: unknown) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function exportCsv(req: Request, dataset: Dataset, q: { from?: Date; to?: Date; fields?: string[] }) {
  const range = defaultRange(q);
  const spec = DATASETS[dataset];
  const requested = q.fields?.length ? q.fields : spec.fields.filter((f) => !(spec.pii as readonly string[]).includes(f));
  const unknown = requested.filter((f) => !(spec.fields as readonly string[]).includes(f));
  if (unknown.length) throw new ApiError(422, 'VALIDATION_ERROR', `Unknown fields: ${unknown.join(', ')}`, unknown.map((f) => ({ field: 'fields', message: `Unknown field ${f}` })));
  const data = await rows(dataset, range);
  if (data.length > MAX_EXPORT_ROWS) throw new ApiError(422, 'TOO_MANY_ROWS', `More than ${MAX_EXPORT_ROWS} rows. Choose a shorter date range.`);
  const csv = [requested.map(csvCell).join(','), ...data.map((r) => requested.map((f) => csvCell(r[f])).join(','))].join('\r\n');
  const pii = requested.filter((f) => (spec.pii as readonly string[]).includes(f));
  await audit(actorFrom(req), 'report.exported', { type: 'report', id: dataset }, req, { fields: requested, personalData: pii, rows: data.length, from: range.from, to: range.to });
  return { csv: `${BOM}${csv}\r\n`, filename: `${dataset}-${range.from.toISOString().slice(0, 10)}-to-${range.to.toISOString().slice(0, 10)}.csv`, rows: data.length };
}
