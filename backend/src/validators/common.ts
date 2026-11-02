import { parsePhoneNumberFromString } from 'libphonenumber-js';
import mongoose from 'mongoose';
import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().max(254).email('Enter a valid email address');

export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Enter your full name')
  .max(80)
  .regex(/^[\p{L}\p{M} .'-]+$/u, 'Use letters, spaces, dots, apostrophes or hyphens only');

// Indian numbers may be entered without +91; stored in E.164 (+919876543210).
export const mobileSchema = z
  .string()
  .trim()
  .max(20)
  .transform((value, ctx) => {
    const parsed = parsePhoneNumberFromString(value, 'IN');
    if (!parsed?.isValid()) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid mobile number' });
      return z.NEVER;
    }
    return parsed.number;
  });

export const tokenSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{32,100}$/, 'This link is not valid');

export const objectIdSchema = z.string().refine((v) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(v), 'Invalid id');

export const pagination = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
};

// PATCH bodies: every field optional and WITHOUT its default. (Zod 4 fills an absent optional field with its
// default, and `.partial()` keeps defaults, so a partial update would overwrite stored values with defaults.)
export function patchOf<S extends z.ZodRawShape>(schema: z.ZodObject<S>) {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    let f = field as z.ZodType;
    while (f instanceof z.ZodDefault || f instanceof z.ZodPrefault) f = f.unwrap() as z.ZodType;
    shape[key] = f.optional();
  }
  return z.object(shape) as unknown as z.ZodObject<{ [K in keyof S]: z.ZodOptional<S[K]> }>;
}
