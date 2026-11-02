import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as counsellor from '../services/counsellor.service.js';
import { counsellorLeadRouter } from './callbackLead.routes.js';
import { sendSuccess } from '../utils/response.js';
import { objectIdSchema } from '../validators/common.js';
import * as v from '../validators/enquiry.validators.js';

// /api/counsellor: counsellors only, and only the enquiries assigned to them (anything else answers 404).
export const counsellorRouter = Router();
counsellorRouter.use(authenticate, requireRole('counsellor'));

type Valid = Request & { valid: { params: { id: string }; body: any; query: any } }; // eslint-disable-line @typescript-eslint/no-explicit-any
const val = (req: Request) => (req as Valid).valid;
const byId = { params: v.idParams };

export const recommendBody = z.object({ offerings: z.array(objectIdSchema).min(1).max(10).transform((a) => [...new Set(a)]), note: z.string().trim().max(1000).default('') }).strict();
export const eligibilityBody = z.object({ offerings: z.array(objectIdSchema).min(1).max(20) }).strict();
const followUpBody = z.object({ followUpAt: z.coerce.date().nullable() }).strict();

counsellorRouter.get('/summary', async (req: Request, res: Response) => sendSuccess(res, await counsellor.counsellorSummary(req.user!.id)));
counsellorRouter.get('/enquiries', validate({ query: v.adminEnquiriesQuery }), async (req, res) => {
  const { items, meta } = await counsellor.listMine(req, val(req).query);
  sendSuccess(res, items, { meta });
});
counsellorRouter.get('/enquiries/:id', validate(byId), async (req, res) => sendSuccess(res, await counsellor.mineDetail(val(req).params.id, req.user!.id)));
counsellorRouter.patch('/enquiries/:id', validate({ ...byId, body: followUpBody }), async (req, res) => sendSuccess(res, await counsellor.updateMine(val(req).params.id, req, val(req).body)));
counsellorRouter.post('/enquiries/:id/status', validate({ ...byId, body: v.statusBody }), async (req, res) => sendSuccess(res, await counsellor.statusMine(val(req).params.id, req, val(req).body)));
counsellorRouter.post('/enquiries/:id/notes', validate({ ...byId, body: v.internalNoteBody }), async (req, res) => sendSuccess(res, await counsellor.noteMine(val(req).params.id, req, val(req).body.body), { status: 201 }));
counsellorRouter.post('/enquiries/:id/contact-attempts', validate({ ...byId, body: v.contactAttemptBody }), async (req, res) => sendSuccess(res, await counsellor.contactMine(val(req).params.id, req, val(req).body), { status: 201 }));
counsellorRouter.post('/enquiries/:id/messages', validate({ ...byId, body: v.messageBody }), async (req, res) => sendSuccess(res, await counsellor.replyMine(val(req).params.id, req, val(req).body.body), { status: 201 }));
counsellorRouter.post('/enquiries/:id/recommendations', validate({ ...byId, body: recommendBody }), async (req, res) => sendSuccess(res, await counsellor.recommend(val(req).params.id, req, val(req).body), { status: 201 }));
counsellorRouter.post('/enquiries/:id/eligibility', validate({ ...byId, body: eligibilityBody }), async (req, res) => sendSuccess(res, await counsellor.eligibilityCheck(val(req).params.id, req, val(req).body.offerings)));
// Landing-page callback requests assigned to this counsellor.
counsellorRouter.use(counsellorLeadRouter);
