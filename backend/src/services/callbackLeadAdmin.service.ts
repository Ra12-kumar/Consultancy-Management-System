import type { Request } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { CallbackLeadModel, type LEAD_STATUSES } from '../models/CallbackLead.js';
import { UserModel } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { actorFrom, audit } from './audit.service.js';
import { enqueueEmail } from './email.service.js';
import { ASSIGNABLE } from './enquiryShared.js';

// Landing-page callback requests in the Enquiries section: admins (enquiries.manage) see and assign all of
// them; a counsellor sees and updates only the ones assigned to them (anything else answers 404).

type LeadStatus = (typeof LEAD_STATUSES)[number];
export type LeadListQuery = { status?: LeadStatus; page: number; limit: number };
export type LeadPatch = { status?: LeadStatus; note?: string; assignedTo?: string | null };

const EDUCATION: Record<string, string> = { class_10: 'Class 10', class_12: 'Class 12', diploma: 'Diploma', undergraduate: 'Undergraduate', postgraduate: 'Postgraduate', other: 'Other' };
const invalid = (field: string, message: string) => new ApiError(422, 'VALIDATION_ERROR', message, [{ field, message }]);
const frontend = (path: string) => `${env.FRONTEND_URL.replace(/\/+$/, '')}${path}`;

// Requests saved before assignment and notes existed have no such fields (lean reads skip schema defaults).
type LeanLead = { _id: unknown; name: string; mobile: string; role: string; education: string; interest?: string; status?: string; note?: string; source?: string; contactedAt?: Date | null; createdAt: Date; assignedTo?: { _id: unknown; name: string } | null };
const toLead = (l: LeanLead) => ({
  id: String(l._id),
  name: l.name,
  mobile: l.mobile,
  role: l.role,
  education: l.education,
  interest: l.interest ?? '',
  status: l.status ?? 'new',
  note: l.note ?? '',
  source: l.source ?? 'landing',
  contactedAt: l.contactedAt ?? null,
  requestedAt: l.createdAt,
  assignedTo: l.assignedTo ? { id: String(l.assignedTo._id), name: l.assignedTo.name } : null,
});

export async function listLeads(query: LeadListQuery, assignee?: string) {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (assignee) filter.assignedTo = assignee;
  const [rows, total, open] = await Promise.all([
    CallbackLeadModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate('assignedTo', 'name')
      .lean(),
    CallbackLeadModel.countDocuments(filter),
    CallbackLeadModel.countDocuments({ ...(assignee ? { assignedTo: assignee } : {}), status: 'new' }),
  ]);
  return { items: (rows as unknown as LeanLead[]).map(toLead), meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)), new: open } };
}

// Admins may change anything; a counsellor (assignee set) may change the status and note of their own leads.
export async function updateLead(id: string, patch: LeadPatch, req: Request, assignee?: string) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Callback request not found');
  const lead = await CallbackLeadModel.findOne({ _id: id, ...(assignee ? { assignedTo: assignee } : {}) });
  if (!lead) throw ApiError.notFound('Callback request not found');

  let newAssignee: { _id: unknown; name: string; email: string; role: string } | null = null;
  if (patch.assignedTo !== undefined && String(lead.assignedTo ?? '') !== String(patch.assignedTo ?? '')) {
    if (patch.assignedTo) {
      newAssignee = await UserModel.findOne({ _id: patch.assignedTo, ...ASSIGNABLE }).select('name email role').lean();
      if (!newAssignee) throw invalid('assignedTo', 'Choose a counsellor from the list');
    }
    lead.assignedTo = (patch.assignedTo ?? null) as never;
  }
  if (patch.status) {
    lead.status = patch.status;
    if (patch.status !== 'new' && !lead.contactedAt) lead.contactedAt = new Date();
  }
  if (patch.note !== undefined) lead.note = patch.note;
  await lead.save();
  await audit(actorFrom(req), 'callback_lead.updated', { type: 'callback_lead', id }, req, { fields: Object.keys(patch) });

  // The new assignee hears about it by email (the phone number goes only in the protected parameters).
  if (newAssignee) {
    await enqueueEmail({
      to: newAssignee.email,
      template: 'callback_lead',
      params: { name: lead.name, role: lead.role === 'parent' ? 'Parent / guardian' : 'Student', education: EDUCATION[lead.education] ?? lead.education, interest: lead.interest || 'Not sure yet' },
      secretParams: { mobile: lead.mobile, link: frontend(newAssignee.role === 'counsellor' ? '/counsellor/enquiries' : '/admin/enquiries') },
      dedupeKey: `callback-lead-assigned:${id}:${String(newAssignee._id)}`,
      related: { type: 'callback_lead', id },
    });
  }
  const fresh = await CallbackLeadModel.findById(id).populate('assignedTo', 'name').lean();
  return toLead(fresh as unknown as LeanLead);
}
