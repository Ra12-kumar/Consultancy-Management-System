import mongoose from 'mongoose';
import { CollegeModel } from '../models/College.js';
import { CollegeCourseModel } from '../models/CollegeCourse.js';
import { CollegeFeeModel } from '../models/CollegeFee.js';
import { CourseModel } from '../models/Course.js';
import { LocationModel } from '../models/Location.js';
import { ApiError } from '../utils/ApiError.js';
import type { CompareQuery, ListCollegesQuery } from '../validators/catalog.validators.js';
import { escapeRegex, pageMeta } from './catalog.service.js';
import { breakdownOf } from './fee.service.js';
import { collegesWithScholarships } from './scholarship.service.js';

type Lean = Record<string, unknown> & { _id: mongoose.Types.ObjectId };
type CourseRef = { id: string; name: string; slug: string; level: string };

async function courseMap(ids: unknown[]) {
  const courses = await CourseModel.find({ _id: { $in: ids } }).lean();
  return new Map<string, CourseRef>(courses.map((c) => [String(c._id), { id: String(c._id), name: c.name, slug: c.slug, level: c.level }]));
}

// What a directory card shows. Only public fields; sample records are always flagged.
export function toCollegeCard(c: Lean, courses: Map<string, CourseRef>) {
  const fee = c.feeSummary as { minTotalMinor: number | null; maxTotalMinor: number | null } | undefined;
  return {
    id: String(c._id),
    name: c.name as string,
    slug: c.slug as string,
    type: c.type as string,
    city: c.city as string,
    state: c.state as string,
    logoUrl: (c.logoUrl as string) || null,
    featured: Boolean(c.featured),
    isSample: Boolean(c.isSample),
    lastVerifiedAt: (c.lastVerifiedAt as Date | null) ?? null,
    accreditations: ((c.accreditations as Array<{ body: string; grade: string }>) ?? []).map((a) => ({ body: a.body, grade: a.grade })),
    courses: ((c.courseIds as unknown[]) ?? []).map((id) => courses.get(String(id))).filter((x): x is CourseRef => Boolean(x)),
    feeFromMinor: fee?.minTotalMinor ?? null,
    feeToMinor: fee?.maxTotalMinor ?? null,
  };
}

const empty = (page: number, limit: number) => ({ items: [], meta: { ...pageMeta(page, limit, 0), hasSamples: false } });

// Public directory: published colleges only, with filters resolved on the server.
export async function searchColleges({ q, course, location, type, maxBudget, percentage, scholarship, sort, page, limit }: ListCollegesQuery) {
  const filter: Record<string, unknown> = { status: 'published' };
  const and: Record<string, unknown>[] = [];
  let courseId: mongoose.Types.ObjectId | null = null;

  if (course) {
    const c = await CourseModel.findOne({ slug: course, isActive: true }).select('_id').lean();
    if (!c) return empty(page, limit);
    courseId = c._id;
    filter.courseIds = courseId;
  }
  if (location) {
    const l = await LocationModel.findOne({ slug: location, isActive: true }).select('_id').lean();
    if (!l) return empty(page, limit);
    // locationIds holds the city and all its ancestors, so a region or state finds every city under it.
    filter.locationIds = l._id;
  }
  if (type) filter.type = type;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    // "btech" should find "B.Tech / B.E.": also compare letters and digits only.
    const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const wanted = squash(q);
    const courses = (await CourseModel.find({ isActive: true }).select('name slug').lean()).filter((c) => rx.test(c.name) || (wanted.length >= 2 && (squash(c.name).includes(wanted) || squash(c.slug).includes(wanted))));
    and.push({ $or: [{ name: rx }, { city: rx }, { state: rx }, ...(courses.length ? [{ courseIds: { $in: courses.map((c) => c._id) } }] : [])] });
  }
  if (percentage != null) {
    const eligible = await CollegeCourseModel.distinct('college', { status: 'active', ...(courseId && { course: courseId }), $or: [{ minPercentage: null }, { minPercentage: { $lte: percentage } }] });
    and.push({ _id: { $in: eligible } });
  }
  if (maxBudget != null) {
    const affordable = await CollegeFeeModel.distinct('college', { status: 'published', officialTotalMinor: { $lte: maxBudget }, ...(courseId && { course: courseId }) });
    and.push({ _id: { $in: affordable } });
  }
  if (scholarship === 'yes') and.push({ _id: { $in: await collegesWithScholarships() } });
  if (and.length) filter.$and = and;

  const noFee = { $cond: [{ $eq: [{ $ifNull: ['$feeSummary.minTotalMinor', null] }, null] }, 1, 0] };
  const order: Record<string, 1 | -1> = {
    featured: { featured: -1, name: 1 },
    name: { name: 1 },
    fee_low: { _noFee: 1, 'feeSummary.minTotalMinor': 1, name: 1 },
    fee_high: { _noFee: 1, 'feeSummary.maxTotalMinor': -1, name: 1 },
    recently_verified: { lastVerifiedAt: -1, name: 1 },
  }[sort] as Record<string, 1 | -1>;

  const [result] = await CollegeModel.aggregate<{ items: Lean[]; total: Array<{ n: number }> }>([
    { $match: filter },
    { $addFields: { _noFee: noFee } },
    { $sort: { ...order, _id: 1 } },
    { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: 'n' }] } },
  ]);
  const items = result?.items ?? [];
  const courses = await courseMap(items.flatMap((c) => (c.courseIds as unknown[]) ?? []));
  const hasSamples = Boolean(await CollegeModel.exists({ status: 'published', isSample: true }));
  return { items: items.map((c) => toCollegeCard(c, courses)), meta: { ...pageMeta(page, limit, result?.total[0]?.n ?? 0), hasSamples } };
}

