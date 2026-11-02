import { Router } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import { makeLimiter } from '../middleware/rateLimits.js';
import { validate } from '../middleware/validate.js';
import { LEAD_EDUCATION, LEAD_ROLES } from '../models/CallbackLead.js';
import { createCallbackLead } from '../services/callbackLead.service.js';
import { sendSuccess } from '../utils/response.js';
import { mobileSchema, nameSchema } from '../validators/common.js';

// /api/leads: public callback requests from the landing page (no account). Rate limited per network.
export const leadRouter = Router();

// Same hourly allowance as registrations (LOGIN_RATE_LIMIT, default 10), per network.
const leadLimiter = makeLimiter('callback-lead-ip', 60 * 60_000, env.LOGIN_RATE_LIMIT, (req) => ipKeyGenerator(req.ip ?? ''), 'Too many requests from this network. Please try again later.');

export const callbackLeadBody = z
  .object({
    name: nameSchema,
    mobile: mobileSchema,
    role: z.enum(LEAD_ROLES),
    education: z.enum(LEAD_EDUCATION),
    interest: z.string().trim().max(80).default(''),
    consent: z.boolean().refine((v) => v, 'Please agree to be contacted about your enquiry'),
  })
  .strict();

leadRouter.post('/callback', leadLimiter, validate({ body: callbackLeadBody }), async (req, res) => sendSuccess(res, await createCallbackLead((req as typeof req & { valid: { body: z.infer<typeof callbackLeadBody> } }).valid.body), { status: 201 }));
