import mongoose from 'mongoose';
import { AuthTokenModel, type TokenType } from '../models/AuthToken.js';
import { hashToken, newToken } from '../utils/crypto.js';

const LIFETIME_MS: Record<TokenType, number> = {
  verify_email: 24 * 60 * 60_000,
  reset_password: 30 * 60_000,
  set_password: 72 * 60 * 60_000,
  // Between a correct password and the authenticator code.
  mfa_challenge: 5 * 60_000,
};

// Issues a new single-use token and cancels any earlier unused one of the same type for this user.
export async function issueToken(userId: string, type: TokenType) {
  const now = new Date();
  await AuthTokenModel.updateMany({ user: userId, type, usedAt: null }, { $set: { usedAt: now } });
  const token = newToken(32);
  const doc = await AuthTokenModel.create({ user: userId, type, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + LIFETIME_MS[type]) });
  return { token, id: String(doc._id) };
}

// Checks a token without using it up (for steps that may be retried, like a mistyped authenticator code).
export async function peekToken(token: string, type: TokenType): Promise<mongoose.Types.ObjectId | null> {
  const doc = await AuthTokenModel.findOne({ tokenHash: hashToken(token), type, usedAt: null, expiresAt: { $gt: new Date() } }).lean();
  return doc ? (doc.user as mongoose.Types.ObjectId) : null;
}

// Uses a token exactly once (atomic). Returns the user id, or null for unknown, used or expired tokens.
export async function consumeToken(token: string, type: TokenType): Promise<mongoose.Types.ObjectId | null> {
  const now = new Date();
  const doc = await AuthTokenModel.findOneAndUpdate({ tokenHash: hashToken(token), type, usedAt: null, expiresAt: { $gt: now } }, { $set: { usedAt: now } }, { new: true }).lean();
  return doc ? (doc.user as mongoose.Types.ObjectId) : null;
}
