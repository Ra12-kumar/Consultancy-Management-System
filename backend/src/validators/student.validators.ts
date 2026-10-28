import { z } from 'zod';
import { CONTACT_METHODS, QUALIFICATIONS, SCORE_TYPES } from '../models/StudentProfile.js';
import { mobileSchema, nameSchema } from './common.js';

const text = (max: number) => z.string().trim().max(max).default('');
const year = z.number().int().min(1990).max(2100);

export const updateMeBody = z.object({ name: nameSchema.optional(), mobile: mobileSchema.optional() }).strict().refine((b) => Object.keys(b).length > 0, 'Nothing to update');

const score = z
  .object({ type: z.enum(SCORE_TYPES), value: z.number().min(0), max: z.number().positive().nullable().default(null) })
  .strict()
  .superRefine((s, ctx) => {
    if (s.type === 'percentage' && s.value > 100) ctx.addIssue({ code: 'custom', path: ['value'], message: 'A percentage cannot be more than 100' });
    if (s.type === 'cgpa') {
      if (!s.max || ![4, 5, 10].includes(s.max)) ctx.addIssue({ code: 'custom', path: ['max'], message: 'Choose the CGPA scale (4, 5 or 10)' });
      else if (s.value > s.max) ctx.addIssue({ code: 'custom', path: ['value'], message: `CGPA cannot be more than ${s.max}` });
    }
    if (s.type === 'marks') {
      if (!s.max) ctx.addIssue({ code: 'custom', path: ['max'], message: 'Enter the maximum marks' });
      else if (s.value > s.max) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Marks cannot be more than the maximum' });
    }
  });

// The whole profile is sent each time (no partial nested writes); unknown fields are refused.
export const profileBody = z
  .object({
    personal: z
      .object({
        city: text(80),
        state: text(80),
        guardianName: text(80),
        guardianPhone: z.union([z.literal(''), mobileSchema]).default(''),
        preferredContact: z.enum(CONTACT_METHODS).default('email'),
      })
      .strict(),
    academic: z
      .object({
        highestQualification: z.enum(QUALIFICATIONS).nullable().default(null),
        course: text(120),
        institution: text(160),
        boardOrUniversity: text(160),
        passingYear: year.nullable().default(null),
        score: score.nullable().default(null),
        entranceExams: z.array(z.object({ name: z.string().trim().min(2).max(60), score: text(30), year: year.nullable().default(null) }).strict()).max(5).default([]),
      })
      .strict(),
  })
  .strict();
export type ProfileInput = z.infer<typeof profileBody>;