// The current published fees (one per academic year and intake), newest year first.
function toPublicFee(f: Lean) {
  return {
    id: String(f._id),
    academicYear: f.academicYear,
    intake: f.intake,
    version: f.version,
    paymentSchedule: f.paymentSchedule,
    notes: f.notes,
    effectiveFrom: f.effectiveFrom ?? null,
    lastVerifiedAt: f.lastVerifiedAt ?? null,
    sourceRef: f.sourceRef,
    publishedAt: f.publishedAt ?? null,
    breakdown: breakdownOf({
      components: f.components as never,
      durationMonths: f.durationMonths as number,
      consultancyServiceChargeMinor: (f.consultancyServiceChargeMinor as number) ?? 0,
      discount: (f.discount as never) ?? null,
    }),
  };
}

async function offeringsWithFees(collegeIds: mongoose.Types.ObjectId[], courseId?: mongoose.Types.ObjectId) {
  const offerings = (await CollegeCourseModel.find({ college: { $in: collegeIds }, status: 'active', ...(courseId && { course: courseId }) }).sort({ createdAt: 1 }).lean()) as Lean[];
  const fees = (await CollegeFeeModel.find({ collegeCourse: { $in: offerings.map((o) => o._id) }, status: 'published' }).sort({ academicYear: -1, intake: 1 }).lean()) as Lean[];
  const courses = await courseMap(offerings.map((o) => o.course));
  return offerings.map((o) => ({
    id: String(o._id),
    college: String(o.college),
    course: courses.get(String(o.course)) ?? null,
    specialization: o.specialization as string,
    durationMonths: o.durationMonths as number,
    seats: (o.seats as number | null) ?? null,
    eligibilityText: o.eligibilityText as string,
    minPercentage: (o.minPercentage as number | null) ?? null,
    entranceExams: o.entranceExams as string[],
    applicationDeadline: (o.applicationDeadline as Date | null) ?? null,
    admissionProcess: o.admissionProcess as string,
    fees: fees.filter((f) => String(f.collegeCourse) === String(o._id)).map(toPublicFee),
  }));
}

// A published college's public profile with its courses and current fees. Anything else is a 404.
export async function collegeDetail(slug: string) {
  const c = (await CollegeModel.findOne({ slug, status: 'published' }).lean()) as Lean | null;
  if (!c) throw ApiError.notFound('College not found');
  const offerings = await offeringsWithFees([c._id]);
  const courses = await courseMap((c.courseIds as unknown[]) ?? []);
  return {
    ...toCollegeCard(c, courses),
    address: c.address,
    website: c.website || null,
    coverUrl: (c.coverUrl as string) || null,
    about: c.about,
    accreditations: c.accreditations,
    approvals: c.approvals,
    admissionProcess: c.admissionProcess,
    campusInfo: c.campusInfo,
    placementInfo: c.placementVerified ? c.placementInfo : '',
    contact: c.contact,
    verificationSource: c.verificationSource,
    offerings,
  };
}

// Side-by-side data for 2-4 published colleges, optionally for one course.
export async function compareColleges({ colleges: slugs, course }: CompareQuery) {
  let courseRef: CourseRef | null = null;
  if (course) {
    const c = await CourseModel.findOne({ slug: course }).lean();
    if (!c) throw ApiError.notFound('Course not found');
    courseRef = { id: String(c._id), name: c.name, slug: c.slug, level: c.level };
  }
  const found = (await CollegeModel.find({ slug: { $in: slugs }, status: 'published' }).lean()) as Lean[];
  if (found.length < 2) throw ApiError.notFound('Choose at least two published colleges to compare');
  const ordered = slugs.map((s) => found.find((c) => c.slug === s)).filter((c): c is Lean => Boolean(c));
  const offerings = await offeringsWithFees(ordered.map((c) => c._id), courseRef ? new mongoose.Types.ObjectId(courseRef.id) : undefined);
  const courses = await courseMap(ordered.flatMap((c) => (c.courseIds as unknown[]) ?? []));
  return {
    course: courseRef,
    missing: slugs.filter((s) => !ordered.some((c) => c.slug === s)),
    colleges: ordered.map((c) => {
      const card = toCollegeCard(c, courses);
      const own = offerings.filter((o) => o.college === card.id);
      return { ...card, approvals: c.approvals as string[], offerings: courseRef ? own : [], offering: courseRef ? (own[0] ?? null) : null };
    }),
  };
}
