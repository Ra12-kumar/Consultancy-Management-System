import { Router } from 'express';
import { z } from 'zod';
import * as c from '../controllers/admin.controller.js';
import { authenticate, requirePermission, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { EMAIL_STATUSES } from '../models/EmailDelivery.js';
import { ENQUIRY_STATUSES } from '../models/Enquiry.js';
import { SCHOLARSHIP_APP_STATUSES } from '../models/Scholarship.js';
import { PERMISSIONS } from '../models/User.js';
import { emailSchema, nameSchema, objectIdSchema, pagination } from '../validators/common.js';
import { adminCatalogRouter } from './catalog.routes.js';
import { adminEnquiryRouter } from './enquiry.routes.js';
import { adminScholarshipRouter } from './scholarship.routes.js';
import { adminStage7Router } from './stage7.routes.js';
import { adminSupportRouter } from './support.routes.js';

// /api/admin — admins only; each route also needs its specific permission.
export const adminRouter = Router();
adminRouter.use(authenticate, requireRole('admin'));

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
// Scholarships (scholarships.manage; decisions also need scholarships.approve).
adminRouter.use(adminScholarshipRouter);
// Feedback (feedback.manage), personal data requests (privacy.manage), corrections (students.write), reports (reports.export).
adminRouter.use(adminSupportRouter);
// Settings and email templates (settings.manage), pages and announcements (content.manage), payments (payments.manage).
adminRouter.use(adminStage7Router);
