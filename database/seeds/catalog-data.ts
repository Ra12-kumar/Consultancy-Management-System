// Catalogue seed data. Locations and the course list are real reference data. Every college here is FICTIONAL:
// named "Sample …", stored with isSample: true, shown with a "Sample data – not a real institution" badge, never
// given accreditation, rankings or placement claims, and removable with `npm run seed:remove-samples`.
// Fees are illustrative round numbers, not any institution's real fees.
import { CollegeModel } from '../../backend/src/models/College.js';
import { CollegeCourseModel } from '../../backend/src/models/CollegeCourse.js';
import { CollegeFeeModel } from '../../backend/src/models/CollegeFee.js';
import { CourseModel } from '../../backend/src/models/Course.js';
import { LocationModel } from '../../backend/src/models/Location.js';
import { ScholarshipModel } from '../../backend/src/models/Scholarship.js';
import { refreshCollegeSummary } from '../../backend/src/services/catalog.service.js';
import { calculateFee, storedTotals, type FeeComponent } from '../../backend/src/services/feeCalculator.js';

// [slug, name, kind, parent slugs]
const LOCATIONS: Array<[string, string, 'region' | 'state' | 'city', string[]]> = [
  ['north-india', 'North India', 'region', []],
  ['south-india', 'South India', 'region', []],
  ['west-india', 'West India', 'region', []],
  ['east-india', 'East India', 'region', []],
  ['delhi-ncr', 'Delhi NCR', 'region', ['north-india']],
  ['delhi', 'Delhi', 'state', ['north-india']],
  ['uttar-pradesh', 'Uttar Pradesh', 'state', ['north-india']],
  ['haryana', 'Haryana', 'state', ['north-india']],
  ['tamil-nadu', 'Tamil Nadu', 'state', ['south-india']],
  ['karnataka', 'Karnataka', 'state', ['south-india']],
  ['telangana', 'Telangana', 'state', ['south-india']],
  ['maharashtra', 'Maharashtra', 'state', ['west-india']],
  ['west-bengal', 'West Bengal', 'state', ['east-india']],
  ['new-delhi', 'New Delhi', 'city', ['delhi', 'delhi-ncr']],
  ['noida', 'Noida', 'city', ['uttar-pradesh', 'delhi-ncr']],
  ['greater-noida', 'Greater Noida', 'city', ['uttar-pradesh', 'delhi-ncr']],
  ['gurugram', 'Gurugram', 'city', ['haryana', 'delhi-ncr']],
  ['chennai', 'Chennai', 'city', ['tamil-nadu']],
  ['bengaluru', 'Bengaluru', 'city', ['karnataka']],
  ['hyderabad', 'Hyderabad', 'city', ['telangana']],
  ['pune', 'Pune', 'city', ['maharashtra']],
  ['mumbai', 'Mumbai', 'city', ['maharashtra']],
  ['kolkata', 'Kolkata', 'city', ['west-bengal']],
];

// [slug, name, level, category, typical months]
const COURSES: Array<[string, string, 'diploma' | 'ug' | 'pg' | 'pg_diploma' | 'doctorate', string, number]> = [
  ['btech-be', 'B.Tech / B.E.', 'ug', 'Engineering', 48],
  ['mtech-me', 'M.Tech / M.E.', 'pg', 'Engineering', 24],
  ['diploma-engineering', 'Diploma (Polytechnic)', 'diploma', 'Engineering', 36],
  ['bca', 'BCA', 'ug', 'Computer Applications', 36],
  ['mca', 'MCA', 'pg', 'Computer Applications', 24],
  ['bba', 'BBA', 'ug', 'Management', 36],
  ['mba-pgdm', 'MBA / PGDM', 'pg', 'Management', 24],
  ['bcom', 'B.Com', 'ug', 'Commerce', 36],
  ['ba', 'B.A.', 'ug', 'Arts', 36],
  ['bsc', 'B.Sc', 'ug', 'Science', 36],
  ['msc', 'M.Sc', 'pg', 'Science', 24],
  ['bpharm', 'B.Pharm', 'ug', 'Pharmacy', 48],
  ['dpharm', 'D.Pharm', 'diploma', 'Pharmacy', 24],
  ['mbbs', 'MBBS', 'ug', 'Medical', 66],
  ['bds', 'BDS', 'ug', 'Medical', 60],
  ['bsc-nursing', 'B.Sc Nursing', 'ug', 'Nursing', 48],
  ['barch', 'B.Arch', 'ug', 'Architecture', 60],
  ['llb', 'LLB', 'ug', 'Law', 36],
  ['ba-llb', 'BA LLB', 'ug', 'Law', 60],
  ['phd', 'Ph.D.', 'doctorate', 'Research', 36],
];

