import { z } from 'zod';
import { COURSE_MODES } from '../models/CollegeCourse.js';
import { QUALIFICATIONS } from '../models/StudentProfile.js';
import { BRANCHES, type Branch } from '../services/collegeExplorer.service.js';
import { CATEGORIES, COLLEGE_STATUSES, COLLEGE_TYPES, OWNERSHIP } from '../models/College.js';
import { FEE_FREQUENCIES, FEE_KEYS } from '../models/CollegeFee.js';
import { COURSE_LEVELS } from '../models/Course.js';
import { LOCATION_KINDS } from '../models/Location.js';
import { safeExternalUrl } from '../utils/safeUrl.js';
import { emailSchema, objectIdSchema, pagination, patchOf } from './common.js';

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens').min(2).max(80);
const text = (max: number) => z.string().trim().max(max);
const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https:\/\/[^\s]+$/i.test(v), 'Use a full https:// address');
// Official websites: absolute http(s) addresses only (some colleges still have no https site).
const webUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || safeExternalUrl(v) !== null, 'Use a full http:// or https:// web address');
// Official social pages: https only, and the address must belong to that network.
const SOCIAL_HOSTS = { instagram: ['instagram.com'], facebook: ['facebook.com', 'fb.com'], youtube: ['youtube.com', 'youtu.be'], linkedin: ['linkedin.com'], x: ['x.com', 'twitter.com'] } as const;
export const socialUrl = (network: keyof typeof SOCIAL_HOSTS) =>
  z
    .string()
    .trim()
    .max(300)
    .refine((v) => {
      if (v === '') return true;
      try {
        const u = new URL(v);
        const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
        return u.protocol === 'https:' && SOCIAL_HOSTS[network].some((h) => host === h);
      } catch {
        return false;
      }
    }, `Use the full https:// address of the official ${network === 'x' ? 'X (Twitter)' : network} page`);
export const socialLinks = z
  .object({ instagram: socialUrl('instagram').default(''), facebook: socialUrl('facebook').default(''), youtube: socialUrl('youtube').default(''), linkedin: socialUrl('linkedin').default(''), x: socialUrl('x').default('') })
  .strict();
// Money is sent and stored as integer paise (₹1 = 100).
export const money = z.number().int('Use whole paise').min(0).max(1_000_000_000_00);
const isoDate = z.coerce.date();
const sortOrder = z.number().int().min(0).max(10_000);

export const idParams = z.object({ id: objectIdSchema }).strict();
export const slugParams = z.object({ slug }).strict();

// ---- Public catalogue ----

const moneyParam = z.coerce.number().int().min(0).max(1_000_000_000_00).optional();
export const listCollegesQuery = z
  .object({
    // College name (or alias, AISHE code, place or course name).
    q: text(80).optional(),
    course: slug.optional(),
    // Any location slug (region, state, district or city); state and district can also be given separately.
    location: slug.optional(),
    state: slug.optional(),
    district: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,80}$/, 'Invalid district').optional(),
    type: z.enum(COLLEGE_TYPES).optional(),
    ownership: z.enum(OWNERSHIP).optional(),
    category: z.enum(CATEGORIES).optional(),
    // Approval or accreditation body, e.g. AICTE, UGC, NAAC, NBA.
    approval: z.string().trim().toUpperCase().regex(/^[A-Z]{2,10}$/, 'Use the abbreviation, e.g. AICTE').optional(),
    // Colleges with at least one published college scholarship.
    scholarship: z.literal('yes').optional(),
    hostel: z.literal('yes').optional(),
    // Colleges an admin has marked as featured.
    featured: z.literal('yes').optional(),
    intake: text(40).optional(),
    // Budget in paise on an annual or whole-course basis. Only verified, comparable fees match, unless
    // includeUnverified=yes, which also lists colleges without such a fee (shown as "Fee not verified").
    feeBasis: z.enum(['annual', 'total']).default('total'),
    minBudget: moneyParam,
    maxBudget: moneyParam,
    // Hostel per year; overall = official after discount + optional fees + service charge, whole course.
    maxHostel: moneyParam,
    maxOverall: moneyParam,
    includeUnverified: z.literal('yes').optional(),
    // The student's percentage: offerings with no minimum or a minimum at or below it.
    percentage: z.coerce.number().min(0).max(100).optional(),
    sort: z.enum(['featured', 'name', 'fee_low', 'fee_high', 'recently_verified', 'recently_updated']).default('featured'),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
  })
  .strict()
  .refine((v) => v.minBudget == null || v.maxBudget == null || v.minBudget <= v.maxBudget, { message: 'The minimum budget is above the maximum', path: ['minBudget'] });
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
export const locationPatch = patchOf(locationBody.omit({ slug: true })).strict();

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
export const coursePatch = patchOf(courseBody.omit({ slug: true })).strict();

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
    website: webUrl.default(''),
    logoUrl: httpsUrl.default(''),
    coverUrl: httpsUrl.default(''),
    about: text(4000).default(''),
    accreditations: z.array(accreditation).max(10).default([]),
    approvals: z.array(text(60).min(2)).max(10).default([]),
    admissionProcess: text(4000).default(''),
    campusInfo: text(4000).default(''),
    placementInfo: text(4000).default(''),
    placementVerified: z.boolean().default(false),
    contact: z.object({ phone: text(30).default(''), email: z.union([z.literal(''), emailSchema]).default('') }).strict().prefault({}),
    featured: z.boolean().default(false),
    lastVerifiedAt: isoDate.nullable().default(null),
    verificationSource: text(500).default(''),
    // Directory identity. Fields an import also supplies become locked against the import once an admin edits them.
    aisheCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[CUS]-\d{1,7}$/, 'Use the AISHE code, e.g. C-12345')
      .nullable()
      .default(null),
    ownership: z.enum(OWNERSHIP).nullable().default(null),
    category: z.enum(CATEGORIES).nullable().default(null),
    subtype: text(80).default(''),
    district: text(80).default(''),
    postalCode: z.string().trim().regex(/^(\d{6})?$/, 'Use a 6-digit PIN code').default(''),
    yearEstablished: z.number().int().min(1800).max(2100).nullable().default(null),
    affiliatedUniversity: z.object({ name: text(160).default(''), type: text(80).default('') }).strict().prefault({}),
    aliases: z.array(text(160).min(2)).max(10).default([]),
    hostelAvailable: z.boolean().nullable().default(null),
    // Admission details (from the college's official sources).
    applicationUrl: webUrl.default(''),
    eligibility: text(2000).default(''),
    entranceExams: z.array(text(60).min(2)).max(10).default([]),
    facilities: z.array(text(60).min(2)).max(20).default([]),
    highlights: z.array(text(160).min(3)).max(10).default([]),
    academicSession: z.string().trim().regex(/^(\d{4}(-\d{2,4})?)?$/, 'Use a session like 2026-27').default(''),
    admissionDeadline: isoDate.nullable().default(null),
    social: socialLinks.default({ instagram: '', facebook: '', youtube: '', linkedin: '', x: '' }),
    admissionInfo: text(4000).default(''),
  })
  .strict();
