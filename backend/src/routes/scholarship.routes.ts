import { Router, type Request, type Response } from 'express';
import { authenticate, requirePermission, requireRole, requireVerifiedEmail } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as s from '../services/scholarship.service.js';
import { sendSuccess } from '../utils/response.js';
import { idParams } from '../validators/catalog.validators.js';
import * as v from '../validators/scholarship.validators.js';

// Thin handlers: validated input in, service result out.
const q = (req: Request) => req.valid.query as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const b = (req: Request) => req.valid.body as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const id = (req: Request) => (req.valid.params as { id: string }).id;
const paged = (fn: (query: any) => Promise<{ items: unknown; meta: Record<string, unknown> }>) => async (req: Request, res: Response) => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { items, meta } = await fn(q(req));
  sendSuccess(res, items, { meta });
};

// ---- Public (published only) and the signed-in student's own data: /api/scholarships ----
export const scholarshipRouter = Router();
const student = [authenticate, requireRole('student')];
scholarshipRouter.get('/', validate({ query: v.publicScholarshipsQuery }), paged(s.listScholarships));
// Preliminary eligibility for the signed-in student across all published scholarships (or one).
scholarshipRouter.get('/eligibility', ...student, validate({ query: v.eligibilityQuery }), async (req, res) => sendSuccess(res, await s.checkMyEligibility(req, q(req))));
scholarshipRouter.get('/:slug/eligibility', ...student, validate({ params: v.scholarshipSlugParams, query: v.eligibilityQuery }), async (req, res) =>
  sendSuccess(res, await s.checkMyEligibility(req, q(req), (req.valid.params as { slug: string }).slug)),
);
scholarshipRouter.get('/:slug', validate({ params: v.scholarshipSlugParams }), async (req, res) => sendSuccess(res, await s.scholarshipDetail((req.valid.params as { slug: string }).slug)));

// ---- Student applications: /api/scholarship-applications ----
export const scholarshipApplicationRouter = Router();
scholarshipApplicationRouter.get('/', ...student, async (req, res) => sendSuccess(res, await s.myScholarshipApplications(req)));
scholarshipApplicationRouter.post('/', ...student, requireVerifiedEmail, validate({ body: v.applyBody }), async (req, res) => sendSuccess(res, await s.applyForScholarship(req, b(req)), { status: 201 }));
scholarshipApplicationRouter.post('/:reference/withdraw', ...student, requireVerifiedEmail, validate({ params: v.referenceParams }), async (req, res) =>
  sendSuccess(res, await s.withdrawScholarshipApplication(req, (req.valid.params as { reference: string }).reference)),
);

// ---- Admin (mounted inside /api/admin) ----
export const adminScholarshipRouter = Router();
const manage = requirePermission('scholarships.manage');
adminScholarshipRouter.get('/scholarships', manage, validate({ query: v.adminScholarshipsQuery }), paged(s.adminScholarships));
adminScholarshipRouter.post('/scholarships', manage, validate({ body: v.scholarshipBody }), async (req, res) => sendSuccess(res, await s.createScholarship(b(req), req), { status: 201 }));
adminScholarshipRouter.get('/scholarships/:id', manage, validate({ params: idParams }), async (req, res) => sendSuccess(res, await s.adminScholarship(id(req))));
adminScholarshipRouter.patch('/scholarships/:id', manage, validate({ params: idParams, body: v.scholarshipPatch }), async (req, res) => sendSuccess(res, await s.updateScholarship(id(req), b(req), req)));
for (const action of ['publish', 'archive', 'restore'] as const) {
  adminScholarshipRouter.post(`/scholarships/:id/${action}`, manage, validate({ params: idParams }), async (req, res) => sendSuccess(res, await s.setScholarshipStatus(id(req), action, req)));
}
adminScholarshipRouter.get('/scholarship-applications', manage, validate({ query: v.adminApplicationsQuery }), paged(s.adminScholarshipApplications));
adminScholarshipRouter.get('/scholarship-applications/:id', manage, validate({ params: idParams }), async (req, res) => sendSuccess(res, await s.adminScholarshipApplication(id(req))));
adminScholarshipRouter.post('/scholarship-applications/:id/review', manage, validate({ params: idParams, body: v.reviewBody }), async (req, res) => sendSuccess(res, await s.reviewScholarshipApplication(id(req), b(req), req)));
// Awarding or refusing is a separate permission.
adminScholarshipRouter.post('/scholarship-applications/:id/decision', requirePermission('scholarships.manage', 'scholarships.approve'), validate({ params: idParams, body: v.decisionBody }), async (req, res) =>
  sendSuccess(res, await s.decideScholarshipApplication(id(req), b(req), req)),
);
