import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { EmailOtpModel, type OtpPurpose } from '../models/EmailOtp.js';

// Email one-time codes: 6 digits, valid for 10 minutes, at most 5 wrong guesses, a resend at most once a minute
// and 5 codes an hour. Codes are compared as HMACs keyed with the server secret, never stored or logged in clear.

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60_000;
const OTP_MAX_SENDS_PER_HOUR = 5;
const HOUR_MS = 60 * 60_000;

const key = crypto.createHash('sha256').update(`email-otp:${env.SESSION_SECRET}`).digest();
const hashCode = (userId: string, purpose: OtpPurpose, code: string) => crypto.createHmac('sha256', key).update(`${purpose}:${userId}:${code}`).digest('hex');

// A fresh code, or null when the user asked too recently or too often (the caller answers the same either way).
export async function issueOtp(userId: string, purpose: OtpPurpose): Promise<string | null> {
  const now = new Date();
  const current = await EmailOtpModel.findOne({ user: userId, purpose }).lean();
  if (current && now.getTime() - current.lastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) return null;
  const freshWindow = !current || now.getTime() - current.sendWindowStart.getTime() >= HOUR_MS;
  if (!freshWindow && current!.sendsInWindow >= OTP_MAX_SENDS_PER_HOUR) return null;
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const set = { codeHash: hashCode(userId, purpose, code), expiresAt: new Date(now.getTime() + OTP_TTL_MS), attempts: 0, usedAt: null, lastSentAt: now };
  // Conditional on what was read, so two parallel requests cannot both pass the limits.
  const filter = current ? { _id: current._id, lastSentAt: current.lastSentAt } : { user: userId, purpose };
  const update = freshWindow ? { $set: { ...set, sendWindowStart: now, sendsInWindow: 1 } } : { $set: set, $inc: { sendsInWindow: 1 } };
  try {
    const saved = await EmailOtpModel.findOneAndUpdate(filter, update, { upsert: !current, new: true });
    return saved ? code : null;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return null; // a parallel request created it first
    throw err;
  }
}

// Uses the code once. Wrong guesses count against it; at the limit it stops working and a new code is needed.
export async function consumeOtp(userId: string, purpose: OtpPurpose, code: string): Promise<boolean> {
  const now = new Date();
  const live = { user: new mongoose.Types.ObjectId(userId), purpose, usedAt: null, expiresAt: { $gt: now }, attempts: { $lt: OTP_MAX_ATTEMPTS } };
  const used = await EmailOtpModel.findOneAndUpdate({ ...live, codeHash: hashCode(userId, purpose, code) }, { $set: { usedAt: now } });
  if (used) return true;
  await EmailOtpModel.updateOne(live, { $inc: { attempts: 1 } });
  return false;
}