export type CollegeInput = z.infer<typeof collegeBody>;
// PATCH: any subset; absent fields stay unchanged (patchOf drops the defaults).
export const collegePatch = patchOf(collegeBody).strict();

// Gallery: new order (every image id once), the primary image and captions.
export const collegeImagesPatch = z
  .object({
    order: z.array(objectIdSchema).max(12).optional(),
    primary: objectIdSchema.optional(),
    alts: z.record(objectIdSchema, text(160)).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export const collegeImageBody = z.object({ alt: text(160).default('') }).strict();
export const collegeImageParams = z.object({ id: objectIdSchema, imageId: objectIdSchema }).strict();
export const imageFileParams = z.object({ fileId: objectIdSchema }).strict();
// Public course browser (active offerings of published colleges).
const browseText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
export const offeringBrowseQuery = z
  .object({
    q: browseText(80),
    level: z.enum(COURSE_LEVELS).optional(),
    course: slug.optional(),
    state: browseText(80),
    city: browseText(80),
    maxFee: z.coerce.number().int().min(0).max(100_000_000).optional(),
    qualification: z.enum(QUALIFICATIONS).optional(),
    mode: z.enum(COURSE_MODES).optional(),
    sort: z.enum(['deadline', 'fee', 'name']).default('name'),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(6).max(48).default(12),
  })
  .strict();
// The featured colleges, in display order (replaces the current list).
export const featuredOrderBody = z
  .object({ ids: z.array(objectIdSchema).max(24).refine((v) => new Set(v).size === v.length, 'Each college can appear once') })
  .strict();

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
    description: text(2000).default(''),
    mode: z.enum(COURSE_MODES).default('offline'),
    minQualification: z.enum(QUALIFICATIONS).nullable().default(null),
  })
  .strict();
export type OfferingInput = z.infer<typeof offeringBody>;
export const offeringPatch = patchOf(offeringBody.omit({ course: true })).strict();

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

// ---- Directory: districts and admin data management ----

export const districtsQuery = z.object({ state: slug }).strict();

// Multipart fields arrive as strings.
export const collegeImportBody = z
  .object({
    importer: z.enum(['aishe-colleges', 'aishe-universities', 'aishe-standalone']),
    // The date the source published or refreshed the dataset, if known.
    sourceDataDate: z.union([z.literal(''), isoDate]).optional().transform((v) => (v instanceof Date ? v : null)),
    // A full snapshot marks records missing from it as stale; a partial file never does.
    fullSnapshot: z.enum(['yes', 'no']).default('no').transform((v) => v === 'yes'),
  })
  .strict();

export const reviewsQuery = z
  .object({ kind: z.enum(['possible_duplicate', 'field_conflict']).optional(), status: z.enum(['open', 'resolved']).default('open'), ...pagination })
  .strict();
export const resolveReviewBody = z
  .object({ action: z.enum(['not_duplicate', 'archive_new', 'archive_existing', 'keep_current', 'accept_incoming']), note: text(500).default('') })
  .strict();
export const staleQuery = z.object({ reason: z.enum(['not_in_source', 'verification_due']).optional(), ...pagination }).strict();
export const importJobsQuery = z.object({ ...pagination }).strict();

// ---- External college search (CollegeDB): name only, as the provider supports ----
export const externalSearchQuery = z
  .object({
    q: z
      .string()
      .transform((v) => v.replace(/\s+/g, ' ').trim())
      .pipe(z.string().min(2, 'Type at least 2 letters').max(80)),
  })
  .strict();
// ---- College finder (Wikidata list, searched in memory) ----
const finderText = (max: number) => z.string().transform((v) => v.replace(/\s+/g, ' ').trim()).pipe(z.string().max(max)).optional();
export const explorerQuery = z
  .object({
    q: finderText(80),
    state: finderText(80),
    city: finderText(80),
    branch: z.enum(Object.keys(BRANCHES) as [Branch, ...Branch[]]).optional(),
    course: slug.optional(),
    // Optional: "name" lists results A–Z instead of best match first.
    order: z.enum(['relevance', 'name']).optional(),
    page: z.coerce.number().int().min(1).max(500).default(1),
    limit: z.coerce.number().int().min(6).max(48).default(24),
  })
  .strict();
export const externalIdParams = z.object({ id: z.string().uuid('Invalid college id') }).strict();
