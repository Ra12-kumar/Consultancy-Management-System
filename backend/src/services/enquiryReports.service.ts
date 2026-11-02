import mongoose from 'mongoose';
import { CollegeModel } from '../models/College.js';
import { CollegeCourseModel } from '../models/CollegeCourse.js';
import { CourseModel } from '../models/Course.js';
import { EnquiryModel, FINISHED_STATUSES, type EnquiryStatus } from '../models/Enquiry.js';
import { UserModel } from '../models/User.js';

// Enquiry reports for admins: totals and counsellor-, college- and course-wise tables over the same filters
// (date range, college, course, counsellor, status). "Converted" = admission confirmed with evidence.

export type ReportFilter = { from?: Date; to?: Date; college?: string; course?: string; counsellor?: string; status?: EnquiryStatus };
const CLOSED: EnquiryStatus[] = ['NOT_INTERESTED', 'REJECTED', 'WITHDRAWN', 'CLOSED'];
const oid = (id: string) => new mongoose.Types.ObjectId(id);

export function reportMatch(f: ReportFilter) {
  const m: Record<string, unknown> = {};
  if (f.from || f.to) m.createdAt = { ...(f.from && { $gte: f.from }), ...(f.to && { $lte: f.to }) };
  if (f.college) m['preferences.colleges'] = oid(f.college);
  if (f.course) m['preferences.courses'] = oid(f.course);
  if (f.counsellor) m.assignedTo = f.counsellor === 'unassigned' ? null : oid(f.counsellor);
  if (f.status) m.status = f.status;
  return m;
}

// Counts for one group: total, new, pending (not yet finished), converted, closed.
const groupStats = {
  total: { $sum: 1 },
  fresh: { $sum: { $cond: [{ $eq: ['$status', 'NEW'] }, 1, 0] } },
  pending: { $sum: { $cond: [{ $not: [{ $in: ['$status', FINISHED_STATUSES] }] }, 1, 0] } },
  converted: { $sum: { $cond: [{ $eq: ['$status', 'ADMITTED'] }, 1, 0] } },
  closed: { $sum: { $cond: [{ $in: ['$status', CLOSED] }, 1, 0] } },
};
type Stats = { total: number; fresh: number; pending: number; converted: number; closed: number };
const shape = (s: Partial<Stats> | undefined) => {
  const total = s?.total ?? 0;
  return { total, new: s?.fresh ?? 0, pending: s?.pending ?? 0, converted: s?.converted ?? 0, closed: s?.closed ?? 0, conversionRate: total ? Math.round(((s?.converted ?? 0) / total) * 1000) / 10 : 0 };
};

export async function enquiryReport(f: ReportFilter) {
  const match = reportMatch(f);
  const [totals, byCounsellor, byCollege, byCourse] = await Promise.all([
    EnquiryModel.aggregate<Stats>([{ $match: match }, { $group: { _id: null, ...groupStats } }]),
    EnquiryModel.aggregate<Stats & { _id: mongoose.Types.ObjectId | null }>([{ $match: match }, { $group: { _id: '$assignedTo', ...groupStats } }, { $sort: { total: -1 } }, { $limit: 100 }]),
    EnquiryModel.aggregate<Stats & { _id: mongoose.Types.ObjectId }>([{ $match: match }, { $unwind: '$preferences.colleges' }, { $group: { _id: '$preferences.colleges', ...groupStats } }, { $sort: { total: -1 } }, { $limit: 50 }]),
    EnquiryModel.aggregate<Stats & { _id: mongoose.Types.ObjectId }>([{ $match: match }, { $unwind: '$preferences.courses' }, { $group: { _id: '$preferences.courses', ...groupStats } }, { $sort: { total: -1 } }, { $limit: 50 }]),
  ]);
  const [people, colleges, courses] = await Promise.all([
    UserModel.find({ _id: { $in: byCounsellor.map((r) => r._id).filter(Boolean) } }).select('name role').lean(),
    CollegeModel.find({ _id: { $in: byCollege.map((r) => r._id) } }).select('name').lean(),
    CourseModel.find({ _id: { $in: byCourse.map((r) => r._id) } }).select('name').lean(),
  ]);
  const name = (list: Array<{ _id: unknown; name: string }>) => new Map(list.map((x) => [String(x._id), x.name]));
  const p = name(people);
  const c = name(colleges);
  const k = name(courses);
  return {
    totals: shape(totals[0]),
    byCounsellor: byCounsellor.map((r) => ({ id: r._id ? String(r._id) : null, name: r._id ? (p.get(String(r._id)) ?? 'Former staff') : 'Unassigned', ...shape(r) })),
    byCollege: byCollege.map((r) => ({ id: String(r._id), name: c.get(String(r._id)) ?? 'Removed college', ...shape(r) })),
    byCourse: byCourse.map((r) => ({ id: String(r._id), name: k.get(String(r._id)) ?? 'Removed course', ...shape(r) })),
  };
}

// Headline totals for the admin dashboard.
export async function platformTotals() {
  const [students, activeColleges, activeCourses, counsellors, enquiries, fresh, pending, converted, closed] = await Promise.all([
    UserModel.countDocuments({ role: 'student' }),
    CollegeModel.countDocuments({ status: 'published' }),
    CollegeCourseModel.countDocuments({ status: 'active' }),
    UserModel.countDocuments({ role: 'counsellor', status: 'active' }),
    EnquiryModel.countDocuments({}),
    EnquiryModel.countDocuments({ status: 'NEW' }),
    EnquiryModel.countDocuments({ status: { $nin: FINISHED_STATUSES } }),
    EnquiryModel.countDocuments({ status: 'ADMITTED' }),
    EnquiryModel.countDocuments({ status: { $in: CLOSED } }),
  ]);
  return { students, activeColleges, activeCourses, counsellors, enquiries, new: fresh, pending, converted, closed };
}
