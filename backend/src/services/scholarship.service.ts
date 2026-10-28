import type { Request } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { CollegeModel } from '../models/College.js';
import { CourseModel } from '../models/Course.js';
import { EnquiryModel, FINISHED_STATUSES } from '../models/Enquiry.js';
import { LocationModel } from '../models/Location.js';
import { FINISHED_SCHOLARSHIP_APPS, ScholarshipApplicationModel, ScholarshipModel } from '../models/Scholarship.js';
import { StudentProfileModel } from '../models/StudentProfile.js';
import { UserModel } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { actorFrom, audit } from './audit.service.js';
import { escapeRegex, pageMeta } from './catalog.service.js';
import { frontendLink, nextReference, oid, safeEmail } from './enquiryShared.js';
import { checkEligibility, type Facts } from './scholarshipEligibility.js';

type Lean = Record<string, any> & { _id: mongoose.Types.ObjectId }; // eslint-disable-line @typescript-eslint/no-explicit-any
const invalid = (field: string, message: string, code = 'VALIDATION_ERROR') => new ApiError(422, code, message, [{ field, message }]);
const isDuplicate = (err: unknown) => (err as { code?: number })?.code === 11000;
const ACTIVE_APP = ['submitted', 'under_review', 'documents_pending', 'approved'];
export const STATUS_LABELS: Record<string, string> = { submitted: 'Submitted', under_review: 'Under review', documents_pending: 'Documents needed', approved: 'Approved', rejected: 'Not approved', withdrawn: 'Withdrawn' };

// ---- Views ----

async function lookups(list: Lean[]) {
  const ids = (k: (s: Lean) => unknown[]) => [...new Set(list.flatMap(k).filter(Boolean).map(String))];
  const [courses, states, colleges] = await Promise.all([
    CourseModel.find({ _id: { $in: ids((s) => s.eligibility?.courses ?? []) } }).select('name slug').lean(),
    LocationModel.find({ _id: { $in: ids((s) => s.eligibility?.states ?? []) } }).select('name slug').lean(),
    CollegeModel.find({ _id: { $in: ids((s) => [s.college]) } }).select('name slug status').lean(),
  ]);
  const map = <T extends { _id: unknown }>(a: T[]) => new Map(a.map((x) => [String(x._id), x]));
  return { courses: map(courses), states: map(states), colleges: map(colleges) };
}
type Lookups = Awaited<ReturnType<typeof lookups>>;

const isOpen = (s: Lean, now = new Date()) => !s.applicationDeadline || s.applicationDeadline.getTime() >= now.getTime();

export function toPublicScholarship(s: Lean, l: Lookups) {
  const college = s.college ? l.colleges.get(String(s.college)) : null;
  const pick = (m: Map<string, { _id: unknown; name: string; slug: string }>, ids: unknown[]) => ids.map((id) => m.get(String(id))).filter(Boolean).map((x) => ({ id: String(x!._id), name: x!.name, slug: x!.slug }));
  return {
    id: String(s._id),
    name: s.name,
    slug: s.slug,
    providerType: s.providerType,
    providerName: s.providerName || college?.name || '',
    // A college link only while the college itself is public.
    college: college ? { name: college.name, slug: college.status === 'published' ? college.slug : null } : null,
    description: s.description,
    benefit: s.benefit,
    eligibility: {
      courses: pick(l.courses as never, s.eligibility.courses),
      minPercentage: s.eligibility.minPercentage ?? null,
      maxFamilyIncomeMinor: s.eligibility.maxFamilyIncomeMinor ?? null,
      states: pick(l.states as never, s.eligibility.states),
      categories: s.eligibility.categories,
      genders: s.eligibility.genders,
      notes: s.eligibility.notes,
    },
    documentsRequired: s.documentsRequired,
    academicYear: s.academicYear,
    applicationDeadline: s.applicationDeadline ?? null,
    open: isOpen(s),
    officialUrl: s.officialUrl || null,
    sourceRef: s.sourceRef,
    lastVerifiedAt: s.lastVerifiedAt ?? null,
    isSample: Boolean(s.isSample),
  };
}

