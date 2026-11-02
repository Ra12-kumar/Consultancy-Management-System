import mongoose from 'mongoose';
import { CollegeModel } from '../models/College.js';
import { CollegeCourseModel } from '../models/CollegeCourse.js';
import { CollegeFeeModel } from '../models/CollegeFee.js';
import { CourseModel } from '../models/Course.js';
import { escapeRegex, pageMeta } from './catalog.service.js';
import { brochureUrl, pictureUrl } from './collegeMedia.service.js';

// Public course browser: active course offerings of published colleges only, filtered by degree level, place,
// fee, qualification and mode. Inactive offerings and unpublished colleges never appear.

// Qualification order for "can I apply with what I have". Diploma counts like Class 12 (lateral entry varies by
// college, so it is never shown as more than that). "other" is not ranked.
const RANK: Record<string, number> = { class_10: 1, class_12: 2, diploma: 2, undergraduate: 3, postgraduate: 4 };

export type OfferingQuery = {
  q?: string;
  level?: string;
  course?: string;
  state?: string;
  city?: string;
  maxFee?: number; // rupees per year (or in total when a course has no yearly fee)
  qualification?: string;
  mode?: string;
  sort: 'deadline' | 'fee' | 'name';
  page: number;
  limit: number;
};

type Lean = Record<string, unknown> & { _id: mongoose.Types.ObjectId };

export async function browseOfferings(q: OfferingQuery) {
  const courseFilter: Record<string, unknown> = { isActive: true };
  if (q.level) courseFilter.level = q.level;
  if (q.course) courseFilter.slug = q.course;
  const courses = (await CourseModel.find(courseFilter).select('name slug level category').lean()) as Lean[];
  if (!courses.length) return { items: [], meta: pageMeta(q.page, q.limit, 0) };
  const courseById = new Map(courses.map((c) => [String(c._id), c]));

  const collegeFilter: Record<string, unknown> = { status: 'published' };
  if (q.state) collegeFilter.state = new RegExp(`^${escapeRegex(q.state)}$`, 'i');
  if (q.city) collegeFilter.city = new RegExp(`^${escapeRegex(q.city)}$`, 'i');
  const colleges = (await CollegeModel.find(collegeFilter).select('name slug city state logoUrl isSample').lean()) as Lean[];
  const collegeById = new Map(colleges.map((c) => [String(c._id), c]));
  if (!colleges.length) return { items: [], meta: pageMeta(q.page, q.limit, 0) };

  const offeringFilter: Record<string, unknown> = { status: 'active', college: { $in: colleges.map((c) => c._id) }, course: { $in: courses.map((c) => c._id) } };
  if (q.mode) offeringFilter.mode = q.mode;
  let offerings = (await CollegeCourseModel.find(offeringFilter).limit(5000).lean()) as Lean[];

  // Qualification: offerings that state no minimum are kept (eligibility is then for the counsellor to confirm).
  const mine = q.qualification ? RANK[q.qualification] : undefined;
  if (mine !== undefined) offerings = offerings.filter((o) => !o.minQualification || (RANK[String(o.minQualification)] ?? 99) <= mine);

  // Name search over the course, specialization and college.
  if (q.q) {
    const words = q.q.toLowerCase().split(/\s+/).filter(Boolean);
    offerings = offerings.filter((o) => {
      const hay = `${courseById.get(String(o.course))?.name ?? ''} ${o.specialization ?? ''} ${collegeById.get(String(o.college))?.name ?? ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }

  // Latest published fee of each offering.
  const fees = (await CollegeFeeModel.find({ collegeCourse: { $in: offerings.map((o) => o._id) }, status: 'published' }).sort({ academicYear: -1 }).select('collegeCourse academicYear officialTotalMinor annualOfficialMinor').lean()) as Lean[];
  const feeBy = new Map<string, Lean>();
  for (const f of fees) if (!feeBy.has(String(f.collegeCourse))) feeBy.set(String(f.collegeCourse), f);
  const yearly = (o: Lean) => {
    const f = feeBy.get(String(o._id));
    return f ? ((f.annualOfficialMinor as number | null) ?? (f.officialTotalMinor as number)) : null;
  };
  if (q.maxFee !== undefined) offerings = offerings.filter((o) => {
    const fee = yearly(o);
    return fee !== null && fee <= q.maxFee! * 100;
  });

  const deadline = (o: Lean) => (o.applicationDeadline ? new Date(o.applicationDeadline as Date).getTime() : Infinity);
  const name = (o: Lean) => `${courseById.get(String(o.course))?.name ?? ''} ${collegeById.get(String(o.college))?.name ?? ''}`;
  offerings.sort((a, b) =>
    q.sort === 'fee' ? (yearly(a) ?? Infinity) - (yearly(b) ?? Infinity) : q.sort === 'deadline' ? deadline(a) - deadline(b) : name(a).localeCompare(name(b)),
  );

  const total = offerings.length;
  const page = offerings.slice((q.page - 1) * q.limit, q.page * q.limit);
  return {
    items: page.map((o) => {
      const course = courseById.get(String(o.course))!;
      const college = collegeById.get(String(o.college))!;
      const f = feeBy.get(String(o._id));
      return {
        id: String(o._id),
        course: { name: course.name as string, slug: course.slug as string, level: course.level as string, category: (course.category as string) ?? '' },
        college: { name: college.name as string, slug: college.slug as string, city: (college.city as string) ?? '', state: (college.state as string) ?? '', logoUrl: (college.logoUrl as string) || null, isSample: Boolean(college.isSample) },
        specialization: (o.specialization as string) ?? '',
        description: (o.description as string) ?? '',
        durationMonths: o.durationMonths as number,
        mode: (o.mode as string) ?? 'offline',
        seats: (o.seats as number | null) ?? null,
        minQualification: (o.minQualification as string | null) ?? null,
        minPercentage: (o.minPercentage as number | null) ?? null,
        entranceExams: (o.entranceExams as string[]) ?? [],
        eligibilityText: (o.eligibilityText as string) ?? '',
        applicationDeadline: (o.applicationDeadline as Date | null) ?? null,
        imageUrl: pictureUrl(o.imageFile),
        brochureUrl: brochureUrl(o.brochureFile),
        fee: f ? { academicYear: f.academicYear as string, yearlyMinor: (f.annualOfficialMinor as number | null) ?? null, totalMinor: f.officialTotalMinor as number } : null,
      };
    }),
    meta: pageMeta(q.page, q.limit, total),
  };
}
