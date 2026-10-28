import type { Request } from 'express';
import mongoose from 'mongoose';
import { CollegeModel } from '../models/College.js';
import { CollegeCourseModel } from '../models/CollegeCourse.js';
import { CollegeFeeModel } from '../models/CollegeFee.js';
import { CourseModel } from '../models/Course.js';
import { LocationModel } from '../models/Location.js';
import { ScholarshipApplicationModel, ScholarshipModel } from '../models/Scholarship.js';
import { SavedComparisonModel, ShortlistModel } from '../models/Shortlist.js';
import { ApiError } from '../utils/ApiError.js';
import type { CollegeInput, OfferingInput } from '../validators/catalog.validators.js';
import { actorFrom, audit } from './audit.service.js';

type Id = mongoose.Types.ObjectId | string;
const oid = (id: Id) => new mongoose.Types.ObjectId(String(id));
export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const pageMeta = (page: number, limit: number, total: number) => ({ page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
const isDuplicate = (err: unknown) => (err as { code?: number })?.code === 11000;

// ---- Serialisers (what the API returns) ----

type Lean = Record<string, unknown> & { _id: unknown };
export const toLocation = (l: Lean) => ({ id: String(l._id), name: l.name, slug: l.slug, kind: l.kind, parents: ((l.parents as unknown[]) ?? []).map(String), isActive: l.isActive, sortOrder: l.sortOrder });
export const toCourse = (c: Lean) => ({ id: String(c._id), name: c.name, slug: c.slug, level: c.level, category: c.category, typicalDurationMonths: c.typicalDurationMonths ?? null, isActive: c.isActive, sortOrder: c.sortOrder });
export const toOffering = (o: Lean) => ({
  id: String(o._id),
  college: String(o.college),
  course: String(o.course),
  specialization: o.specialization,
  durationMonths: o.durationMonths,
  seats: o.seats ?? null,
  eligibilityText: o.eligibilityText,
  minPercentage: o.minPercentage ?? null,
  entranceExams: o.entranceExams,
  applicationDeadline: o.applicationDeadline ?? null,
  admissionProcess: o.admissionProcess,
  status: o.status,
});
export function toAdminCollege(c: Lean) {
  const { _id, __v: _v, locationIds, courseIds, location, ...rest } = c;
  return { id: String(_id), ...rest, location: location ? String(location) : null, locationIds: ((locationIds as unknown[]) ?? []).map(String), courseIds: ((courseIds as unknown[]) ?? []).map(String) };
}

// ---- Derived data ----

// The location and every ancestor (city -> state -> regions), following parents transitively.
export async function locationAncestry(locationId: Id | null) {
  if (!locationId) return [];
  const seen = new Map<string, Lean>();
  let frontier = [String(locationId)];
  while (frontier.length && seen.size < 50) {
    const found = (await LocationModel.find({ _id: { $in: frontier.map(oid) } }).lean()) as Lean[];
    frontier = [];
    for (const l of found) {
      if (seen.has(String(l._id))) continue;
      seen.set(String(l._id), l);
      frontier.push(...((l.parents as unknown[]) ?? []).map(String).filter((p) => !seen.has(p)));
    }
  }
  return [...seen.values()];
}

// Recomputes a college's derived fields from its location, active offerings and published fees.
export async function refreshCollegeSummary(collegeId: Id) {
  const college = await CollegeModel.findById(collegeId).select('location').lean();
  if (!college) return;
  const ancestry = await locationAncestry(college.location ?? null);
  const city = ancestry.find((l) => String(l._id) === String(college.location));
  const state = ancestry.find((l) => l.kind === 'state');
  const offerings = await CollegeCourseModel.find({ college: collegeId, status: 'active' }).select('course').lean();
  const [totals] = await CollegeFeeModel.aggregate<{ min: number; max: number }>([
    { $match: { college: oid(collegeId), status: 'published', collegeCourse: { $in: offerings.map((o) => o._id) } } },
    { $group: { _id: null, min: { $min: '$officialTotalMinor' }, max: { $max: '$officialTotalMinor' } } },
  ]);
  await CollegeModel.updateOne(
    { _id: collegeId },
    {
      $set: {
        locationIds: ancestry.map((l) => l._id),
        city: (city?.name as string) ?? '',
        state: (state?.name as string) ?? '',
        courseIds: [...new Set(offerings.map((o) => String(o.course)))].map(oid),
        feeSummary: { minTotalMinor: totals?.min ?? null, maxTotalMinor: totals?.max ?? null, currency: 'INR' },
      },
    },
  );
}

export async function rebuildAllSummaries() {
  const ids = await CollegeModel.distinct('_id');
  for (const id of ids) await refreshCollegeSummary(id as Id);
  return ids.length;
}

// ---- Public lists ----

export async function publicLocations() {
  return ((await LocationModel.find({ isActive: true }).sort({ kind: 1, sortOrder: 1, name: 1 }).lean()) as Lean[]).map(toLocation);
}
export async function publicCourses() {
  return ((await CourseModel.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean()) as Lean[]).map(toCourse);
}

// ---- Admin: locations ----

export async function adminLocations() {
  return ((await LocationModel.find().sort({ kind: 1, sortOrder: 1, name: 1 }).lean()) as Lean[]).map(toLocation);
}

async function assertParents(parents: string[] | undefined, selfId?: string) {
  if (!parents?.length) return;
  if (selfId && parents.includes(selfId)) throw new ApiError(422, 'VALIDATION_ERROR', 'A location cannot be its own parent', [{ field: 'parents', message: 'A location cannot be its own parent' }]);
  if ((await LocationModel.countDocuments({ _id: { $in: parents } })) !== new Set(parents).size) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Unknown parent location', [{ field: 'parents', message: 'Choose existing locations' }]);
  }
  // No cycles: the new parents must not descend from this location.
  if (selfId && (await Promise.all(parents.map(locationAncestry))).flat().some((l) => String(l._id) === selfId)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'That would make a loop of locations', [{ field: 'parents', message: 'That would make a loop of locations' }]);
  }
}

