import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission, requireRole, requireVerifiedEmail } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, DATA_REQUEST_STATUSES } from '../models/Support.js';
import { singleUpload, streamFile } from '../services/files.service.js';
import { DATASETS, exportCsv, reportSummary, type Dataset } from '../services/reports.service.js';
import * as s from '../services/support.service.js';
import { sendSuccess } from '../utils/response.js';
import { mobileSchema, nameSchema, objectIdSchema, pagination } from '../validators/common.js';

const text = (max: number) => z.string().trim().max(max);
const idParams = { params: z.object({ id: objectIdSchema }).strict() };
const v = (req: Request) => req.valid as { body: any; query: any; params: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const student = [authenticate, requireRole('student')];
const range = { from: z.coerce.date().optional(), to: z.coerce.date().optional() };

// ---- Files: /api/files/:id (owner or permitted admin only) ----
export const filesRouter = Router();
filesRouter.get('/:id', authenticate, validate(idParams), async (req, res) => streamFile(req, res, v(req).params.id));

// ---- Student uploads (mounted on /api/students and /api/enquiries) ----
export const studentSupportRouter = Router();
studentSupportRouter.put('/me/photo', ...student, singleUpload(2), async (req, res) => sendSuccess(res, await s.setMyPhoto(req)));
studentSupportRouter.delete('/me/photo', ...student, async (req, res) => sendSuccess(res, await s.removeMyPhoto(req)));
studentSupportRouter.get('/me/data-requests', ...student, async (req, res) => sendSuccess(res, await s.myDataRequests(req)));
studentSupportRouter.post('/me/data-requests', ...student, validate({ body: z.object({ type: z.enum(['correction', 'deletion']), details: text(2000).default('') }).strict() }), async (req, res) =>
  sendSuccess(res, await s.createDataRequest(req, v(req).body), { status: 201 }),
);
studentSupportRouter.post('/me/data-requests/:reference/cancel', ...student, validate({ params: z.object({ reference: z.string().regex(/^DRQ-\d{4}-\d{6}$/) }).strict() }), async (req, res) =>
  sendSuccess(res, await s.cancelDataRequest(req, v(req).params.reference)),
);

export const enquiryDocumentRouter = Router();
enquiryDocumentRouter.post(
  '/:reference/documents/:docId/files',
  ...student,
  requireVerifiedEmail,
  validate({ params: z.object({ reference: z.string().trim().toUpperCase().regex(/^ENQ-\d{4}-\d{6}$/), docId: objectIdSchema }).strict() }),
  singleUpload(5),
  async (req, res) => sendSuccess(res, await s.uploadEnquiryDocument(req, v(req).params.reference, v(req).params.docId), { status: 201 }),
);

// ---- Feedback: /api/feedback (students) and /api/testimonials (public) ----
export const feedbackRouter = Router();
feedbackRouter.get('/', ...student, async (req, res) => sendSuccess(res, await s.myFeedback(req)));
feedbackRouter.post(
  '/',
  ...student,
  validate({ body: z.object({ rating: z.number().int().min(1).max(5), category: z.enum(FEEDBACK_CATEGORIES), message: text(2000).min(5, 'Write a few words'), enquiry: objectIdSchema.nullable().optional(), publishConsent: z.boolean().default(false) }).strict() }),
  async (req, res) => sendSuccess(res, await s.submitFeedback(req, v(req).body), { status: 201 }),
);
feedbackRouter.post('/:id/messages', ...student, validate({ ...idParams, body: z.object({ body: text(2000).min(1) }).strict() }), async (req, res) => sendSuccess(res, await s.studentFollowUp(req, v(req).params.id, v(req).body.body)));
feedbackRouter.patch('/:id/consent', ...student, validate({ ...idParams, body: z.object({ publishConsent: z.boolean() }).strict() }), async (req, res) => sendSuccess(res, await s.setConsent(req, v(req).params.id, v(req).body.publishConsent)));

export const testimonialsRouter = Router();
testimonialsRouter.get('/', async (_req, res) => sendSuccess(res, await s.publicTestimonials()));

// ---- Admin (mounted inside /api/admin) ----
export const adminSupportRouter = Router();
const feedback = requirePermission('feedback.manage');
adminSupportRouter.get('/feedback', feedback, validate({ query: z.object({ status: z.enum(FEEDBACK_STATUSES).optional(), category: z.enum(FEEDBACK_CATEGORIES).optional(), rating: z.coerce.number().int().min(1).max(5).optional(), testimonial: z.literal('candidates').optional(), ...pagination }).strict() }), async (req, res) => {
  const { items, meta } = await s.adminFeedback(v(req).query);
  sendSuccess(res, items, { meta });
});
adminSupportRouter.post('/feedback/:id/respond', feedback, validate({ ...idParams, body: z.object({ body: text(2000).min(1), resolve: z.boolean().default(false) }).strict() }), async (req, res) => sendSuccess(res, await s.respondToFeedback(v(req).params.id, v(req).body, req)));
adminSupportRouter.post('/feedback/:id/resolve', feedback, validate(idParams), async (req, res) => sendSuccess(res, await s.resolveFeedback(v(req).params.id, req)));
adminSupportRouter.post('/feedback/:id/testimonial', feedback, validate({ ...idParams, body: z.object({ decision: z.enum(['approved', 'rejected']) }).strict() }), async (req, res) => sendSuccess(res, await s.reviewTestimonial(v(req).params.id, v(req).body.decision, req)));

const privacy = requirePermission('privacy.manage');
adminSupportRouter.get('/data-requests', privacy, validate({ query: z.object({ status: z.enum(DATA_REQUEST_STATUSES).optional(), ...pagination }).strict() }), async (req, res) => {
  const { items, meta } = await s.adminDataRequests(v(req).query);
  sendSuccess(res, items, { meta });
});
adminSupportRouter.post('/data-requests/:id/resolve', privacy, validate({ ...idParams, body: z.object({ action: z.enum(['complete', 'reject']), note: text(1000).min(3, 'Write a short note for the student') }).strict() }), async (req, res) =>
  sendSuccess(res, await s.resolveDataRequest(v(req).params.id, v(req).body, req)),
);
adminSupportRouter.patch('/students/:id', requirePermission('students.write'), validate({ ...idParams, body: z.object({ name: nameSchema.optional(), mobile: mobileSchema.optional() }).strict().refine((b) => Object.keys(b).length > 0, 'Nothing to change') }), async (req, res) =>
  sendSuccess(res, await s.adminCorrectStudent(v(req).params.id, v(req).body, req)),
);

const reports = requirePermission('reports.export');
adminSupportRouter.get('/reports/summary', reports, validate({ query: z.object(range).strict() }), async (req, res) => sendSuccess(res, await reportSummary(v(req).query)));
adminSupportRouter.get(
  '/reports/export/:dataset',
  reports,
  validate({
    params: z.object({ dataset: z.enum(Object.keys(DATASETS) as [Dataset, ...Dataset[]]) }).strict(),
    query: z.object({ ...range, fields: z.string().max(500).optional().transform((f) => (f ? f.split(',').map((x) => x.trim()).filter(Boolean) : undefined)) }).strict(),
  }),
  async (req: Request, res: Response) => {
    const { csv, filename } = await exportCsv(req, v(req).params.dataset, v(req).query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(csv);
  },
);