const R = (rupees: number) => rupees * 100;
type Offer = { course: string; specialization?: string; months?: number; minPct?: number | null; exams?: string[]; tuition: number; hostel?: number };
type SampleCollege = { slug: string; name: string; city: string; type: 'government' | 'private' | 'deemed' | 'autonomous'; featured?: boolean; offers: Offer[] };

const SAMPLES: SampleCollege[] = [
  { slug: 'sample-institute-of-technology-pune', name: 'Sample Institute of Technology, Pune', city: 'pune', type: 'private', featured: true, offers: [{ course: 'btech-be', specialization: 'Computer Science', minPct: 60, exams: ['JEE Main', 'MHT-CET'], tuition: 185000, hostel: 95000 }, { course: 'mtech-me', specialization: 'Data Science', minPct: 55, exams: ['GATE'], tuition: 140000 }] },
  { slug: 'sample-college-of-engineering-chennai', name: 'Sample College of Engineering, Chennai', city: 'chennai', type: 'government', offers: [{ course: 'btech-be', specialization: 'Mechanical', minPct: 50, exams: ['TNEA counselling'], tuition: 55000, hostel: 48000 }, { course: 'diploma-engineering', specialization: 'Civil', minPct: 35, tuition: 22000 }] },
  { slug: 'sample-school-of-management-hyderabad', name: 'Sample School of Management, Hyderabad', city: 'hyderabad', type: 'autonomous', featured: true, offers: [{ course: 'mba-pgdm', specialization: 'Finance', minPct: 50, exams: ['CAT', 'ICET'], tuition: 320000, hostel: 110000 }, { course: 'bba', minPct: 45, tuition: 95000 }] },
  { slug: 'sample-university-greater-noida', name: 'Sample University, Greater Noida', city: 'greater-noida', type: 'private', offers: [{ course: 'btech-be', specialization: 'Electronics', minPct: 55, exams: ['JEE Main'], tuition: 165000, hostel: 105000 }, { course: 'bca', minPct: 45, tuition: 80000 }, { course: 'mca', minPct: 50, tuition: 95000 }, { course: 'bpharm', minPct: 55, tuition: 120000 }] },
  { slug: 'sample-business-school-gurugram', name: 'Sample Business School, Gurugram', city: 'gurugram', type: 'private', offers: [{ course: 'mba-pgdm', specialization: 'Marketing', minPct: 50, exams: ['CAT', 'MAT'], tuition: 450000, hostel: 160000 }, { course: 'bba', minPct: 50, tuition: 140000 }] },
  { slug: 'sample-institute-of-pharmacy-noida', name: 'Sample Institute of Pharmacy, Noida', city: 'noida', type: 'private', offers: [{ course: 'bpharm', minPct: 55, tuition: 110000, hostel: 90000 }, { course: 'dpharm', minPct: 45, tuition: 75000 }] },
  { slug: 'sample-medical-college-bengaluru', name: 'Sample Medical College, Bengaluru', city: 'bengaluru', type: 'deemed', offers: [{ course: 'mbbs', minPct: 50, exams: ['NEET-UG'], tuition: 1250000, hostel: 180000 }, { course: 'bsc-nursing', minPct: 45, exams: ['NEET-UG'], tuition: 120000 }] },
  { slug: 'sample-arts-and-science-college-kolkata', name: 'Sample Arts and Science College, Kolkata', city: 'kolkata', type: 'autonomous', offers: [{ course: 'bcom', tuition: 30000 }, { course: 'bsc', specialization: 'Physics', minPct: 50, tuition: 36000 }, { course: 'ba', tuition: 24000 }] },
  { slug: 'sample-law-school-mumbai', name: 'Sample Law School, Mumbai', city: 'mumbai', type: 'private', offers: [{ course: 'ba-llb', minPct: 45, exams: ['CLAT', 'MH-CET Law'], tuition: 220000, hostel: 140000 }, { course: 'llb', minPct: 45, tuition: 120000 }] },
  { slug: 'sample-institute-of-computer-applications-new-delhi', name: 'Sample Institute of Computer Applications, New Delhi', city: 'new-delhi', type: 'private', offers: [{ course: 'bca', minPct: 50, tuition: 105000 }, { course: 'mca', minPct: 55, exams: ['NIMCET'], tuition: 130000 }] },
];