const rulesOf = (s: Lean) => ({
  courses: (s.eligibility.courses ?? []).map(String),
  minPercentage: s.eligibility.minPercentage ?? null,
  maxFamilyIncomeMinor: s.eligibility.maxFamilyIncomeMinor ?? null,
  states: (s.eligibility.states ?? []).map(String),
  categories: s.eligibility.categories ?? [],
  genders: s.eligibility.genders ?? [],
});
const labelsOf = (l: Lookups) => Object.fromEntries([...l.courses.values(), ...l.states.values()].map((x) => [String(x._id), (x as { name: string }).name]));

// ---- Public ----

export async function listScholarships(q: { q?: string; provider?: string; college?: string; course?: string; state?: string; open?: 'yes'; page: number; limit: number }) {
  const filter: Record<string, unknown> = { status: 'published' };
  if (q.q) filter.$or = [{ name: new RegExp(escapeRegex(q.q), 'i') }, { providerName: new RegExp(escapeRegex(q.q), 'i') }];
  if (q.provider) filter.providerType = q.provider;
  const empty = { items: [], meta: pageMeta(q.page, q.limit, 0) };
  if (q.college) {
    const c = await CollegeModel.findOne({ slug: q.college, status: 'published' }).select('_id').lean();
    if (!c) return empty;
    filter.college = c._id;
  }
  if (q.course) {
    const c = await CourseModel.findOne({ slug: q.course }).select('_id').lean();
    if (!c) return empty;
    // Scholarships for that course or for any course.
    filter.$and = [{ $or: [{ 'eligibility.courses': c._id }, { 'eligibility.courses': { $size: 0 } }] }];
  }
  if (q.state) {
    const st = await LocationModel.findOne({ slug: q.state }).select('_id').lean();
    if (!st) return empty;
    filter.$and = [...((filter.$and as object[]) ?? []), { $or: [{ 'eligibility.states': st._id }, { 'eligibility.states': { $size: 0 } }] }];
  }
  if (q.open === 'yes') filter.$and = [...((filter.$and as object[]) ?? []), { $or: [{ applicationDeadline: null }, { applicationDeadline: { $gte: new Date() } }] }];
  const [items, total] = await Promise.all([
    ScholarshipModel.aggregate<Lean>([{ $match: filter }, { $addFields: { _noDeadline: { $cond: [{ $eq: [{ $ifNull: ['$applicationDeadline', null] }, null] }, 1, 0] } } }, { $sort: { _noDeadline: 1, applicationDeadline: 1, name: 1, _id: 1 } }, { $skip: (q.page - 1) * q.limit }, { $limit: q.limit }]),
    ScholarshipModel.countDocuments(filter),
  ]);
  const l = await lookups(items);
  return { items: items.map((s) => toPublicScholarship(s, l)), meta: pageMeta(q.page, q.limit, total) };
}

export async function scholarshipDetail(slug: string) {
  const s = (await ScholarshipModel.findOne({ slug, status: 'published' }).lean()) as Lean | null;
  if (!s) throw ApiError.notFound('Scholarship not found');
  return toPublicScholarship(s, await lookups([s]));
}

// College ids that have published college scholarships (for the directory's "has scholarships" filter).
export const collegesWithScholarships = () => ScholarshipModel.distinct('college', { status: 'published', providerType: 'college', college: { $ne: null } });

// ---- Student: preliminary eligibility ----

type Declared = { familyIncomeMinor?: number | null; category?: string | null; gender?: string | null; course?: string | null };

// The student's facts: marks and state from their profile, courses from the declared course or their open enquiries,
// and what they declare now (income, category, gender). Declared facts are not stored on the profile.
async function studentFacts(req: Request, declared: Declared): Promise<Facts & { stateName: string }> {
  const profile = await StudentProfileModel.findOne({ user: req.user!.id }).lean();
  const stateName = profile?.personal?.state ?? '';
  const state = stateName ? await LocationModel.findOne({ kind: 'state', name: new RegExp(`^${escapeRegex(stateName)}$`, 'i') }).select('_id').lean() : null;
  let courses = declared.course ? [declared.course] : [];
  if (!courses.length) {
    const enquiries = await EnquiryModel.find({ student: req.user!.id, status: { $nin: FINISHED_STATUSES } }).select('preferences.courses').lean();
    courses = [...new Set(enquiries.flatMap((e) => (e.preferences?.courses ?? []).map(String)))];
  }
  return { courses, percentage: profile?.academic?.percentage ?? null, familyIncomeMinor: declared.familyIncomeMinor ?? null, state: state ? String(state._id) : null, category: declared.category ?? null, gender: declared.gender ?? null, stateName };
}

