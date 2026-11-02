import { Router } from 'express';
import { z } from 'zod';
import * as c from '../controllers/admin.controller.js';
import { authenticate, requirePermission, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { EMAIL_STATUSES } from '../models/EmailDelivery.js';
import { ENQUIRY_STATUSES } from '../models/Enquiry.js';
import { INVITE_ROLES } from '../models/InviteCode.js';
import { SCHOLARSHIP_APP_STATUSES } from '../models/Scholarship.js';
import { PERMISSIONS } from '../models/User.js';
import { emailSchema, mobileSchema, nameSchema, objectIdSchema, pagination } from '../validators/common.js';
import { adminLeadRouter } from './callbackLead.routes.js';
import { adminCatalogRouter } from './catalog.routes.js';
import { eligibilityBody, recommendBody } from './counsellor.routes.js';
import * as counsellors from '../services/counsellor.service.js';
import { enquiryReport } from '../services/enquiryReports.service.js';
import { invalidateOnWrite } from '../services/cache.service.js';
import { sendSuccess } from '../utils/response.js';
import { adminEnquiryRouter } from './enquiry.routes.js';
import { adminScholarshipRouter } from './scholarship.routes.js';
import { adminStage7Router } from './stage7.routes.js';
import { adminSupportRouter } from './support.routes.js';

// /api/admin — admins only; each route also needs its specific permission.
export const adminRouter = Router();
adminRouter.use(authenticate, requireRole('admin'));
// Any successful admin change clears the public cache (catalogue, site content, scholarships) before answering.
adminRouter.use(invalidateOnWrite());

const permissions = z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length).transform((p) => [...new Set(p)]);

adminRouter.get(
  '/dashboard/summary',
  requirePermission('students.read'),
  validate({
    query: z
      .object({
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        course: objectIdSchema.optional(),
        college: objectIdSchema.optional(),
        state: z.string().trim().max(80).optional(),
        status: z.enum(ENQUIRY_STATUSES).optional(),
        scholarshipStatus: z.enum(SCHOLARSHIP_APP_STATUSES).optional(),
      })
      .strict(),
  }),
  c.summary,
);
adminRouter.get(
  '/students',
  requirePermission('students.read'),
  validate({ query: z.object({ q: z.string().trim().max(80).optional(), verified: z.enum(['yes', 'no']).optional(), sort: z.enum(['newest', 'oldest', 'name']).default('newest'), ...pagination }).strict() }),
  c.students,
);
adminRouter.get('/admins', requirePermission('admins.manage'), c.admins);
adminRouter.post('/admins', requirePermission('admins.manage'), validate({ body: z.object({ name: nameSchema, email: emailSchema, permissions }).strict() }), c.inviteAdmin);
// Counsellor accounts and their performance (admins.manage).
const team = requirePermission('admins.manage');
type AnyValid = { valid: { params: { id: string }; body: any; query: any } }; // eslint-disable-line @typescript-eslint/no-explicit-any
const val = (req: unknown) => (req as AnyValid).valid;
adminRouter.get('/team/counsellors', team, validate({ query: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }).strict() }), async (req, res) => sendSuccess(res, await counsellors.performance(val(req).query)));
adminRouter.post('/team/counsellors', team, validate({ body: z.object({ name: nameSchema, email: emailSchema, mobile: mobileSchema.optional() }).strict() }), async (req, res) => sendSuccess(res, await counsellors.createCounsellor(val(req).body, req), { status: 201 }));
adminRouter.patch('/team/counsellors/:id', team, validate({ params: z.object({ id: objectIdSchema }), body: z.object({ name: nameSchema, mobile: mobileSchema }).partial().strict() }), async (req, res) => sendSuccess(res, await counsellors.updateCounsellor(val(req).params.id, val(req).body, req)));
adminRouter.post('/team/counsellors/:id/deactivate', team, validate({ params: z.object({ id: objectIdSchema }) }), async (req, res) => sendSuccess(res, await counsellors.setCounsellorActive(val(req).params.id, false, req)));
adminRouter.post('/team/counsellors/:id/activate', team, validate({ params: z.object({ id: objectIdSchema }) }), async (req, res) => sendSuccess(res, await counsellors.setCounsellorActive(val(req).params.id, true, req)));
// Enquiry reports: counsellor-, college- and course-wise, with date, college, course, counsellor and status filters.
adminRouter.get(
  '/reports/enquiries',
  requirePermission('reports.export'),
  validate({ query: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), college: objectIdSchema.optional(), course: objectIdSchema.optional(), counsellor: z.union([objectIdSchema, z.literal('unassigned')]).optional(), status: z.enum(ENQUIRY_STATUSES).optional() }).strict() }),
  async (req, res) => sendSuccess(res, await enquiryReport(val(req).query)),
);
// Course suggestions and eligibility checks on any enquiry (enquiries.manage).
adminRouter.post('/enquiries/:id/recommendations', requirePermission('enquiries.manage'), validate({ params: z.object({ id: objectIdSchema }), body: recommendBody }), async (req, res) => sendSuccess(res, await counsellors.recommend(val(req).params.id, req, val(req).body), { status: 201 }));
adminRouter.post('/enquiries/:id/eligibility', requirePermission('enquiries.manage'), validate({ params: z.object({ id: objectIdSchema }), body: eligibilityBody }), async (req, res) => sendSuccess(res, await counsellors.eligibilityCheck(val(req).params.id, req, val(req).body.offerings)));
adminRouter.get('/invite-codes', requirePermission('admins.manage'), c.inviteCodes);
adminRouter.post(
  '/invite-codes',
  requirePermission('admins.manage'),
  validate({ body: z.object({ role: z.enum(INVITE_ROLES), permissions: permissions.default([]), email: emailSchema.optional(), note: z.string().trim().max(200).default(''), days: z.coerce.number().int().min(1).max(30).default(7) }).strict() }),
  c.createInviteCode,
);
adminRouter.delete('/invite-codes/:id', requirePermission('admins.manage'), validate({ params: z.object({ id: objectIdSchema }) }), c.revokeInviteCode);
adminRouter.patch('/admins/:id/permissions', requirePermission('admins.manage'), validate({ params: z.object({ id: objectIdSchema }), body: z.object({ permissions }).strict() }), c.setPermissions);
adminRouter.get('/email/status', requirePermission('email.view'), c.emailStatus);
adminRouter.get(
  '/email/deliveries',
  requirePermission('email.view'),
  validate({ query: z.object({ status: z.enum(EMAIL_STATUSES).optional(), template: z.string().trim().max(60).optional(), ...pagination }).strict() }),
  c.deliveries,
);
adminRouter.get('/audit-logs', requirePermission('audit.read'), validate({ query: z.object({ action: z.string().trim().max(80).optional(), ...pagination }).strict() }), c.auditLogs);

// Colleges, courses, locations (catalog.manage) and fees (pricing.manage).
adminRouter.use(adminCatalogRouter);
// Enquiries, applications and appointments (enquiries.manage; confirming admissions also needs admissions.confirm).
adminRouter.use(adminEnquiryRouter);
// Landing-page callback requests (enquiries.manage).
adminRouter.use(adminLeadRouter);
// Scholarships (scholarships.manage; decisions also need scholarships.approve).
adminRouter.use(adminScholarshipRouter);
// Feedback (feedback.manage), personal data requests (privacy.manage), corrections (students.write), reports (reports.export).
adminRouter.use(adminSupportRouter);
// Settings and email templates (settings.manage), pages and announcements (content.manage), payments (payments.manage).
adminRouter.use(adminStage7Router);
