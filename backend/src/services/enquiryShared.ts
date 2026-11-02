import type { Request } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { CounterModel, EnquiryEventModel, type EnquiryStatus } from '../models/Enquiry.js';
import { UserModel } from '../models/User.js';
import { logger } from '../utils/logger.js';
import { enqueueEmail } from './email.service.js';
import type { TemplateName } from './emailTemplates.js';
import { STUDENT_LABELS } from './enquiryWorkflow.js';

type Id = mongoose.Types.ObjectId | string;
export const oid = (id: Id) => new mongoose.Types.ObjectId(String(id));
export const frontendLink = (path: string) => `${env.FRONTEND_URL.replace(/\/+$/, '')}${path}`;
export const studentEnquiryLink = (reference: string) => frontendLink(`/student/enquiries/${reference}`);
export const adminEnquiryLink = (id: Id) => frontendLink(`/admin/enquiries/${String(id)}`);

// India time for emails and labels.
export const fmtIST = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);

// ENQ-2026-000123 / APP-2026-000045 / SCH-2026-000007 from an atomic per-year counter.
export async function nextReference(prefix: 'ENQ' | 'APP' | 'SCH' | 'DRQ' | 'PAY' | 'RCP') {
  const year = new Date().getFullYear();
  const c = await CounterModel.findOneAndUpdate({ _id: `${prefix.toLowerCase()}-${year}` }, { $inc: { seq: 1 } }, { upsert: true, new: true }).lean();
  return `${prefix}-${year}-${String(c!.seq).padStart(6, '0')}`;
}

export type EventActor = { user: string | null; role: string; name: string };
export const eventActor = (req?: Request): EventActor => (req?.user ? { user: req.user.id, role: req.user.role, name: req.user.name } : { user: null, role: 'system', name: 'System' });

export async function addEvent(
  enquiry: Id,
  e: { type: string; visibility: 'internal' | 'student'; actor: EventActor; fromStatus?: EnquiryStatus | null; toStatus?: EnquiryStatus | null; reason?: string; body?: string; meta?: Record<string, unknown> | null },
) {
  return EnquiryEventModel.create({ enquiry, ...e });
}

// Emails never block or undo the action that triggered them.
export async function safeEmail(input: { to: string; template: TemplateName; params: Record<string, string>; dedupeKey: string; related?: { type: string; id: string } }) {
  try {
    await enqueueEmail(input);
  } catch (err) {
    logger.error({ err: { name: (err as Error).name, message: (err as Error).message }, template: input.template }, 'Could not queue enquiry email');
  }
}

// Admins who can act as counsellors (and receive new-enquiry emails).
export async function counsellors() {
  return UserModel.find({ role: 'admin', status: 'active', permissions: 'enquiries.manage' }).select('name email').sort({ name: 1 }).lean();
}

// Everyone an enquiry can be assigned to: active counsellors and admins who handle enquiries. Counsellors are
// not sent other students' new enquiries; they hear only about the ones assigned to them.
export const ASSIGNABLE = { status: 'active', $or: [{ role: 'counsellor' }, { role: 'admin', permissions: 'enquiries.manage' }] };
export async function assignableCounsellors() {
  return UserModel.find(ASSIGNABLE).select('name email role').sort({ name: 1 }).lean();
}

export const statusLabel = (s: EnquiryStatus) => STUDENT_LABELS[s];