export async function checkMyEligibility(req: Request, declared: Declared, slug?: string) {
  const list = (await ScholarshipModel.find({ status: 'published', ...(slug && { slug }) }).sort({ applicationDeadline: 1, name: 1 }).limit(200).lean()) as Lean[];
  if (slug && !list.length) throw ApiError.notFound('Scholarship not found');
  const facts = await studentFacts(req, declared);
  const l = await lookups(list);
  const labels = labelsOf(l);
  return {
    preliminary: true,
    facts: { percentage: facts.percentage, state: facts.stateName || null, courses: facts.courses.map((c) => l.courses.get(c)?.name ?? null).filter(Boolean) },
    results: list.map((s) => ({ scholarship: toPublicScholarship(s, l), ...checkEligibility(rulesOf(s), facts, { deadline: s.applicationDeadline, labels }) })),
  };
}

// ---- Student: applications ----

const toStudentApplication = (a: Lean) => ({
  reference: a.reference,
  scholarshipName: a.scholarshipName,
  scholarship: String(a.scholarship),
  status: a.status,
  statusLabel: STATUS_LABELS[a.status],
  preliminary: a.preliminary,
  declared: { familyIncomeMinor: a.declared?.familyIncomeMinor ?? null, category: a.declared?.category ?? null, gender: a.declared?.gender ?? null },
  statement: a.statement,
  decision: a.status === 'approved' || a.status === 'rejected' ? { awardMinor: a.decision?.awardMinor ?? null, note: a.decision?.note ?? '', at: a.decision?.at ?? null } : null,
  // Student-visible history: status and the note written for the student (never internal notes or who reviewed).
  history: (a.history ?? []).map((h: Lean) => ({ status: h.to, statusLabel: STATUS_LABELS[h.to], note: h.note, at: h.at })),
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});

async function notifyAdmins(a: Lean) {
  const admins = await UserModel.find({ role: 'admin', status: 'active', permissions: 'scholarships.manage' }).select('email').lean();
  for (const to of new Set([...admins.map((x) => x.email), ...env.ADMIN_NOTIFY_EMAILS])) {
    await safeEmail({ to, template: 'scholarship_new_admin', params: { reference: a.reference, name: a.studentSnapshot.name, scholarship: a.scholarshipName, link: frontendLink(`/admin/scholarship-applications/${String(a._id)}`) }, dedupeKey: `sch-new:${String(a._id)}:${to}` });
  }
}

export async function applyForScholarship(req: Request, input: Declared & { scholarship: string; enquiry?: string | null; statement: string }) {
  const s = (await ScholarshipModel.findOne({ _id: input.scholarship, status: 'published' }).lean()) as Lean | null;
  if (!s) throw ApiError.notFound('Scholarship not found');
  if (!isOpen(s)) throw new ApiError(409, 'SCHOLARSHIP_CLOSED', 'Applications for this scholarship have closed');
  if (input.enquiry && !(await EnquiryModel.exists({ _id: input.enquiry, student: req.user!.id }))) throw invalid('enquiry', 'Choose one of your enquiries');
  if (await ScholarshipApplicationModel.exists({ student: req.user!.id, scholarship: s._id, status: { $in: ACTIVE_APP } })) {
    throw new ApiError(409, 'ALREADY_APPLIED', 'You already have an application for this scholarship');
  }
  const facts = await studentFacts(req, input);
  const l = await lookups([s]);
  const prelim = checkEligibility(rulesOf(s), facts, { deadline: s.applicationDeadline, labels: labelsOf(l) });
  if (prelim.result === 'not_eligible') {
    throw new ApiError(422, 'NOT_ELIGIBLE', 'Based on the details given you do not meet this scholarship’s criteria. Talk to your counsellor if you think this is wrong.', prelim.reasons.filter((r) => r.ok === false).map((r) => ({ field: r.rule, message: r.message })));
  }
  const user = await UserModel.findById(req.user!.id).select('name email').lean();
  let a;
  try {
    a = await ScholarshipApplicationModel.create({
      reference: await nextReference('SCH'),
      scholarship: s._id,
      scholarshipName: s.name,
      student: req.user!.id,
      enquiry: input.enquiry ?? null,
      studentSnapshot: { name: user!.name, email: user!.email, percentage: facts.percentage, state: facts.stateName },
      declared: { familyIncomeMinor: input.familyIncomeMinor ?? null, category: input.category ?? null, gender: input.gender ?? null, course: input.course ?? null },
      statement: input.statement,
      preliminary: prelim,
      history: [{ from: null, to: 'submitted', by: req.user!.id, byName: user!.name, note: '' }],
    });
  } catch (err) {
    if (isDuplicate(err)) throw new ApiError(409, 'ALREADY_APPLIED', 'You already have an application for this scholarship');
    throw err;
  }
  const doc = a.toObject() as Lean;
  await audit(actorFrom(req), 'scholarship.applied', { type: 'scholarship_application', id: String(a._id) }, req, { scholarship: String(s._id) });
  await safeEmail({ to: user!.email, template: 'scholarship_received', params: { reference: a.reference, name: user!.name, scholarship: s.name, link: frontendLink('/student/scholarships') }, dedupeKey: `sch-ack:${String(a._id)}` });
  await notifyAdmins(doc);
  return toStudentApplication(doc);
}

