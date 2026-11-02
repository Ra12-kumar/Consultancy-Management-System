import { CollegeModel } from '../src/models/College.js';
import { CollegeCourseModel } from '../src/models/CollegeCourse.js';
import { CollegeFeeModel } from '../src/models/CollegeFee.js';
import { CourseModel } from '../src/models/Course.js';
import { LocationModel } from '../src/models/Location.js';
import { refreshCollegeSummary } from '../src/services/catalog.service.js';
import { calculateFee, storedTotals, type FeeComponent } from '../src/services/feeCalculator.js';

export const rupees = (r: number) => r * 100;

// A small location tree: North India > Delhi NCR > Noida (also in Uttar Pradesh); South India > Tamil Nadu > Chennai.
export async function seedPlaces() {
  const north = await LocationModel.create({ name: 'North India', slug: 'north-india', kind: 'region' });
  const ncr = await LocationModel.create({ name: 'Delhi NCR', slug: 'delhi-ncr', kind: 'region', parents: [north._id] });
  const up = await LocationModel.create({ name: 'Uttar Pradesh', slug: 'uttar-pradesh', kind: 'state', parents: [north._id] });
  const noida = await LocationModel.create({ name: 'Noida', slug: 'noida', kind: 'city', parents: [up._id, ncr._id] });
  const south = await LocationModel.create({ name: 'South India', slug: 'south-india', kind: 'region' });
  const tn = await LocationModel.create({ name: 'Tamil Nadu', slug: 'tamil-nadu', kind: 'state', parents: [south._id] });
  const chennai = await LocationModel.create({ name: 'Chennai', slug: 'chennai', kind: 'city', parents: [tn._id] });
  const btech = await CourseModel.create({ name: 'B.Tech / B.E.', slug: 'btech-be', level: 'ug', category: 'Engineering', typicalDurationMonths: 48 });
  const mba = await CourseModel.create({ name: 'MBA / PGDM', slug: 'mba-pgdm', level: 'pg', category: 'Management', typicalDurationMonths: 24 });
  return { north, ncr, up, noida, south, tn, chennai, btech, mba };
}

// A college with one offering and (optionally) a published fee, written straight to the models.
export async function makeCollege(o: {
  slug: string;
  name?: string;
  status?: 'draft' | 'published' | 'archived';
  location: unknown;
  course: unknown;
  months?: number;
  minPercentage?: number | null;
  tuitionPerYear?: number | null;
  // Explicit fee components (instead of tuitionPerYear).
  components?: FeeComponent[];
  type?: string;
  featured?: boolean;
  isSample?: boolean;
}) {
  const college = await CollegeModel.create({ name: o.name ?? o.slug, slug: o.slug, type: o.type ?? 'private', status: o.status ?? 'published', location: o.location, featured: o.featured ?? false, isSample: o.isSample ?? false, lastVerifiedAt: new Date() });
  const offering = await CollegeCourseModel.create({ college: college._id, course: o.course, durationMonths: o.months ?? 48, minPercentage: o.minPercentage ?? null });
  if (o.tuitionPerYear != null || o.components) {
    const components: FeeComponent[] = o.components ?? [{ key: 'tuition', amountMinor: rupees(o.tuitionPerYear!), frequency: 'per_year' }];
    const b = calculateFee({ components, durationMonths: offering.durationMonths });
    await CollegeFeeModel.create({ collegeCourse: offering._id, college: college._id, course: o.course, academicYear: '2026-27', components, status: 'published', version: 1, durationMonths: offering.durationMonths, ...storedTotals(b), sourceRef: 'https://example.edu/fees.pdf', lastVerifiedAt: new Date() });
  }
  await refreshCollegeSummary(college._id);
  return { college, offering };
}
