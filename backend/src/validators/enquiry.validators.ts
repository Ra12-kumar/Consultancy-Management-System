import { z } from 'zod';
import { APPLICATION_STATUSES, EVIDENCE_TYPES } from '../models/Admission.js';
import { APPOINTMENT_MODES, APPOINTMENT_STATUSES } from '../models/Appointment.js';
import { CALLBACK_KINDS, CALLBACK_TIMES, DOCUMENT_STATUSES, ENQUIRY_STATUSES, INSTITUTION_TYPES, LEAD_SOURCES } from '../models/Enquiry.js';
import { objectIdSchema, pagination } from './common.js';

const text = (max: number) => z.string().trim().max(max);
const unique = <T extends z.ZodTypeAny>(item: T, max: number, label: string) =>
  z
    .array(item)
    .max(max, `Choose up to ${max} ${label}`)
    .refine((v) => new Set(v).size === v.length, `Each ${label.replace(/s$/, '')} can be chosen once`);
const thisYear = () => new Date().getFullYear();

export const referenceParams = z.object({ reference: z.string().trim().toUpperCase().regex(/^ENQ-\d{4}-\d{6}$/, 'Invalid reference') }).strict();
export const idParams = z.object({ id: objectIdSchema }).strict();

// What a student may send. Status, reference, snapshots and estimates are decided by the server.
export const createEnquiryBody = z
  .object({
    idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{8,64}$/, 'Invalid request key'),
    courses: unique(objectIdSchema, 3, 'courses').pipe(z.array(z.string()).min(1, 'Choose at least one course')),
    specialization: text(120).default(''),
    locations: unique(objectIdSchema, 5, 'locations').default([]),
    colleges: unique(objectIdSchema, 5, 'colleges').default([]),
    institutionTypes: unique(z.enum(INSTITUTION_TYPES), INSTITUTION_TYPES.length, 'types').default([]),
    // Paise.
    budgetMinor: z.number().int().min(0).max(1_000_000_000_00).nullable().default(null),
    hostel: z.boolean().default(false),
    scholarship: z.boolean().default(false),
    admissionYear: z
      .number()
      .int()
      .refine((y) => y >= thisYear() && y <= thisYear() + 3, 'Choose this year or one of the next three'),
    intake: text(40).default(''),
    entranceExamNotes: text(500).default(''),
    counsellingRequest: text(2000).default(''),
    // Where the student came from, and when they prefer a call.
    source: z.enum(LEAD_SOURCES).default('direct'),
    campaign: z.string().trim().regex(/^[A-Za-z0-9 _.-]{0,60}$/, 'Invalid campaign name').default(''),
    callbackTime: z.enum(CALLBACK_TIMES).default('any'),
  })
  .strict();
export type CreateEnquiryInput = z.infer<typeof createEnquiryBody>;

export const messageBody = z.object({ body: text(2000).min(1, 'Write a message') }).strict();
export const reasonBody = z.object({ reason: text(500).min(3, 'Give a short reason') }).strict();
export const noteBody = z.object({ note: text(500).default('') }).strict();

// A student asks for a phone call or a counselling session.
export const callbackRequestBody = z
  .object({
    kind: z.enum(CALLBACK_KINDS),
    preferredDate: z.coerce
      .date()
      .refine((d) => d.getTime() >= Date.now() - 86_400_000 && d.getTime() <= Date.now() + 60 * 86_400_000, 'Choose a date within the next 60 days')
      .nullable()
      .default(null),
    slot: z.enum(CALLBACK_TIMES).default('any'),
    mode: z.enum(['phone', 'video', 'office']).default('phone'),
    note: text(500).default(''),
  })
  .strict();

// ---- Admin ----

const isoDate = z.coerce.date();

