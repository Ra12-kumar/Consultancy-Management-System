import { z } from 'zod';
import { COLLEGE_STATUSES, COLLEGE_TYPES } from '../models/College.js';
import { FEE_FREQUENCIES, FEE_KEYS } from '../models/CollegeFee.js';
import { COURSE_LEVELS } from '../models/Course.js';
import { LOCATION_KINDS } from '../models/Location.js';
import { emailSchema, objectIdSchema, pagination } from './common.js';

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens').min(2).max(80);
const text = (max: number) => z.string().trim().max(max);
const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https:\/\/[^\s]+$/i.test(v), 'Use a full https:// address');
// Money is sent and stored as integer paise (₹1 = 100).
export const money = z.number().int('Use whole paise').min(0).max(1_000_000_000_00);
const isoDate = z.coerce.date();
const sortOrder = z.number().int().min(0).max(10_000);

export const idParams = z.object({ id: objectIdSchema }).strict();
export const slugParams = z.object({ slug }).strict();

// ---- Public catalogue ----

export const listCollegesQuery = z
  .object({
    q: text(80).optional(),
    course: slug.optional(),
    location: slug.optional(),
    type: z.enum(COLLEGE_TYPES).optional(),
    // Paise; matches colleges with a published official total at or under this amount.
    maxBudget: z.coerce.number().int().min(0).max(1_000_000_000_00).optional(),
    // The student's percentage: offerings with no minimum or a minimum at or below it.
    percentage: z.coerce.number().min(0).max(100).optional(),
    // Colleges with at least one published college scholarship.
    scholarship: z.literal('yes').optional(),
    sort: z.enum(['featured', 'name', 'fee_low', 'fee_high', 'recently_verified']).default('featured'),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
  })
  .strict();
export type ListCollegesQuery = z.infer<typeof listCollegesQuery>;

export const compareQuery = z
  .object({
    colleges: z
      .string()
      .trim()
      .max(400)
      .transform((v) => [...new Set(v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))])
      .pipe(z.array(slug).min(2, 'Choose at least two colleges').max(4, 'Compare up to four colleges')),
    course: slug.optional(),
  })
  .strict();
export type CompareQuery = z.infer<typeof compareQuery>;

// ---- Admin: locations and courses ----

export const locationBody = z
  .object({
    name: text(80).min(2),
    slug,
    kind: z.enum(LOCATION_KINDS),
    parents: z.array(objectIdSchema).max(10).default([]),
    isActive: z.boolean().default(true),
    sortOrder: sortOrder.default(100),
  })
  .strict();
export const locationPatch = locationBody.omit({ slug: true }).partial().strict();

export const courseBody = z
  .object({
    name: text(80).min(2),
    slug,
    level: z.enum(COURSE_LEVELS),
    category: text(60).default(''),
    typicalDurationMonths: z.number().int().min(1).max(120).nullable().default(null),
    isActive: z.boolean().default(true),
    sortOrder: sortOrder.default(100),
  })
  .strict();
export const coursePatch = courseBody.omit({ slug: true }).partial().strict();

// ---- Admin: colleges and offerings ----

const accreditation = z
  .object({ body: text(60).min(2), grade: text(20).default(''), validUntil: isoDate.nullable().default(null), sourceUrl: httpsUrl.default('') })
  .strict();

// Derived fields (courseIds, locationIds, feeSummary, city/state) and isSample are never accepted.
export const collegeBody = z
  .object({
    name: text(160).min(2),
    slug,
    type: z.enum(COLLEGE_TYPES),
    location: objectIdSchema.nullable().default(null),
    address: text(300).default(''),
    website: httpsUrl.default(''),
    logoUrl: httpsUrl.default(''),
    coverUrl: httpsUrl.default(''),
    about: text(4000).default(''),
    accreditations: z.array(accreditation).max(10).default([]),
    approvals: z.array(text(60).min(2)).max(10).default([]),
    admissionProcess: text(4000).default(''),
    campusInfo: text(4000).default(''),
    placementInfo: text(4000).default(''),
    placementVerified: z.boolean().default(false),
    contact: z.object({ phone: text(30).default(''), email: z.union([z.literal(''), emailSchema]).default('') }).strict().default({}),
    featured: z.boolean().default(false),
    lastVerifiedAt: isoDate.nullable().default(null),
    verificationSource: text(500).default(''),
  })
  .strict();