export async function myScholarshipApplications(req: Request) {
  return ((await ScholarshipApplicationModel.find({ student: req.user!.id }).sort({ createdAt: -1 }).lean()) as Lean[]).map(toStudentApplication);
}

export async function withdrawScholarshipApplication(req: Request, reference: string) {
  const a = (await ScholarshipApplicationModel.findOne({ reference, student: req.user!.id }).lean()) as Lean | null;
  if (!a) throw ApiError.notFound('Application not found');
  if (FINISHED_SCHOLARSHIP_APPS.includes(a.status)) throw new ApiError(409, 'APPLICATION_FINISHED', 'This application is already decided or withdrawn');
  const updated = await ScholarshipApplicationModel.findOneAndUpdate({ _id: a._id, status: a.status }, { $set: { status: 'withdrawn' }, $push: { history: { from: a.status, to: 'withdrawn', by: req.user!.id, byName: req.user!.name, note: 'Withdrawn by you' } } }, { new: true }).lean();
  if (!updated) throw new ApiError(409, 'STATUS_CHANGED', 'This application was just updated. Reload and try again.');
  return toStudentApplication(updated as Lean);
}

// ---- Admin: scholarships (scholarships.manage) ----

export async function adminScholarships(q: { q?: string; status?: string; page: number; limit: number }) {
  const filter: Record<string, unknown> = {};
  if (q.q) filter.name = new RegExp(escapeRegex(q.q), 'i');
  if (q.status) filter.status = q.status;
  const [items, total] = await Promise.all([ScholarshipModel.find(filter).sort({ updatedAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), ScholarshipModel.countDocuments(filter)]);
  const counts = new Map((await ScholarshipApplicationModel.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([{ $match: { scholarship: { $in: items.map((i) => i._id) } } }, { $group: { _id: '$scholarship', n: { $sum: 1 } } }])).map((c) => [String(c._id), c.n]));
  return { items: (items as Lean[]).map((s) => ({ ...toAdmin(s), applications: counts.get(String(s._id)) ?? 0 })), meta: pageMeta(q.page, q.limit, total) };
}

function toAdmin(s: Lean) {
  return {
    id: String(s._id),
    name: s.name,
    slug: s.slug,
    providerType: s.providerType,
    providerName: s.providerName,
    college: s.college ? String(s.college) : null,
    description: s.description,
    benefit: s.benefit,
    eligibility: { ...s.eligibility, courses: (s.eligibility.courses ?? []).map(String), states: (s.eligibility.states ?? []).map(String) },
    documentsRequired: s.documentsRequired,
    academicYear: s.academicYear,
    applicationDeadline: s.applicationDeadline ?? null,
    officialUrl: s.officialUrl,
    sourceRef: s.sourceRef,
    lastVerifiedAt: s.lastVerifiedAt ?? null,
    status: s.status,
    isSample: Boolean(s.isSample),
    updatedAt: s.updatedAt,
  };
}

export async function adminScholarship(id: string) {
  const s = (await ScholarshipModel.findById(id).lean()) as Lean | null;
  if (!s) throw ApiError.notFound('Scholarship not found');
  return toAdmin(s);
}

async function assertRefs(input: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (input.college && !(await CollegeModel.exists({ _id: input.college }))) throw invalid('college', 'Choose a college');
  const courses = input.eligibility?.courses ?? [];
  if (courses.length && (await CourseModel.countDocuments({ _id: { $in: courses } })) !== courses.length) throw invalid('eligibility.courses', 'Choose courses from the list');
  const states = input.eligibility?.states ?? [];
  if (states.length && (await LocationModel.countDocuments({ _id: { $in: states }, kind: 'state' })) !== states.length) throw invalid('eligibility.states', 'Choose states from the list');
}

export async function createScholarship(input: Record<string, unknown>, req: Request) {
  await assertRefs(input);
  try {
    const s = await ScholarshipModel.create({ ...input, status: 'draft', isSample: false });
    await audit(actorFrom(req), 'scholarship.created', { type: 'scholarship', id: String(s._id) }, req, { slug: input.slug });
    return toAdmin(s.toObject() as Lean);
  } catch (err) {
    if (isDuplicate(err)) throw new ApiError(409, 'SLUG_IN_USE', 'A scholarship with this slug already exists');
    throw err;
  }
}

export async function updateScholarship(id: string, patch: Record<string, unknown>, req: Request) {
  await assertRefs(patch);
  const set: Record<string, unknown> = { ...patch };
  // Nested objects are replaced as a whole only when sent.
  let s;
  try {
    s = await ScholarshipModel.findByIdAndUpdate(id, { $set: set }, { new: true, runValidators: true }).lean();
  } catch (err) {
    if (isDuplicate(err)) throw new ApiError(409, 'SLUG_IN_USE', 'A scholarship with this slug already exists');
    throw err;
  }
  if (!s) throw ApiError.notFound('Scholarship not found');
  await audit(actorFrom(req), 'scholarship.updated', { type: 'scholarship', id }, req, { fields: Object.keys(patch) });
  return toAdmin(s as Lean);
}

// Publishing needs a verification date; government schemes need their official page; college scholarships a college;
// percentage and fixed benefits a value.
export async function setScholarshipStatus(id: string, action: 'publish' | 'archive' | 'restore', req: Request) {
  const s = (await ScholarshipModel.findById(id).lean()) as Lean | null;
  if (!s) throw ApiError.notFound('Scholarship not found');
  if (action === 'publish') {
    const missing: Array<{ field: string; message: string }> = [];
    if (!s.lastVerifiedAt) missing.push({ field: 'lastVerifiedAt', message: 'Add the date the details were verified' });
    if (s.providerType === 'government' && !s.officialUrl) missing.push({ field: 'officialUrl', message: 'Add the official scheme page' });
    if (s.providerType === 'college' && !s.college) missing.push({ field: 'college', message: 'Choose the college' });
    if (s.benefit.type !== 'other' && s.benefit.value == null) missing.push({ field: 'benefit.value', message: 'Add the benefit amount' });
    if (missing.length) throw new ApiError(422, 'NOT_READY', 'Complete the details before publishing', missing);
  }
  const status = { publish: 'published', archive: 'archived', restore: 'draft' }[action];
  await ScholarshipModel.updateOne({ _id: id }, { $set: { status } });
  await audit(actorFrom(req), `scholarship.${action === 'restore' ? 'restored' : `${action}ed`}`, { type: 'scholarship', id }, req);
  return adminScholarship(id);
}

// ---- Admin: applications ----

function toAdminApplication(a: Lean) {
  return { ...toStudentApplication(a), id: String(a._id), student: { id: String(a.student), ...a.studentSnapshot }, enquiry: a.enquiry ? String(a.enquiry) : null, internalNote: a.internalNote, decisionBy: a.decision?.by ? String(a.decision.by) : null, fullHistory: a.history };
}

export async function adminScholarshipApplications(q: { status?: string; scholarship?: string; q?: string; page: number; limit: number }) {
  const filter: Record<string, unknown> = {};
  if (q.status) filter.status = q.status;
  if (q.scholarship) filter.scholarship = oid(q.scholarship);
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ reference: rx }, { 'studentSnapshot.name': rx }, { 'studentSnapshot.email': rx }, { scholarshipName: rx }];
  }
  const [items, total] = await Promise.all([ScholarshipApplicationModel.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), ScholarshipApplicationModel.countDocuments(filter)]);
  return { items: (items as Lean[]).map(toAdminApplication), meta: pageMeta(q.page, q.limit, total) };
}

