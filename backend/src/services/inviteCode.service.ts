import crypto from 'node:crypto';
import type { Request } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { InviteCodeModel, type InviteRole } from '../models/InviteCode.js';
import { PERMISSIONS, type Permission } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { audit, actorFrom, type Actor } from './audit.service.js';

// Staff sign-up (Admin or Counsellor) needs a single-use invitation code made by an admin with admins.manage
// (or by the CLI, for someone with server access). The role always comes from the code, never from the request.

const DAY_MS = 24 * 60 * 60_000;
// Crockford-style alphabet without look-alikes (no 0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const key = crypto.createHash('sha256').update(`invite-code:${env.SESSION_SECRET}`).digest();

// Codes are compared without dashes, spaces or case.
export const normaliseCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
const hashCode = (code: string) => crypto.createHmac('sha256', key).update(normaliseCode(code)).digest('hex');

function newCode() {
  const chars = Array.from({ length: 16 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12)}`;
}

const invalid = () => new ApiError(403, 'INVITE_INVALID', 'This invitation code is not valid. It may be wrong, used, expired or meant for another email address or role.');

type NewInvite = { role: InviteRole; permissions?: Permission[]; email?: string | null; note?: string; days?: number };

async function create(input: NewInvite, actor: Actor, req?: Request) {
  const code = newCode();
  const doc = await InviteCodeModel.create({
    codeHash: hashCode(code),
    hint: normaliseCode(code).slice(-4),
    role: input.role,
    permissions: input.role === 'admin' ? (input.permissions ?? []) : [],
    email: input.email || null,
    note: input.note ?? '',
    expiresAt: new Date(Date.now() + (input.days ?? 7) * DAY_MS),
    createdBy: actor.user && mongoose.isValidObjectId(actor.user) ? actor.user : null,
    createdByLabel: actor.label,
  });
  await audit(actor, 'invite.created', { type: 'invite', id: String(doc._id) }, req, { role: doc.role, permissions: doc.permissions, email: doc.email });
  return { code, invite: view(doc.toObject()) };
}

// From the admin dashboard: only admins.manage, and never permissions the creator does not hold.
export async function createInviteByAdmin(input: NewInvite, req: Request) {
  if (input.role === 'admin') {
    const missing = (input.permissions ?? []).filter((p) => !req.user!.permissions.includes(p));
    if (missing.length) throw new ApiError(403, 'PERMISSION_NOT_HELD', 'You cannot grant permissions you do not have');
  }
  return create(input, actorFrom(req), req);
}

// From the CLI (server access): admin codes carry every permission, like the first-admin bootstrap.
export async function createInviteFromCli(input: { role: InviteRole; email?: string | null; days?: number }) {
  return create({ ...input, permissions: input.role === 'admin' ? [...PERMISSIONS] : [], note: 'Created from the command line' }, { user: null, role: 'system', label: 'Invite CLI' });
}

type InviteDoc = { _id: unknown; hint: string; role: string; permissions?: string[]; email?: string | null; note?: string; expiresAt: Date; usedAt?: Date | null; revokedAt?: Date | null; createdByLabel?: string; createdAt?: Date };
function view(d: InviteDoc) {
  const status = d.revokedAt ? 'revoked' : d.usedAt ? 'used' : d.expiresAt <= new Date() ? 'expired' : 'active';
  return { id: String(d._id), hint: d.hint, role: d.role, permissions: d.permissions ?? [], email: d.email ?? null, note: d.note ?? '', status, expiresAt: d.expiresAt, usedAt: d.usedAt ?? null, createdBy: d.createdByLabel ?? '', createdAt: d.createdAt ?? null };
}

export async function listInviteCodes() {
  return (await InviteCodeModel.find().sort({ createdAt: -1 }).limit(100).lean()).map(view);
}

export async function revokeInviteCode(id: string, req: Request) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Invitation code not found');
  const doc = await InviteCodeModel.findOneAndUpdate({ _id: id, usedAt: null, revokedAt: null }, { $set: { revokedAt: new Date() } }, { new: true }).lean();
  if (!doc) throw new ApiError(409, 'INVITE_NOT_ACTIVE', 'Only unused codes can be revoked');
  await audit(actorFrom(req), 'invite.revoked', { type: 'invite', id }, req);
  return view(doc);
}

// Checks a code without using it (so a failed sign-up does not burn it).
export async function checkInviteCode(code: string, role: InviteRole, email: string) {
  const doc = await InviteCodeModel.findOne({ codeHash: hashCode(code), usedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } }).lean();
  if (!doc || doc.role !== role || (doc.email && doc.email !== email)) throw invalid();
  return doc;
}

// Uses the code once (atomic: two parallel sign-ups with one code create one account).
export async function redeemInviteCode(id: unknown, userId: unknown) {
  const doc = await InviteCodeModel.findOneAndUpdate({ _id: id, usedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date(), usedBy: userId } }, { new: true }).lean();
  if (!doc) throw invalid();
  return doc;
}

// Gives the code back when the account could not be created after all (e.g. the email was taken meanwhile).
export async function releaseInviteCode(id: unknown, userId: unknown) {
  await InviteCodeModel.updateOne({ _id: id, usedBy: userId }, { $set: { usedAt: null, usedBy: null } });
}