export type CollegeInput = z.infer<typeof collegeBody>;
// PATCH: any subset. (zod .partial() skips defaults for absent fields, so they stay unchanged.)
export const collegePatch = collegeBody.partial().strict();

export const adminCollegesQuery = z
  .object({ q: text(80).optional(), status: z.enum(COLLEGE_STATUSES).optional(), sample: z.enum(['yes', 'no']).optional(), ...pagination })
  .strict();

export const offeringBody = z
  .object({
    course: objectIdSchema,
    specialization: text(120).default(''),
    durationMonths: z.number().int().min(1).max(120),
    seats: z.number().int().min(0).max(100_000).nullable().default(null),
    eligibilityText: text(1000).default(''),
    minPercentage: z.number().min(0).max(100).nullable().default(null),
    entranceExams: z.array(text(60).min(2)).max(10).default([]),
    applicationDeadline: isoDate.nullable().default(null),
    admissionProcess: text(2000).default(''),
    status: z.enum(['active', 'inactive']).default('active'),
  })
  .strict();
export type OfferingInput = z.infer<typeof offeringBody>;
export const offeringPatch = offeringBody.omit({ course: true }).partial().strict();

// ---- Admin: fees (pricing) ----

const academicYear = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}$/, 'Use the form 2026-27')
  .refine((v) => (Number(v.slice(0, 4)) + 1) % 100 === Number(v.slice(5)), 'The second year must follow the first (e.g. 2026-27)');

const feeComponents = z
  .array(z.object({ key: z.enum(FEE_KEYS), amountMinor: money, frequency: z.enum(FEE_FREQUENCIES) }).strict())
  .max(FEE_KEYS.length)
  .refine((c) => new Set(c.map((x) => x.key)).size === c.length, 'Each fee type can be listed once')
  .refine((c) => c.some((x) => x.key === 'tuition'), 'Include the tuition fee');

const discount = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('percent'), value: z.number().min(0).max(100), maxMinor: money.nullable().default(null), note: text(200).default('') }).strict(),
    z.object({ type: z.literal('fixed'), value: money, maxMinor: z.null().default(null), note: text(200).default('') }).strict(),
  ])
  .nullable()
  .default(null);

export const feeBody = z
  .object({
    academicYear,
    intake: text(40).default(''),
    components: feeComponents,
    consultancyServiceChargeMinor: money.default(0),
    discount,
    paymentSchedule: text(1000).default(''),
    notes: text(1000).default(''),
    effectiveFrom: isoDate.nullable().default(null),
    lastVerifiedAt: isoDate.nullable().default(null),
    sourceRef: text(500).default(''),
  })
  .strict();
export type FeeInputBody = z.infer<typeof feeBody>;

export const feePreviewBody = z
  .object({ durationMonths: z.number().int().min(1).max(120), components: feeComponents, consultancyServiceChargeMinor: money.default(0), discount })
  .strict();

// ---- Student shortlist and comparisons ----

export const shortlistBody = z.object({ collegeId: objectIdSchema, note: text(300).default('') }).strict();
export const collegeIdParams = z.object({ collegeId: objectIdSchema }).strict();
export const comparisonBody = z
  .object({
    name: text(80).min(1, 'Give the comparison a name'),
    colleges: z.array(objectIdSchema).min(2, 'Choose at least two colleges').max(4, 'Compare up to four colleges').refine((c) => new Set(c).size === c.length, 'Each college can be chosen once'),
    course: objectIdSchema.nullable().default(null),
  })
  .strict();
