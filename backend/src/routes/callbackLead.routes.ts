import { Router, type Request } from 'express';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { LEAD_STATUSES } from '../models/CallbackLead.js';
import { listLeads, updateLead, type LeadListQuery, type LeadPatch } from '../services/callbackLeadAdmin.service.js';
import { sendSuccess } from '../utils/response.js';
import { objectIdSchema, pagination } from '../validators/common.js';

// Landing-page callback requests in the Enquiries section. Mounted under /api/admin (role admin,
// enquiries.manage) and /api/counsellor (role counsellor; only their assigned requests).

const listQuery = z.object({ status: z.enum(LEAD_STATUSES).optional(), ...pagination }).strict();
const idParams = z.object({ id: objectIdSchema }).strict();
const note = z.string().trim().max(1000);
const adminPatch = z.object({ status: z.enum(LEAD_STATUSES), note, assignedTo: objectIdSchema.nullable() }).partial().strict();
const counsellorPatch = z.object({ status: z.enum(LEAD_STATUSES), note }).partial().strict();

type Valid = Request & { valid: { params: { id: string }; query: LeadListQuery; body: LeadPatch } };
const val = (req: Request) => (req as Valid).valid;

export const adminLeadRouter = Router();
const manage = requirePermission('enquiries.manage');
adminLeadRouter.get('/callback-leads', manage, validate({ query: listQuery }), async (req, res) => {
  const { items, meta } = await listLeads(val(req).query);
  sendSuccess(res, items, { meta });
});
adminLeadRouter.patch('/callback-leads/:id', manage, validate({ params: idParams, body: adminPatch }), async (req, res) => sendSuccess(res, await updateLead(val(req).params.id, val(req).body, req)));

export const counsellorLeadRouter = Router();
counsellorLeadRouter.get('/callback-leads', validate({ query: listQuery }), async (req, res) => {
  const { items, meta } = await listLeads(val(req).query, req.user!.id);
  sendSuccess(res, items, { meta });
});
counsellorLeadRouter.patch('/callback-leads/:id', validate({ params: idParams, body: counsellorPatch }), async (req, res) => sendSuccess(res, await updateLead(val(req).params.id, val(req).body, req, req.user!.id)));
