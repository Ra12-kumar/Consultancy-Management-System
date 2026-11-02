import { z } from 'zod';
import { QUALIFICATIONS } from '../models/StudentProfile.js';
import { emailSchema, mobileSchema, nameSchema, passwordSchema, tokenSchema } from './common.js';

const optionalText = (max: number) => z.string().trim().max(max).optional();

// .strict(): unknown fields (e.g. "role") are refused with 422, so nobody can register as an admin.
export const registerBody = z
  .object({
    name: nameSchema,
    email: emailSchema,
    mobile: mobileSchema,
    password: passwordSchema,
    // Optional academic details (they start the student's profile).
    qualification: z.enum(QUALIFICATIONS).optional(),
    preferredCourse: optionalText(120),
    preferredLocation: optionalText(120),
    // Staff sign-up: the role is taken from the invitation code; accountType must match it.
    accountType: z.enum(['student', 'counsellor', 'admin']).optional(),
    inviteCode: z.string().trim().min(8).max(40).regex(/^[A-Za-z0-9 -]+$/, 'Enter the invitation code exactly as you received it').optional(),
  })
  .strict()
  .refine((b) => b.password.toLowerCase() !== b.email, { path: ['password'], message: 'Your password must not be your email address' });

export const loginBody = z.object({ email: emailSchema, password: z.string().min(1, 'Enter your password').max(128) }).strict();
export const emailOnlyBody = z.object({ email: emailSchema }).strict();
export const tokenBody = z.object({ token: tokenSchema }).strict();
export const otpBody = z.object({ email: emailSchema, code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from the email') }).strict();
export const newPasswordBody = z.object({ token: tokenSchema, password: passwordSchema }).strict();
export const changePasswordBody = z
  .object({ currentPassword: z.string().min(1, 'Enter your current password').max(128), newPassword: passwordSchema })
  .strict()
  .refine((b) => b.currentPassword !== b.newPassword, { path: ['newPassword'], message: 'Choose a password different from the current one' });
