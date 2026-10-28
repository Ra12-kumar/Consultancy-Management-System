import type { Request } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { mailHealth } from '../config/mail.js';
import { AuditLogModel } from '../models/AuditLog.js';
import { EMAIL_STATUSES, EmailDeliveryModel } from '../models/EmailDelivery.js';
import { PERMISSIONS, UserModel, toPublicUser, type Permission } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { actorFrom, audit, type Actor } from './audit.service.js';
import { catalogCounts } from './catalog.service.js';
import { enquiryCounts, type DashboardFilter } from './enquiryAdmin.service.js';
import { scholarshipCounts } from './scholarship.service.js';
import { enqueueEmail } from './email.service.js';
import { endAllSessions } from './session.service.js';
import { issueToken } from './token.service.js';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const frontend = (path: string) => `${env.FRONTEND_URL.replace(/\/+$/, '')}${path}`;

// ---- Admin provisioning ----

// Creates an admin with no usable password and emails a single-use "set your password" link.
async function inviteAdmin({ name, email, permissions }: { name: string; email: string; permissions: Permission[] }, actor: Actor, req?: Request) {
  if (await UserModel.exists({ email })) throw new ApiError(409, 'EMAIL_IN_USE', 'An account with this email already exists');
  const user = await UserModel.create({ name, email, role: 'admin', permissions, passwordHash: null });
  const { token, id } = await issueToken(String(user._id), 'set_password');
  const setLink = `${frontend('/set-password')}?token=${encodeURIComponent(token)}`;
  await enqueueEmail({ to: email, template: 'admin_invite', params: { name, invitedBy: actor.role === 'system' ? env.APP_NAME : actor.label.replace(/ <.*>$/, '') }, secretParams: { link: setLink }, dedupeKey: `invite:${id}` });
  await audit(actor, 'admin.invited', { type: 'user', id: String(user._id) }, req, { email, permissions });
  return { user: toPublicUser(user), setLink };
}

// First administrator (CLI only, see database/scripts/bootstrap-admin.ts): refused once any admin exists.
export async function bootstrapFirstAdmin({ name, email }: { name: string; email: string }) {
  if (await UserModel.exists({ role: 'admin' })) throw new ApiError(409, 'ADMIN_EXISTS', 'An administrator already exists. Invite further admins from the admin dashboard.');
  return inviteAdmin({ name, email, permissions: [...PERMISSIONS] }, { user: null, role: 'system', label: 'Bootstrap script' });
}

// Further admins: only by an admin holding admins.manage, and only with permissions the inviter holds.
export async function inviteAdminByAdmin(input: { name: string; email: string; permissions: Permission[] }, req: Request) {
  const missing = input.permissions.filter((p) => !req.user!.permissions.includes(p));
  if (missing.length) throw new ApiError(403, 'PERMISSION_NOT_HELD', 'You cannot grant permissions you do not have');
  const { user } = await inviteAdmin(input, actorFrom(req), req);
  return user;
}

export async function listAdmins() {
  return (await UserModel.find({ role: 'admin' }).sort({ createdAt: 1 }).lean()).map(toPublicUser);
}

export async function setAdminPermissions(id: string, permissions: Permission[], req: Request) {
  if (id === req.user!.id) throw new ApiError(403, 'OWN_PERMISSIONS', 'You cannot change your own permissions');
  const missing = permissions.filter((p) => !req.user!.permissions.includes(p));
  if (missing.length) throw new ApiError(403, 'PERMISSION_NOT_HELD', 'You cannot grant permissions you do not have');
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Administrator not found');
  const before = await UserModel.findOne({ _id: id, role: 'admin' }).lean();
  if (!before) throw ApiError.notFound('Administrator not found');
  const user = await UserModel.findOneAndUpdate({ _id: id, role: 'admin' }, { $set: { permissions } }, { new: true }).lean();
  // Privilege changes take effect at once: their sessions end.
  await endAllSessions(id);
  await audit(actorFrom(req), 'admin.permissions_changed', { type: 'user', id }, req, { before: before.permissions, after: permissions });
  return toPublicUser(user!);
}

// ---- Students ----

export async function listStudents({ q, verified, sort, page, limit }: { q?: string; verified?: 'yes' | 'no'; sort: 'newest' | 'oldest' | 'name'; page: number; limit: number }) {
  const filter: Record<string, unknown> = { role: 'student' };
  if (q) {
    const rx = new RegExp(escapeRegex(q.trim()), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { mobile: rx }];
  }
  if (verified === 'yes') filter.emailVerifiedAt = { $ne: null };
  if (verified === 'no') filter.emailVerifiedAt = null;
  const order: Record<string, 1 | -1> = sort === 'name' ? { name: 1 } : { createdAt: sort === 'oldest' ? 1 : -1 };
  const [items, total] = await Promise.all([UserModel.find(filter).sort(order).skip((page - 1) * limit).limit(limit).lean(), UserModel.countDocuments(filter)]);
  return { items: items.map(toPublicUser), meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}

export async function dashboardSummary(filter: DashboardFilter = {}) {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [students, verified, newThisWeek, recent, emailCounts, catalog, enquiries, scholarships] = await Promise.all([
    UserModel.countDocuments({ role: 'student' }),
    UserModel.countDocuments({ role: 'student', emailVerifiedAt: { $ne: null } }),
    UserModel.countDocuments({ role: 'student', createdAt: { $gte: weekAgo } }),
    UserModel.find({ role: 'student' }).sort({ createdAt: -1 }).limit(6).lean(),
    EmailDeliveryModel.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    catalogCounts(),
    enquiryCounts(filter),
    scholarshipCounts(filter),
  ]);
  const email = Object.fromEntries(EMAIL_STATUSES.map((s) => [s, emailCounts.find((c) => c._id === s)?.n ?? 0]));
  return { students: { total: students, verified, unverified: students - verified, newThisWeek }, recentStudents: recent.map(toPublicUser), email: { ...email, mode: mailHealth().mode }, catalog, ...enquiries, scholarships };
}

// ---- Email delivery log (no bodies, links or secrets) ----

export async function listDeliveries({ status, template, page, limit }: { status?: string; template?: string; page: number; limit: number }) {
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (template) filter.template = template;
  const [items, total] = await Promise.all([EmailDeliveryModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), EmailDeliveryModel.countDocuments(filter)]);
  return {
    items: items.map((d) => ({ id: String(d._id), to: d.to, template: d.template, subject: d.subject, status: d.status, attempts: d.attempts, lastError: d.lastError || null, providerMessageId: d.providerMessageId, sentAt: d.sentAt, nextAttemptAt: ['retrying', 'queued'].includes(d.status) ? d.nextAttemptAt : null, createdAt: d.createdAt })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export function emailStatus() {
  const h = mailHealth();
  return { mode: h.mode, provider: env.SMTP_HOST ?? null, sender: env.EMAIL_FROM ?? null, missing: h.missing, lastCheck: h.lastVerify };
}

// ---- Audit log ----

export async function listAuditLogs({ action, page, limit }: { action?: string; page: number; limit: number }) {
  const filter = action ? { action } : {};
  const [items, total] = await Promise.all([AuditLogModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), AuditLogModel.countDocuments(filter)]);
  return {
    items: items.map((a) => ({ id: String(a._id), actor: a.actor?.label ?? 'System', role: a.actor?.role ?? 'system', action: a.action, target: a.target?.type ? `${a.target.type}:${a.target.id}` : null, ip: a.ip, metadata: a.metadata, at: a.createdAt })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}
