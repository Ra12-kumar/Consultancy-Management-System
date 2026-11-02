import { z } from 'zod';
import { BENEFIT_TYPES, CATEGORIES, GENDERS, PROVIDER_TYPES, SCHOLARSHIP_APP_STATUSES, SCHOLARSHIP_STATUSES } from '../models/Scholarship.js';
import { objectIdSchema, pagination, patchOf } from './common.js';

const text = (max: number) => z.string().trim().max(max);
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens').min(2).max(80);
const httpsUrl = text(500).refine((v) => v === '' || /^https:\/\/\S+$/i.test(v), 'Use a full https:// address');
const money = z.number().int('Use whole paise').min(0).max(1_000_000_000_00);
const uniqueIds = (max: number) => z.array(objectIdSchema).max(max).refine((v) => new Set(v).size === v.length, 'Each item can be chosen once');

export const scholarshipSlugParams = z.object({ slug }).strict();
export const referenceParams = z.object({ reference: z.string().trim().toUpperCase().regex(/^SCH-\d{4}-\d{6}$/, 'Invalid reference') }).strict();

export const publicScholarshipsQuery = z
  .object({ q: text(80).optional(), provider: z.enum(PROVIDER_TYPES).optional(), college: slug.optional(), course: slug.optional(), state: slug.optional(), open: z.literal('yes').optional(), ...pagination })
  .strict();

// What a student declares for the eligibility check / application (never saved on their profile).
const declared = {
  familyIncomeMinor: money.nullable().optional(),
  category: z.enum(CATEGORIES).nullable().optional(),
  gender: z.enum(GENDERS).nullable().optional(),
  course: objectIdSchema.nullable().optional(),
};
export const eligibilityQuery = z
  .object({
    familyIncomeMinor: z.coerce.number().int().min(0).max(1_000_000_000_00).optional(),
    category: z.enum(CATEGORIES).optional(),
    gender: z.enum(GENDERS).optional(),
    course: objectIdSchema.optional(),
  })
  .strict();
export const applyBody = z.object({ scholarship: objectIdSchema, enquiry: objectIdSchema.nullable().optional(), statement: text(2000).default(''), ...declared }).strict();

// ---- Admin ----

const benefit = z
  .object({ type: z.enum(BENEFIT_TYPES), value: z.number().min(0).nullable().default(null), maxMinor: money.nullable().default(null), description: text(300).default('') })
  .strict()
  .superRefine((b, ctx) => {
    if ((b.type === 'tuition_percent' || b.type === 'service_charge_percent') && b.value != null && b.value > 100) ctx.addIssue({ code: 'custom', path: ['value'], message: 'A percentage is at most 100' });
    if (b.type === 'fixed_amount' && b.value != null && !Number.isInteger(b.value)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Use whole paise' });
  });
const eligibility = z
  .object({
    courses: uniqueIds(20).default([]),
    minPercentage: z.number().min(0).max(100).nullable().default(null),
    maxFamilyIncomeMinor: money.nullable().default(null),
    states: uniqueIds(40).default([]),
    categories: z.array(z.enum(CATEGORIES)).max(CATEGORIES.length).default([]),
    genders: z.array(z.enum(GENDERS)).max(GENDERS.length).default([]),
    notes: text(1000).default(''),
  })
  .strict();

export const scholarshipBody = z
  .object({
    name: text(160).min(3),
    slug,
    providerType: z.enum(PROVIDER_TYPES),
    providerName: text(160).default(''),
    college: objectIdSchema.nullable().default(null),
    description: text(4000).default(''),
    benefit,
    eligibility: eligibility.prefault({}),
    documentsRequired: z.array(text(120).min(2)).max(15).default([]),
    academicYear: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}$/, 'Use the form 2026-27')]).default(''),
    applicationDeadline: z.coerce.date().nullable().default(null),
    officialUrl: httpsUrl.default(''),
    sourceRef: text(500).default(''),
    lastVerifiedAt: z.coerce.date().nullable().default(null),
  })
  .strict();
export const scholarshipPatch = patchOf(scholarshipBody).strict();
export const adminScholarshipsQuery = z.object({ q: text(80).optional(), status: z.enum(SCHOLARSHIP_STATUSES).optional(), ...pagination }).strict();
export const adminApplicationsQuery = z.object({ q: text(80).optional(), status: z.enum(SCHOLARSHIP_APP_STATUSES).optional(), scholarship: objectIdSchema.optional(), ...pagination }).strict();
export const reviewBody = z.object({ status: z.enum(['under_review', 'documents_pending']), note: text(1000).default(''), internalNote: text(2000).optional() }).strict();
export const decisionBody = z
  .object({ decision: z.enum(['approved', 'rejected']), note: text(1000).min(3, 'Write a short note for the student'), awardMinor: money.nullable().default(null) })
  .strict();
