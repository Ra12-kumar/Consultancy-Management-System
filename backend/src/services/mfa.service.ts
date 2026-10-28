import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { UserModel, toPublicUser } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { decrypt, encrypt, hashToken } from '../utils/crypto.js';
import { verifyPassword } from '../utils/password.js';
import { newTotpSecret, otpauthUrl, verifyTotp } from '../utils/totp.js';
import { actorFrom, audit } from './audit.service.js';
import { safeEmail } from './enquiryShared.js';
import { createSession } from './session.service.js';
import { consumeToken, issueToken, peekToken } from './token.service.js';

// Optional two-step sign-in for administrators (authenticator app codes, plus single-use recovery codes).

const MAX_FAILED = 10;
const LOCK_MS = 15 * 60_000;
const recoveryCode = () => crypto.randomBytes(5).toString('hex').toUpperCase().replace(/(.{5})/, '$1-');
const normaliseRecovery = (c: string) => c.toUpperCase().replace(/[^A-F0-9]/g, '');

async function notify(userId: string, change: string) {
  const u = await UserModel.findById(userId).select('name email').lean();
  if (u) await safeEmail({ to: u.email, template: 'security_notice', params: { name: u.name, change }, dedupeKey: `mfa:${userId}:${change}:${Date.now()}` });
}

export async function startSetup(req: Request) {
  const user = await UserModel.findById(req.user!.id).lean();
  if (!user || user.role !== 'admin') throw ApiError.forbidden();
  if (user.mfa?.enabled) throw new ApiError(409, 'MFA_ENABLED', 'Two-step sign-in is already on');
  const secret = newTotpSecret();
  await UserModel.updateOne({ _id: user._id }, { $set: { 'mfa.pendingSecret': encrypt(secret) } });
  return { secret, otpauthUrl: otpauthUrl(secret, user.email, env.APP_NAME) };
}

export async function enable(req: Request, code: string) {
  const user = await UserModel.findById(req.user!.id).select('+mfa.pendingSecret').lean();
  if (!user?.mfa?.pendingSecret) throw new ApiError(409, 'MFA_NOT_STARTED', 'Start the setup first');
  const step = verifyTotp(decrypt(user.mfa.pendingSecret), code);
  if (step === null) throw new ApiError(422, 'INVALID_CODE', 'That code is not right. Check the time on your phone and try again.', [{ field: 'code', message: 'Incorrect code' }]);
  const codes = Array.from({ length: 8 }, recoveryCode);
  await UserModel.updateOne(
    { _id: user._id },
    { $set: { 'mfa.enabled': true, 'mfa.secret': user.mfa.pendingSecret, 'mfa.pendingSecret': null, 'mfa.lastStep': step, 'mfa.recoveryHashes': codes.map((c) => hashToken(normaliseRecovery(c))) } },
  );
  await audit(actorFrom(req), 'auth.mfa_enabled', { type: 'user', id: req.user!.id }, req);
  await notify(req.user!.id, 'Two-step sign-in was turned on');
  // Shown once; only hashes are stored.
  return { recoveryCodes: codes };
}

export async function disable(req: Request, input: { password: string; code: string }) {
  const user = await UserModel.findById(req.user!.id).select('+passwordHash +mfa.secret +mfa.lastStep +mfa.recoveryHashes').lean();
  if (!user?.mfa?.enabled) throw new ApiError(409, 'MFA_DISABLED', 'Two-step sign-in is not on');
  if (!(await verifyPassword(user.passwordHash, input.password))) throw new ApiError(422, 'WRONG_PASSWORD', 'Your password is not correct', [{ field: 'password', message: 'Incorrect password' }]);
  if (!(await checkSecondFactor(String(user._id), input.code))) throw new ApiError(422, 'INVALID_CODE', 'That code is not right', [{ field: 'code', message: 'Incorrect code' }]);
  await UserModel.updateOne({ _id: user._id }, { $set: { 'mfa.enabled': false, 'mfa.secret': null, 'mfa.recoveryHashes': [], 'mfa.lastStep': 0 } });
  await audit(actorFrom(req), 'auth.mfa_disabled', { type: 'user', id: req.user!.id }, req);
  await notify(req.user!.id, 'Two-step sign-in was turned off');
  return toPublicUser((await UserModel.findById(user._id).lean())!);
}

// A 6-digit code (each time step usable once) or an unused recovery code (removed when used).
async function checkSecondFactor(userId: string, code: string) {
  const user = await UserModel.findById(userId).select('+mfa.secret +mfa.lastStep +mfa.recoveryHashes').lean();
  if (!user?.mfa?.enabled || !user.mfa.secret) return false;
  const step = verifyTotp(decrypt(user.mfa.secret), code.trim());
  if (step !== null) {
    // Atomic replay protection: a step can only be used once.
    const r = await UserModel.updateOne({ _id: userId, 'mfa.lastStep': { $lt: step } }, { $set: { 'mfa.lastStep': step } });
    return r.modifiedCount === 1;
  }
  const hash = hashToken(normaliseRecovery(code));
  if (!(user.mfa.recoveryHashes ?? []).includes(hash)) return false;
  const r = await UserModel.updateOne({ _id: userId, 'mfa.recoveryHashes': hash }, { $pull: { 'mfa.recoveryHashes': hash } });
  return r.modifiedCount === 1;
}

// Called by login after a correct password: no session yet, only a short-lived challenge.
export async function issueChallenge(userId: string) {
  const { token } = await issueToken(userId, 'mfa_challenge');
  return token;
}

export async function completeChallenge(input: { challenge: string; code: string }, req: Request, res: Response) {
  const userId = await peekToken(input.challenge, 'mfa_challenge');
  if (!userId) throw new ApiError(400, 'INVALID_TOKEN', 'Your sign-in expired. Please enter your password again.');
  const user = await UserModel.findById(userId).select('+failedLogins +lockedUntil').lean();
  if (!user || user.status !== 'active') throw new ApiError(400, 'INVALID_TOKEN', 'Your sign-in expired. Please enter your password again.');
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new ApiError(429, 'ACCOUNT_LOCKED', 'Too many failed sign-ins. Please wait 15 minutes.');
  if (!(await checkSecondFactor(String(userId), input.code))) {
    const failed = (user.failedLogins ?? 0) + 1;
    await UserModel.updateOne({ _id: userId }, { $set: { failedLogins: failed >= MAX_FAILED ? 0 : failed, ...(failed >= MAX_FAILED && { lockedUntil: new Date(Date.now() + LOCK_MS) }) } });
    throw new ApiError(422, 'INVALID_CODE', 'That code is not right', [{ field: 'code', message: 'Incorrect code' }]);
  }
  if (!(await consumeToken(input.challenge, 'mfa_challenge'))) throw new ApiError(400, 'INVALID_TOKEN', 'Your sign-in expired. Please enter your password again.');
  await UserModel.updateOne({ _id: userId }, { $set: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await createSession(res, req, String(userId));
  await audit({ user: String(userId), role: user.role, label: user.email }, 'auth.admin_login', { type: 'user', id: String(userId) }, req, { mfa: true });
  return toPublicUser(user);
}