const SAMPLE_SOURCE = 'SAMPLE – illustrative figures only, not real fees';
export const SAMPLE_ACADEMIC_YEAR = '2026-27';

// Non-destructive: everything is inserted only when missing (by slug / offering); nothing is updated or deleted.
export async function seedCatalog() {
  const counts = { locations: 0, courses: 0, colleges: 0, offerings: 0, fees: 0, scholarships: 0 };
  const loc = new Map<string, unknown>();
  for (const [slug, name, kind, parents] of LOCATIONS) {
    const r = await LocationModel.updateOne({ slug }, { $setOnInsert: { slug, name, kind, parents: parents.map((p) => loc.get(p)), sortOrder: LOCATIONS.findIndex((l) => l[0] === slug) } }, { upsert: true });
    counts.locations += r.upsertedCount;
    loc.set(slug, (await LocationModel.findOne({ slug }).select('_id').lean())!._id);
  }
  const courses = new Map<string, { _id: unknown; months: number }>();
  for (const [slug, name, level, category, months] of COURSES) {
    const r = await CourseModel.updateOne({ slug }, { $setOnInsert: { slug, name, level, category, typicalDurationMonths: months, sortOrder: COURSES.findIndex((c) => c[0] === slug) } }, { upsert: true });
    counts.courses += r.upsertedCount;
    const c = (await CourseModel.findOne({ slug }).lean())!;
    courses.set(slug, { _id: c._id, months: c.typicalDurationMonths ?? months });
  }
  for (const s of SAMPLES) {
    const r = await CollegeModel.updateOne(
      { slug: s.slug },
      {
        $setOnInsert: {
          slug: s.slug,
          name: s.name,
          type: s.type,
          status: 'published',
          isSample: true,
          featured: Boolean(s.featured),
          location: loc.get(s.city),
          about: 'This is a fictional sample college used to demonstrate the directory. It is not a real institution, and its courses and fees are illustrative only.',
          admissionProcess: 'Sample: apply online, submit documents, attend counselling, pay the admission fee to confirm the seat.',
          verificationSource: 'Sample data',
        },
      },
      { upsert: true },
    );
    counts.colleges += r.upsertedCount;
    const college = (await CollegeModel.findOne({ slug: s.slug }).lean())!;
    // Only fill in offerings and fees for colleges that are still sample records.
    if (!college.isSample) continue;
    for (const o of s.offers) {
      const course = courses.get(o.course)!;
      const months = o.months ?? course.months;
      const key = { college: college._id, course: course._id, specialization: o.specialization ?? '' };
      const or = await CollegeCourseModel.updateOne(
        key,
        { $setOnInsert: { ...key, durationMonths: months, minPercentage: o.minPct ?? null, entranceExams: o.exams ?? [], eligibilityText: o.minPct ? `Sample: at least ${o.minPct}% in the qualifying examination.` : 'Sample: pass in the qualifying examination.' } },
        { upsert: true },
      );
      counts.offerings += or.upsertedCount;
      const offering = (await CollegeCourseModel.findOne(key).lean())!;
      if (await CollegeFeeModel.exists({ collegeCourse: offering._id })) continue;
      const components: FeeComponent[] = [
        { key: 'tuition', amountMinor: R(o.tuition), frequency: 'per_year' },
        { key: 'registration', amountMinor: R(5000), frequency: 'one_time' },
        { key: 'admission', amountMinor: R(15000), frequency: 'one_time' },
        { key: 'examination', amountMinor: R(4000), frequency: 'per_semester' },
        ...(o.hostel ? [{ key: 'hostel' as const, amountMinor: R(o.hostel), frequency: 'per_year' as const }] : []),
      ];
      const consultancyServiceChargeMinor = R(10000);
      const b = calculateFee({ components, durationMonths: offering.durationMonths, consultancyServiceChargeMinor });
      await CollegeFeeModel.create({
        collegeCourse: offering._id,
        college: college._id,
        course: course._id,
        academicYear: SAMPLE_ACADEMIC_YEAR,
        intake: 'July',
        components,
        consultancyServiceChargeMinor,
        sourceRef: SAMPLE_SOURCE,
        notes: 'Sample data – illustrative only.',
        status: 'published',
        version: 1,
        durationMonths: offering.durationMonths,
        ...storedTotals(b),
        publishedAt: new Date(),
      });
      counts.fees += 1;
    }
    await refreshCollegeSummary(college._id);
  }
  counts.scholarships = await seedSampleScholarships(loc, courses);
  return counts;
}