export async function createLocation(input: { name: string; slug: string; kind: string; parents: string[]; isActive: boolean; sortOrder: number }, req: Request) {
  await assertParents(input.parents);
  try {
    const l = await LocationModel.create(input);
    await audit(actorFrom(req), 'catalog.location_created', { type: 'location', id: String(l._id) }, req, { slug: input.slug });
    return toLocation(l.toObject() as Lean);
  } catch (err) {
    if (isDuplicate(err)) throw new ApiError(409, 'SLUG_IN_USE', 'A location with this slug already exists');
    throw err;
  }
}

export async function updateLocation(id: string, patch: Record<string, unknown>, req: Request) {
  await assertParents(patch.parents as string[] | undefined, id);
  const l = await LocationModel.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true }).lean();
  if (!l) throw ApiError.notFound('Location not found');
  // Parents or names changed: colleges' derived location data follows.
  const affected = await CollegeModel.distinct('_id', { locationIds: l._id });
  for (const c of affected) await refreshCollegeSummary(c as Id);
  await audit(actorFrom(req), 'catalog.location_updated', { type: 'location', id }, req, { fields: Object.keys(patch) });
  return toLocation(l as Lean);
}

export async function deleteLocation(id: string, req: Request) {
  const inUse = (await CollegeModel.exists({ locationIds: oid(id) })) || (await LocationModel.exists({ parents: oid(id) }));
  if (inUse) throw new ApiError(409, 'IN_USE', 'This location is in use. Deactivate it instead.');
  const r = await LocationModel.deleteOne({ _id: id });
  if (!r.deletedCount) throw ApiError.notFound('Location not found');
  await audit(actorFrom(req), 'catalog.location_deleted', { type: 'location', id }, req);
  return { deleted: true };
}

// ---- Admin: courses ----

export async function adminCourses() {
  return ((await CourseModel.find().sort({ sortOrder: 1, name: 1 }).lean()) as Lean[]).map(toCourse);
}

export async function createCourse(input: Record<string, unknown>, req: Request) {
  try {
    const c = await CourseModel.create(input);
    await audit(actorFrom(req), 'catalog.course_created', { type: 'course', id: String(c._id) }, req, { slug: input.slug });
    return toCourse(c.toObject() as Lean);
  } catch (err) {
    if (isDuplicate(err)) throw new ApiError(409, 'SLUG_IN_USE', 'A course with this slug already exists');
    throw err;
  }
}

export async function updateCourse(id: string, patch: Record<string, unknown>, req: Request) {
  const c = await CourseModel.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true }).lean();
  if (!c) throw ApiError.notFound('Course not found');
  await audit(actorFrom(req), 'catalog.course_updated', { type: 'course', id }, req, { fields: Object.keys(patch) });
  return toCourse(c as Lean);
}

