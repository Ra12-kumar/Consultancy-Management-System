import { z } from 'zod';
import { emailSchema, mobileSchema, nameSchema, passwordSchema, tokenSchema } from './common.js';

// .strict(): unknown fields (e.g. "role") are refused with 422, so nobody can register as an admin.
export const registerBody = z
  .object({ name: nameSchema, email: emailSchema, mobile: mobileSchema, password: passwordSchema })
  .strict()
  .refine((b) => b.password.toLowerCase() !== b.email, { path: ['password'], message: 'Your password must not be your email address' });

export const loginBody = z.object({ email: emailSchema, password: z.string().min(1, 'Enter your password').max(128) }).strict();
export const emailOnlyBody = z.object({ email: emailSchema }).strict();
export const tokenBody = z.object({ token: tokenSchema }).strict();
export const newPasswordBody = z.object({ token: tokenSchema, password: passwordSchema }).strict();
export const changePasswordBody = z
  .object({ currentPassword: z.string().min(1, 'Enter your current password').max(128), newPassword: passwordSchema })
  .strict()
  .refine((b) => b.currentPassword !== b.newPassword, { path: ['newPassword'], message: 'Choose a password different from the current one' });