// Fictional scholarships (one of each provider type), labelled and removable like the sample colleges.
// No real scheme, amount or criteria is implied; the government example links to example.org on purpose.
async function seedSampleScholarships(loc: Map<string, unknown>, courses: Map<string, { _id: unknown }>) {
  const year = new Date().getFullYear();
  const deadline = new Date(Date.UTC(year + 1, 6, 31));
  const college = async (slug: string) => (await CollegeModel.findOne({ slug, isSample: true }).select('_id').lean())?._id ?? null;
  const common = { status: 'published', isSample: true, academicYear: SAMPLE_ACADEMIC_YEAR, applicationDeadline: deadline, sourceRef: 'SAMPLE – illustrative only', lastVerifiedAt: null };
  const list = [
    {
      slug: 'sample-merit-scholarship-pune', name: 'Sample Merit Scholarship (Sample Institute of Technology, Pune)', providerType: 'college', college: await college('sample-institute-of-technology-pune'),
      description: 'A fictional merit scholarship used to demonstrate the system. Not a real offer.',
      benefit: { type: 'tuition_percent', value: 25, maxMinor: R(50000), description: '25% of tuition, up to ₹50,000 a year (sample)' },
      eligibility: { courses: [courses.get('btech-be')!._id], minPercentage: 85, maxFamilyIncomeMinor: null, states: [], categories: [], genders: [], notes: '' },
      documentsRequired: ['Class 12 marksheet'],
    },
    {
      slug: 'sample-need-based-grant-greater-noida', name: 'Sample Need-based Grant (Sample University, Greater Noida)', providerType: 'college', college: await college('sample-university-greater-noida'),
      description: 'A fictional need-based grant used to demonstrate the system. Not a real offer.',
      benefit: { type: 'fixed_amount', value: R(40000), maxMinor: null, description: '₹40,000 towards first-year fees (sample)' },
      eligibility: { courses: [], minPercentage: 60, maxFamilyIncomeMinor: R(600000), states: [], categories: [], genders: [], notes: '' },
      documentsRequired: ['Family income certificate', 'Class 12 marksheet'],
    },
    {
      slug: 'sample-edupath-service-charge-waiver', name: 'Sample Udaan Service Charge Waiver', providerType: 'consultancy', providerName: 'Udaan (sample)', college: null,
      description: 'A fictional consultancy offer used to demonstrate the system: half of the consultancy service charge waived.',
      benefit: { type: 'service_charge_percent', value: 50, maxMinor: null, description: '50% off the Udaan service charge (sample)' },
      eligibility: { courses: [], minPercentage: 75, maxFamilyIncomeMinor: null, states: [], categories: [], genders: [], notes: '' },
      documentsRequired: [],
    },
    {
      slug: 'sample-state-merit-scheme', name: 'Sample State Merit Scheme (illustrative)', providerType: 'government', providerName: 'Sample state department (fictional)', college: null,
      description: 'A fictional government-style scheme used to demonstrate eligibility rules. Not a real scheme; the link is a placeholder.',
      benefit: { type: 'fixed_amount', value: R(25000), maxMinor: null, description: '₹25,000 a year (sample)' },
      eligibility: { courses: [], minPercentage: 60, maxFamilyIncomeMinor: R(250000), states: [loc.get('tamil-nadu')], categories: ['sc', 'st', 'obc'], genders: [], notes: 'Sample criteria only.' },
      documentsRequired: ['Caste certificate', 'Income certificate', 'Domicile certificate'],
      officialUrl: 'https://example.org/sample-state-merit-scheme',
    },
  ];
  let added = 0;
  for (const sch of list) {
    const r = await ScholarshipModel.updateOne({ slug: sch.slug }, { $setOnInsert: { ...common, ...sch } }, { upsert: true });
    added += r.upsertedCount;
  }
  return added;
}