export async function deleteCourse(id: string, req: Request) {
  if (await CollegeCourseModel.exists({ course: id })) throw new ApiError(409, 'IN_USE', 'Colleges offer this course. Deactivate it instead.');
  const r = await CourseModel.deleteOne({ _id: id });
  if (!r.deletedCount) throw ApiError.notFound('Course not found');
  await audit(actorFrom(req), 'catalog.course_deleted', { type: 'course', id }, req);
  return { deleted: true };
}

// ---- Admin: colleges ----

export async function adminColleges({ q, status, sample, page, limit }: { q?: string; status?: string; sample?: 'yes' | 'no'; page: number; limit: number }) {
  const filter: Record<string, unknown> = {};
  if (q) filter.name = new RegExp(escapeRegex(q), 'i');
  if (status) filter.status = status;
  if (sample) filter.isSample = sample === 'yes';
  const [items, total] = await Promise.all([CollegeModel.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), CollegeModel.countDocuments(filter)]);
  return { items: (items as Lean[]).map(toAdminCollege), meta: pageMeta(page, limit, total) };
}

export async function adminCollege(id: string) {
  const c = await CollegeModel.findById(id).lean();
  if (!c) throw ApiError.notFound('College not found');
  const offerings = await CollegeCourseModel.find({ college: id }).sort({ createdAt: 1 }).lean();
  return { ...toAdminCollege(c as Lean), offerings: (offerings as Lean[]).map(toOffering) };
}

async function assertCity(location: string | null | undefined) {
  if (location && !(await LocationModel.exists({ _id: location, kind: 'city' }))) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a city', [{ field: 'location', message: 'Choose a city from the locations list' }]);
  }
}

export async function createCollege(input: CollegeInput, req: Request) {
  await assertCity(input.location);
  try {
    // New colleges always start as drafts and are never sample records.
    const c = await CollegeModel.create({ ...input, status: 'draft', isSample: false });
    await refreshCollegeSummary(c._id);
    await audit(actorFrom(req), 'catalog.college_created', { type: 'college', id: String(c._id) }, req, { slug: input.slug });
    return adminCollege(String(c._id));
  } catch (err) {
    if (isDuplicate(err)) throw new ApiError(409, 'SLUG_IN_USE', 'A college with this slug already exists');
    throw err;
  }
}

export async function updateCollege(id: string, patch: Partial<CollegeInput>, req: Request) {
  await assertCity(patch.location);
  const before = await CollegeModel.findById(id).lean();
  if (!before) throw ApiError.notFound('College not found');
  if (before.status === 'published' && patch.location === null) throw new ApiError(422, 'VALIDATION_ERROR', 'A published college needs a city', [{ field: 'location', message: 'Choose a city' }]);
  try {
    await CollegeModel.updateOne({ _id: id }, { $set: patch }, { runValidators: true });
  } catch (err) {
    if (isDuplicate(err)) throw new ApiError(409, 'SLUG_IN_USE', 'A college with this slug already exists');
    throw err;
  }
  if ('location' in patch) await refreshCollegeSummary(id);
  await audit(actorFrom(req), 'catalog.college_updated', { type: 'college', id }, req, { fields: Object.keys(patch) });
  return adminCollege(id);
}

// Publishing needs the essentials; the public only ever sees published colleges.
export async function setCollegeStatus(id: string, action: 'publish' | 'archive' | 'restore', req: Request) {
  const c = await CollegeModel.findById(id).lean();
  if (!c) throw ApiError.notFound('College not found');
  if (action === 'publish') {
    const missing = [!c.location && 'location', !c.type && 'type', !c.lastVerifiedAt && 'lastVerifiedAt'].filter(Boolean) as string[];
    if (missing.length) {
      throw new ApiError(422, 'NOT_READY', 'Add the city, college type and the date the details were last verified before publishing', missing.map((field) => ({ field, message: 'Required before publishing' })));
    }
  }
  const status = { publish: 'published', archive: 'archived', restore: 'draft' }[action];
  await CollegeModel.updateOne({ _id: id }, { $set: { status } });
  await audit(actorFrom(req), `catalog.college_${action === 'restore' ? 'restored' : `${action}ed`}`, { type: 'college', id }, req, { from: c.status, to: status });
  return adminCollege(id);
}

// ---- Admin: offerings ----