export const adminEnquiriesQuery = z
  .object({
    q: text(80).optional(),
    status: z.enum(ENQUIRY_STATUSES).optional(),
    open: z.literal('yes').optional(),
    assigned: z.union([z.literal('me'), z.literal('unassigned'), objectIdSchema]).optional(),
    course: objectIdSchema.optional(),
    college: objectIdSchema.optional(),
    state: text(80).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    followUpDue: z.literal('yes').optional(),
    // Optional: enquiries whose follow-up falls in this range.
    followUpFrom: isoDate.optional(),
    followUpTo: isoDate.optional(),
    // Quick views: new enquiries, today's calls, overdue follow-ups, confirmed admissions, callback requests.
    quick: z.enum(['new', 'today', 'overdue', 'admitted', 'callback']).optional(),
    source: z.enum(LEAD_SOURCES).optional(),
    sort: z.enum(['newest', 'oldest', 'activity', 'follow_up']).default('newest'),
    ...pagination,
  })
  .strict();
// The same filters for a CSV export (no paging; capped on the server).
export const exportEnquiriesQuery = adminEnquiriesQuery.omit({ page: true, limit: true });

export const enquiryPatch = z
  .object({ assignedTo: objectIdSchema.nullable().optional(), followUpAt: isoDate.nullable().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');

export const statusBody = z
  .object({ fromStatus: z.enum(ENQUIRY_STATUSES), toStatus: z.enum(ENQUIRY_STATUSES), reason: text(1000).default(''), studentMessage: text(1000).default('') })
  .strict();

export const internalNoteBody = z.object({ body: text(2000).min(1, 'Write a note') }).strict();

export const contactAttemptBody = z
  .object({
    channel: z.enum(['phone', 'email', 'whatsapp', 'sms', 'in_person']),
    outcome: z.enum(['reached', 'no_answer', 'left_message', 'wrong_number', 'other']),
    note: text(1000).default(''),
  })
  .strict();

export const documentsBody = z
  .object({ names: unique(text(120).min(2), 10, 'documents').pipe(z.array(z.string()).min(1, 'Name at least one document')), note: text(300).default('') })
  .strict();
export const documentParams = z.object({ id: objectIdSchema, docId: objectIdSchema }).strict();
export const documentPatch = z
  .object({ status: z.enum(DOCUMENT_STATUSES).optional(), note: text(300).optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');

export const applicationBody = z
  .object({ college: objectIdSchema, course: objectIdSchema, applicationNumber: text(60).default(''), status: z.enum(['planned', 'submitted']).default('planned'), internalNote: text(1000).default('') })
  .strict();
export const applicationPatch = z
  .object({
    applicationNumber: text(60).optional(),
    // `admitted` only through confirm-admission.
    status: z.enum(APPLICATION_STATUSES.filter((s) => s !== 'admitted') as [string, ...string[]]).optional(),
    internalNote: text(1000).optional(),
  })
  .strict();
export const confirmAdmissionBody = z
  .object({ evidenceType: z.enum(EVIDENCE_TYPES), evidenceReference: text(200).min(3, 'Describe the evidence (e.g. offer letter number)'), studentMessage: text(1000).default('') })
  .strict();
export const applicationsQuery = z.object({ status: z.enum(APPLICATION_STATUSES).optional(), ...pagination }).strict();

// Meeting details: free text, but a link must be https.
const meetingDetails = text(500)
  .default('')
  .refine((v) => !/http:\/\//i.test(v), 'Use an https:// link');
export const appointmentBody = z
  .object({
    startsAt: z.string().datetime({ offset: true }).pipe(z.coerce.date()),
    durationMinutes: z.number().int().min(15).max(180).default(30),
    mode: z.enum(APPOINTMENT_MODES),
    meetingDetails,
    agenda: text(1000).default(''),
    counsellor: objectIdSchema.optional(),
  })
  .strict();
export const appointmentPatch = z
  .object({
    startsAt: z.string().datetime({ offset: true }).pipe(z.coerce.date()).optional(),
    durationMinutes: z.number().int().min(15).max(180).optional(),
    mode: z.enum(APPOINTMENT_MODES).optional(),
    meetingDetails: text(500)
      .refine((v) => !/http:\/\//i.test(v), 'Use an https:// link')
      .optional(),
    agenda: text(1000).optional(),
    counsellor: objectIdSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export const appointmentsQuery = z
  .object({ from: isoDate.optional(), to: isoDate.optional(), counsellor: z.union([z.literal('me'), objectIdSchema]).optional(), status: z.enum(APPOINTMENT_STATUSES).optional(), ...pagination })
  .strict();
export const updatesQuery = z.object(pagination).strict();
