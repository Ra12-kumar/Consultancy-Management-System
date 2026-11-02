import mongoose from 'mongoose';
import { CollegeModel } from '../models/College.js';
import { CollegeCourseModel } from '../models/CollegeCourse.js';
import { CourseModel } from '../models/Course.js';
import { EnquiryModel } from '../models/Enquiry.js';
import { LocationModel } from '../models/Location.js';
import { ShortlistModel } from '../models/Shortlist.js';
import { StudentProfileModel } from '../models/StudentProfile.js';
import { escapeRegex } from './catalog.service.js';
import { courseMap, toCollegeCard } from './collegeSearch.service.js';
import { checkEligibility, type Eligibility } from './eligibility.service.js';
import { marksOf } from './student.service.js';

// College suggestions for a student, from what they told us: courses, places and budget from their latest
// enquiry, and the preferred course and location in their profile. Only published colleges; each suggestion
// says which preferences it matched. With nothing to go on, the featured colleges are shown instead.

type Id = mongoose.Types.ObjectId;
const LIMIT = 6;
const DEADLINE_WINDOW_DAYS = 60;

const byName = (text: string) => new RegExp(escapeRegex(text.trim()), 'i');

export async function recommendationsFor(userId: string) {
  const student = new mongoose.Types.ObjectId(userId);
  const [profile, enquiry, shortlisted] = await Promise.all([
    StudentProfileModel.findOne({ user: student }).lean(),
    EnquiryModel.findOne({ student }).sort({ createdAt: -1 }).select('preferences').lean(),
    ShortlistModel.find({ student }).select('college').lean(),
  ]);
  const prefs = enquiry?.preferences;
  const wantCourse = profile?.preferences?.course?.trim() ?? '';
  const wantPlace = profile?.preferences?.location?.trim() ?? '';

  const courseIds: Id[] = [...((prefs?.courses ?? []) as Id[])];
  if (wantCourse.length >= 2) courseIds.push(...(await CourseModel.find({ $or: [{ name: byName(wantCourse) }, { slug: byName(wantCourse) }] }).select('_id').limit(10).lean()).map((c) => c._id));
  const locationIds: Id[] = [...((prefs?.locations ?? []) as Id[])];
  if (wantPlace.length >= 2) locationIds.push(...(await LocationModel.find({ isActive: true, name: byName(wantPlace) }).select('_id').limit(10).lean()).map((l) => l._id));
  const budget = prefs?.budgetMinor ?? null;

  const saved = shortlisted.map((s) => s.college);
  const base = { status: 'published', _id: { $nin: saved } };
  const criteria: Array<[string, Record<string, unknown>]> = [];
  if (courseIds.length) criteria.push(['course', { courseIds: { $in: courseIds } }]);
  if (locationIds.length) criteria.push(['location', { locationIds: { $in: locationIds } }]);
  if (budget) criteria.push(['budget', { 'feeSummary.minTotalMinor': { $ne: null, $lte: budget } }]);

  // Every preference first, then fewer (course before location before budget), then the featured colleges.
  const attempts: Array<[string[], Record<string, unknown>]> = [];
  for (let n = criteria.length; n >= 1; n -= 1) attempts.push([criteria.slice(0, n).map(([k]) => k), Object.assign({}, ...criteria.slice(0, n).map(([, f]) => f))]);
  attempts.push([['featured'], { featured: true }]);

  let basis: string[] = [];
  let found: Array<Record<string, unknown> & { _id: Id }> = [];
  for (const [keys, filter] of attempts) {
    found = (await CollegeModel.find({ ...base, ...filter }).sort({ featured: -1, featuredRank: 1, name: 1 }).limit(LIMIT).lean()) as typeof found;
    if (found.length) {
      basis = keys;
      break;
    }
  }
  const courses = await courseMap(found.flatMap((c) => (c.courseIds as unknown[]) ?? []));

  // Admission deadlines coming up for shortlisted colleges.
  const now = new Date();
  const deadlines = await CollegeModel.find({ _id: { $in: saved }, status: 'published', admissionDeadline: { $gte: now, $lte: new Date(now.getTime() + DEADLINE_WINDOW_DAYS * 86_400_000) } })
    .select('name slug admissionDeadline academicSession applicationUrl')
    .sort({ admissionDeadline: 1 })
    .limit(10)
    .lean();

  // Eligibility for the wanted course at each suggested college (best match among its active courses).
  const marks = marksOf(profile?.marks);
  const academics = {
    highestQualification: profile?.academic?.highestQualification ?? null,
    percentage: profile?.academic?.percentage ?? null,
    marks: { class10: marks.class10.percentage, class12: marks.class12.percentage, graduation: marks.graduation.percentage },
    entranceExams: ((profile?.academic?.entranceExams ?? []) as Array<{ name: string }>).map((e) => e.name),
  };
  const offerings = await CollegeCourseModel.find({ college: { $in: found.map((c) => c._id) }, status: 'active', ...(courseIds.length && { course: { $in: courseIds } }) }).lean();
  const levels = await courseMap(offerings.map((o) => o.course));
  const ORDER: Record<Eligibility, number> = { eligible: 0, potentially_eligible: 1, not_eligible: 2 };
  const best = new Map<string, { result: Eligibility; course: string; reasons: string[] }>();
  for (const o of offerings) {
    const course = levels.get(String(o.course));
    const check = checkEligibility(academics, { level: course?.level ?? 'ug', minQualification: o.minQualification ?? null, minPercentage: o.minPercentage ?? null, entranceExams: o.entranceExams ?? [] });
    const prev = best.get(String(o.college));
    if (!prev || ORDER[check.result] < ORDER[prev.result]) best.set(String(o.college), { result: check.result, course: course?.name ?? 'Course', reasons: check.reasons });
  }

  return {
    basis,
    items: found.map((c) => ({ ...toCollegeCard(c, courses), eligibility: best.get(String(c._id)) ?? null })),
    deadlines: deadlines.map((d) => ({ name: d.name, slug: d.slug, deadline: d.admissionDeadline, academicSession: d.academicSession ?? '' })),
  };
}