export async function createOffering(collegeId: string, input: OfferingInput, req: Request) {
  if (!(await CollegeModel.exists({ _id: collegeId }))) throw ApiError.notFound('College not found');
  if (!(await CourseModel.exists({ _id: input.course }))) throw new ApiError(422, 'VALIDATION_ERROR', 'Unknown course', [{ field: 'course', message: 'Choose a course from the catalogue' }]);
  try {
    const o = await CollegeCourseModel.create({ ...input, college: collegeId });
    await refreshCollegeSummary(collegeId);
    await audit(actorFrom(req), 'catalog.offering_created', { type: 'offering', id: String(o._id) }, req, { college: collegeId, course: input.course });
    return toOffering(o.toObject() as Lean);
  } catch (err) {
    if (isDuplicate(err)) throw new ApiError(409, 'CONFLICT', 'This college already offers this course with the same specialization');
    throw err;
  }
}

export async function updateOffering(id: string, patch: Record<string, unknown>, req: Request) {
  let o;
  try {
    o = await CollegeCourseModel.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true }).lean();
  } catch (err) {
    if (isDuplicate(err)) throw new ApiError(409, 'CONFLICT', 'This college already offers this course with the same specialization');
    throw err;
  }
  if (!o) throw ApiError.notFound('Course offering not found');
  // The duration changes how often per-year/per-semester fees are charged; drafts follow it, published versions stay as published.
  if ('durationMonths' in patch) await recalcDraftFees(id, o.durationMonths);
  await refreshCollegeSummary(o.college);
  await audit(actorFrom(req), 'catalog.offering_updated', { type: 'offering', id }, req, { fields: Object.keys(patch) });
  return toOffering(o as Lean);
}

// Hook set by fee.service (avoids a circular import).
let recalcDraftFees: (offeringId: string, durationMonths: number) => Promise<void> = async () => {};
export const setDraftFeeRecalculator = (fn: typeof recalcDraftFees) => (recalcDraftFees = fn);

export async function deleteOffering(id: string, req: Request) {
  if (await CollegeFeeModel.exists({ collegeCourse: id, status: { $ne: 'draft' } })) throw new ApiError(409, 'IN_USE', 'This offering has fee history. Mark it inactive instead.');
  const o = await CollegeCourseModel.findByIdAndDelete(id).lean();
  if (!o) throw ApiError.notFound('Course offering not found');
  await CollegeFeeModel.deleteMany({ collegeCourse: id, status: 'draft' });
  await refreshCollegeSummary(o.college);
  await audit(actorFrom(req), 'catalog.offering_deleted', { type: 'offering', id }, req, { college: String(o.college) });
  return { deleted: true };
}

// ---- Dashboard counts and sample removal ----

export async function catalogCounts() {
  const [published, draft, archived, sample, offerings, draftFees, publishedFees] = await Promise.all([
    CollegeModel.countDocuments({ status: 'published' }),
    CollegeModel.countDocuments({ status: 'draft' }),
    CollegeModel.countDocuments({ status: 'archived' }),
    CollegeModel.countDocuments({ isSample: true }),
    CollegeCourseModel.countDocuments({ status: 'active' }),
    CollegeFeeModel.countDocuments({ status: 'draft' }),
    CollegeFeeModel.countDocuments({ status: 'published' }),
  ]);
  return { colleges: { published, draft, archived, sample }, offerings, fees: { draft: draftFees, published: publishedFees } };
}

// Deletes every sample college with its offerings, fees, shortlist entries and saved comparisons. Nothing else.
export async function removeSampleColleges() {
  const ids = await CollegeModel.distinct('_id', { isSample: true });
  const scholarshipIds = await ScholarshipModel.distinct('_id', { $or: [{ isSample: true }, { college: { $in: ids } }] });
  const scholarshipApplications = (await ScholarshipApplicationModel.deleteMany({ scholarship: { $in: scholarshipIds } })).deletedCount;
  const scholarships = (await ScholarshipModel.deleteMany({ _id: { $in: scholarshipIds } })).deletedCount;
  if (!ids.length) return { colleges: 0, offerings: 0, fees: 0, shortlists: 0, comparisons: 0, scholarships, scholarshipApplications };
  const [fees, offerings, shortlists, comparisons] = await Promise.all([
    CollegeFeeModel.deleteMany({ college: { $in: ids } }),
    CollegeCourseModel.deleteMany({ college: { $in: ids } }),
    ShortlistModel.deleteMany({ college: { $in: ids } }),
    SavedComparisonModel.deleteMany({ colleges: { $in: ids } }),
  ]);
  const colleges = await CollegeModel.deleteMany({ _id: { $in: ids }, isSample: true });
  return { colleges: colleges.deletedCount, offerings: offerings.deletedCount, fees: fees.deletedCount, shortlists: shortlists.deletedCount, comparisons: comparisons.deletedCount, scholarships, scholarshipApplications };
}