export async function adminScholarshipApplication(id: string) {
  const a = (await ScholarshipApplicationModel.findById(id).lean()) as Lean | null;
  if (!a) throw ApiError.notFound('Application not found');
  return toAdminApplication(a);
}

async function transition(id: string, to: string, from: string[], req: Request, set: Record<string, unknown>, note: string) {
  const a = (await ScholarshipApplicationModel.findById(id).lean()) as Lean | null;
  if (!a) throw ApiError.notFound('Application not found');
  if (!from.includes(a.status)) throw new ApiError(409, 'INVALID_TRANSITION', `This application is ${STATUS_LABELS[a.status]?.toLowerCase()} and cannot be moved to ${STATUS_LABELS[to]?.toLowerCase()}`);
  const updated = await ScholarshipApplicationModel.findOneAndUpdate(
    { _id: id, status: a.status },
    { $set: { status: to, ...set }, $push: { history: { from: a.status, to, by: req.user!.id, byName: req.user!.name, note } } },
    { new: true },
  ).lean();
  if (!updated) throw new ApiError(409, 'STATUS_CHANGED', 'This application was just updated. Reload and try again.');
  return updated as Lean;
}

// Review steps (scholarships.manage): under review / documents needed, with a note for the student.
export async function reviewScholarshipApplication(id: string, input: { status: 'under_review' | 'documents_pending'; note: string; internalNote?: string }, req: Request) {
  const a = await transition(id, input.status, ['submitted', 'under_review', 'documents_pending'], req, input.internalNote !== undefined ? { internalNote: input.internalNote } : {}, input.note);
  await audit(actorFrom(req), 'scholarship.application_reviewed', { type: 'scholarship_application', id }, req, { to: input.status });
  await safeEmail({ to: a.studentSnapshot.email, template: 'scholarship_update', params: { reference: a.reference, name: a.studentSnapshot.name, scholarship: a.scholarshipName, status: STATUS_LABELS[input.status]!, note: input.note, link: frontendLink('/student/scholarships') }, dedupeKey: `sch-upd:${id}:${input.status}:${Date.now()}` });
  return toAdminApplication(a);
}

