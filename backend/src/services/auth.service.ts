import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { StudentProfileModel, type QUALIFICATIONS } from '../models/StudentProfile.js';
import { UserModel, toPublicUser } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { assertEmailDomainAcceptsMail } from '../utils/emailDomain.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../utils/password.js';
import { audit, actorFrom, SYSTEM_ACTOR } from './audit.service.js';
import { issueChallenge } from './mfa.service.js';
import { enqueueEmail } from './email.service.js';
import { createSession, endAllSessions } from './session.service.js';
import { consumeOtp, issueOtp } from './otp.service.js';
import { consumeToken, issueToken } from './token.service.js';
import { checkInviteCode, redeemInviteCode, releaseInviteCode } from './inviteCode.service.js';

const MAX_FAILED_LOGINS = 10;
const LOCK_MS = 15 * 60_000;
const link = (path: string, token?: string) => `${env.FRONTEND_URL.replace(/\/+$/, '')}${path}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
const badLogin = () => new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');

const invalidCode = () => new ApiError(400, 'INVALID_CODE', 'This code is incorrect or has expired. Check the latest email from us or request a new code.');

// Emails a 6-digit verification code (unless one was sent less than a minute ago or too many this hour).
export async function sendVerification(user: { _id: unknown; name: string; email: string }, template: 'welcome_verify' | 'verify_email') {
  const code = await issueOtp(String(user._id), 'verify_email');
  if (!code) return false;
  const page = `${link('/verify-email')}?email=${encodeURIComponent(user.email)}`;
  await enqueueEmail({ to: user.email, template, params: { name: user.name }, secretParams: { code, link: page }, dedupeKey: `verify-otp:${String(user._id)}:${Date.now()}`, related: { type: 'user', id: String(user._id) } });
  return true;
}

type Qualification = (typeof QUALIFICATIONS)[number];
type Registration = { name: string; email: string; mobile: string; password: string; qualification?: Qualification; preferredCourse?: string; preferredLocation?: string; accountType?: 'student' | 'counsellor' | 'admin'; inviteCode?: string };

// Public registration ALWAYS creates a student. An email that already has an account gets the same answer
// (no account enumeration) and its owner is told by email instead.
export async function register(input: Registration, req: Request) {
  await assertEmailDomainAcceptsMail(input.email);
  if (input.accountType && input.accountType !== 'student') return registerStaff({ ...input, accountType: input.accountType }, req);
  const existing = await UserModel.findOne({ email: input.email }).lean();
  if (existing) {
    await enqueueEmail({ to: existing.email, template: 'existing_account', params: { name: existing.name }, secretParams: { link: link('/login') }, dedupeKey: `existing:${String(existing._id)}:${new Date().toISOString().slice(0, 13)}` });
    return;
  }
  let user;
  try {
    user = await UserModel.create({ name: input.name, email: input.email, mobile: input.mobile, passwordHash: await hashPassword(input.password), role: 'student' });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return; // registered a moment ago by a parallel request
    throw err;
  }
  // Optional academic details from the sign-up form start the student's profile.
  if (input.qualification || input.preferredCourse || input.preferredLocation) {
    await StudentProfileModel.create({
      user: user._id,
      academic: { highestQualification: input.qualification ?? null },
      preferences: { course: input.preferredCourse ?? '', location: input.preferredLocation ?? '' },
    });
  }
  await sendVerification(user, 'welcome_verify');
  for (const to of env.ADMIN_NOTIFY_EMAILS) {
    await enqueueEmail({ to, template: 'admin_new_student', params: { name: user.name }, secretParams: { link: link('/admin/students') }, dedupeKey: `admin-new-student:${String(user._id)}:${to}` });
  }
  await audit({ user: String(user._id), role: 'student', label: user.email }, 'auth.register', { type: 'user', id: String(user._id) }, req);
}

// Staff sign-up (Counsellor or Admin): only with a valid single-use invitation code. The role and permissions
// come from the code, never from the request; the email must still be verified with the emailed code.
async function registerStaff(input: Registration & { accountType: 'counsellor' | 'admin' }, req: Request) {
  if (!input.inviteCode) throw new ApiError(403, 'INVITE_REQUIRED', 'An invitation code from an administrator is needed to register as a counsellor or admin.');
  const invite = await checkInviteCode(input.inviteCode, input.accountType, input.email);
  const existing = await UserModel.findOne({ email: input.email }).lean();
  if (existing) {
    // Same answer as for students (no account enumeration); the code is not used up.
    await enqueueEmail({ to: existing.email, template: 'existing_account', params: { name: existing.name }, secretParams: { link: link('/login') }, dedupeKey: `existing:${String(existing._id)}:${new Date().toISOString().slice(0, 13)}` });
    return;
  }
  const id = new mongoose.Types.ObjectId();
  await redeemInviteCode(invite._id, id);
  let user;
  try {
    user = await UserModel.create({ _id: id, name: input.name, email: input.email, mobile: input.mobile, passwordHash: await hashPassword(input.password), role: invite.role, permissions: invite.role === 'admin' ? invite.permissions : [] });
  } catch (err) {
    await releaseInviteCode(invite._id, id);
    if ((err as { code?: number }).code === 11000) return;
    throw err;
  }
  await sendVerification(user, 'welcome_verify');
  await audit({ user: String(user._id), role: user.role, label: user.email }, 'auth.register_staff', { type: 'user', id: String(user._id) }, req, { invite: String(invite._id), role: user.role });
}

export async function login({ email, password }: { email: string; password: string }, req: Request, res: Response) {
  const user = await UserModel.findOne({ email }).select('+passwordHash +failedLogins +lockedUntil').lean();
  if (!user) {
    await burnPasswordCheck(password);
    throw badLogin();
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await burnPasswordCheck(password);
    throw new ApiError(429, 'ACCOUNT_LOCKED', 'Too many failed sign-ins. Please wait 15 minutes or reset your password.');
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok || user.status !== 'active') {
    if (!ok) {
      const failed = (user.failedLogins ?? 0) + 1;
      await UserModel.updateOne({ _id: user._id }, { $set: { failedLogins: failed >= MAX_FAILED_LOGINS ? 0 : failed, ...(failed >= MAX_FAILED_LOGINS && { lockedUntil: new Date(Date.now() + LOCK_MS) }) } });
    }
    throw badLogin();
  }
  // Nobody signs in before verifying their email (invited admins verify through their set-password link).
  // Only someone with the right password learns this, and they get a fresh code (subject to the resend limits).
  if (!user.emailVerifiedAt) {
    await sendVerification(user, 'verify_email');
    throw new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Please verify your email first. We have sent a 6-digit code to your inbox.');
  }
  // Admins with two-step sign-in get a short-lived challenge instead of a session (see mfa.service).
  if (user.role === 'admin' && user.mfa?.enabled) return { mfaRequired: true as const, challenge: await issueChallenge(String(user._id)) };
  await UserModel.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await createSession(res, req, String(user._id));
  if (user.role !== 'student') await audit({ user: String(user._id), role: user.role, label: user.email }, user.role === 'admin' ? 'auth.admin_login' : 'auth.staff_login', { type: 'user', id: String(user._id) }, req);
  return { user: toPublicUser(user) };
}

export async function verifyEmail(token: string, req: Request) {
  const userId = await consumeToken(token, 'verify_email');
  if (!userId) throw new ApiError(400, 'INVALID_TOKEN', 'This verification link is invalid or has expired. Request a new one.');
  const user = await UserModel.findOneAndUpdate({ _id: userId }, [{ $set: { emailVerifiedAt: { $ifNull: ['$emailVerifiedAt', '$$NOW'] } } }], { new: true }).lean();
  if (!user) throw new ApiError(400, 'INVALID_TOKEN', 'This verification link is invalid or has expired. Request a new one.');
  await audit({ user: String(user._id), role: user.role, label: user.email }, 'auth.email_verified', { type: 'user', id: String(user._id) }, req);
  return toPublicUser(user);
}

// Checks the emailed code; on success the email is verified and the student is signed in. Unknown emails,
// verified accounts, wrong, used and expired codes all get the same answer.
export async function verifyOtp({ email, code }: { email: string; code: string }, req: Request, res: Response) {
  const user = await UserModel.findOne({ email, status: 'active' }).lean();
  if (!user || user.emailVerifiedAt || !(await consumeOtp(String(user._id), 'verify_email', code))) throw invalidCode();
  const verified = await UserModel.findOneAndUpdate({ _id: user._id }, [{ $set: { emailVerifiedAt: { $ifNull: ['$emailVerifiedAt', '$$NOW'] }, lastLoginAt: '$$NOW' } }], { new: true }).lean();
  await audit({ user: String(user._id), role: user.role, label: user.email }, 'auth.email_verified', { type: 'user', id: String(user._id) }, req, { method: 'otp' });
  // Admins always sign in with their password (and second step), never with an email code alone.
  if (verified!.role !== 'student') return { user: toPublicUser(verified!), signedIn: false };
  await createSession(res, req, String(user._id));
  return { user: toPublicUser(verified!), signedIn: true };
}

// Always the same answer, whether or not the email has an account.
export async function resendVerification(email: string) {
  const user = await UserModel.findOne({ email, status: 'active' }).lean();
  if (user && !user.emailVerifiedAt) await sendVerification(user, 'verify_email');
}

export async function forgotPassword(email: string) {
  const user = await UserModel.findOne({ email, status: 'active' }).lean();
  if (!user) return;
  const { token, id } = await issueToken(String(user._id), 'reset_password');
  await enqueueEmail({ to: user.email, template: 'reset_password', params: { name: user.name }, secretParams: { link: link('/reset-password', token) }, dedupeKey: `reset:${id}` });
}

// Reset (forgotten password) and set (admin invitation) both end every session and confirm by email.
async function applyNewPassword(token: string, type: 'reset_password' | 'set_password', password: string, req: Request) {
  const userId = await consumeToken(token, type);
  if (!userId) throw new ApiError(400, 'INVALID_TOKEN', 'This link is invalid or has expired. Please request a new one.');
  const user = await UserModel.findOneAndUpdate(
    { _id: userId, status: 'active' },
    // The link came to this mailbox, so it also proves the email address.
    // $literal: an argon2 hash starts with "$", which a pipeline would otherwise read as a field path.
    [{ $set: { passwordHash: { $literal: await hashPassword(password) }, passwordChangedAt: '$$NOW', failedLogins: 0, lockedUntil: null, emailVerifiedAt: { $ifNull: ['$emailVerifiedAt', '$$NOW'] } } }],
    { new: true },
  ).lean();
  if (!user) throw new ApiError(400, 'INVALID_TOKEN', 'This link is invalid or has expired. Please request a new one.');
  await endAllSessions(String(user._id));
  await enqueueEmail({ to: user.email, template: 'password_changed', params: { name: user.name }, dedupeKey: `pwchanged:${String(user._id)}:${Date.now()}` });
  await audit({ user: String(user._id), role: user.role, label: user.email }, type === 'set_password' ? 'auth.password_set' : 'auth.password_reset', { type: 'user', id: String(user._id) }, req);
}

export const resetPassword = (token: string, password: string, req: Request) => applyNewPassword(token, 'reset_password', password, req);
export const setPassword = (token: string, password: string, req: Request) => applyNewPassword(token, 'set_password', password, req);

export async function changePassword(userId: string, { currentPassword, newPassword }: { currentPassword: string; newPassword: string }, req: Request, res: Response) {
  const user = await UserModel.findById(userId).select('+passwordHash').lean();
  if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) throw new ApiError(422, 'WRONG_PASSWORD', 'Your current password is not correct', [{ field: 'currentPassword', message: 'Your current password is not correct' }]);
  await UserModel.updateOne({ _id: user._id }, { $set: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() } });
  // Every other device is signed out; this one gets a fresh session.
  await endAllSessions(String(user._id));
  await createSession(res, req, String(user._id));
  await enqueueEmail({ to: user.email, template: 'password_changed', params: { name: user.name }, dedupeKey: `pwchanged:${String(user._id)}:${Date.now()}` });
  await audit(actorFrom(req), 'auth.password_changed', { type: 'user', id: String(user._id) }, req);
}

export { SYSTEM_ACTOR };
