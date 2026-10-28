import type { CookieOptions, Request, Response } from 'express';
import { env } from '../config/env.js';
import { SessionModel } from '../models/Session.js';
import { UserModel } from '../models/User.js';
import { hashToken, newToken } from '../utils/crypto.js';

export const SESSION_COOKIE = 'ec_sid';
const DAY_MS = 86_400_000;

function cookieOptions(expires?: Date): CookieOptions {
  return { httpOnly: true, secure: env.isProduction, sameSite: 'lax', path: '/', ...(expires && { expires }) };
}

// Starts a new session (a fresh random id every sign-in, so an old id can never be reused).
export async function createSession(res: Response, req: Request, userId: string) {
  const token = newToken(32);
  const now = Date.now();
  const expiresAt = new Date(now + env.SESSION_TTL_DAYS * DAY_MS);
  await SessionModel.create({
    tokenHash: hashToken(token),
    user: userId,
    expiresAt,
    absoluteExpiresAt: new Date(now + env.SESSION_MAX_DAYS * DAY_MS),
    lastSeenAt: new Date(now),
    userAgent: (req.get('user-agent') ?? '').slice(0, 300),
    ip: req.ip ?? '',
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

// The user behind a request's session cookie (null when absent, expired, or the account is disabled).
// Extends the sliding expiry at most once an hour.
export async function sessionUser(req: Request) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const now = new Date();
  const session = await SessionModel.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: now }, absoluteExpiresAt: { $gt: now } }).lean();
  if (!session) return null;
  const user = await UserModel.findOne({ _id: session.user, status: 'active' }).lean();
  if (!user) return null;
  if (now.getTime() - new Date(session.lastSeenAt).getTime() > 60 * 60_000) {
    const expiresAt = new Date(Math.min(now.getTime() + env.SESSION_TTL_DAYS * DAY_MS, new Date(session.absoluteExpiresAt).getTime()));
    await SessionModel.updateOne({ _id: session._id }, { $set: { lastSeenAt: now, expiresAt } });
  }
  return { user, sessionId: String(session._id) };
}

export async function endSession(req: Request, res: Response) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string') await SessionModel.deleteOne({ tokenHash: hashToken(token) });
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

export async function endAllSessions(userId: string) {
  await SessionModel.deleteMany({ user: userId });
}