// The award decision (scholarships.approve). The preliminary check never approves anything by itself.
export async function decideScholarshipApplication(id: string, input: { decision: 'approved' | 'rejected'; note: string; awardMinor: number | null }, req: Request) {
  const a = await transition(id, input.decision, ['submitted', 'under_review', 'documents_pending'], req, { decision: { awardMinor: input.decision === 'approved' ? input.awardMinor : null, note: input.note, by: oid(req.user!.id), at: new Date() } }, input.note);
  await audit(actorFrom(req), `scholarship.application_${input.decision}`, { type: 'scholarship_application', id }, req, { awardMinor: input.awardMinor });
  await safeEmail({ to: a.studentSnapshot.email, template: 'scholarship_decision', params: { reference: a.reference, name: a.studentSnapshot.name, scholarship: a.scholarshipName, decision: input.decision, note: input.note, link: frontendLink('/student/scholarships') }, dedupeKey: `sch-dec:${id}` });
  return toAdminApplication(a);
}

// ---- Dashboard ----

export async function scholarshipCounts(f: { from?: Date; to?: Date; scholarshipStatus?: string } = {}) {
  const range = f.from || f.to ? { createdAt: { ...(f.from && { $gte: f.from }), ...(f.to && { $lte: f.to }) } } : {};
  const count = (status: string | string[]) => (f.scholarshipStatus && ![status].flat().includes(f.scholarshipStatus) ? Promise.resolve(0) : ScholarshipApplicationModel.countDocuments({ ...range, status: f.scholarshipStatus ?? (Array.isArray(status) ? { $in: status } : status) }));
  const [published, submitted, underReview, approved, rejected] = await Promise.all([
    ScholarshipModel.countDocuments({ status: 'published' }),
    count('submitted'),
    count(['under_review', 'documents_pending']),
    count('approved'),
    count('rejected'),
  ]);
  return { published, applications: { submitted, underReview, approved, rejected } };
}
