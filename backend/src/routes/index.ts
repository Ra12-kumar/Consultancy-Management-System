import { Router } from 'express';
import { liveness, readiness } from '../controllers/health.controller.js';
import { csrfGuard } from '../middleware/csrf.js';
import { buildOpenApi } from '../services/openapi.js';
import { adminRouter } from './admin.routes.js';
import { authRouter } from './auth.routes.js';
import { catalogRouter } from './catalog.routes.js';
import { counsellorRouter } from './counsellor.routes.js';
import { admissionRouter, appointmentRouter, enquiryRouter } from './enquiry.routes.js';
import { leadRouter } from './lead.routes.js';
import { scholarshipApplicationRouter, scholarshipRouter } from './scholarship.routes.js';
import { mfaRouter, pagesRouter, paymentRouter, siteRouter } from './stage7.routes.js';
import { enquiryDocumentRouter, feedbackRouter, filesRouter, testimonialsRouter } from './support.routes.js';
import { studentRouter } from './student.routes.js';

// All API routes, mounted at /api by app.ts.
export const apiRouter = Router();

apiRouter.get('/health', liveness);
apiRouter.get('/health/ready', readiness);

// Cookie-authenticated writes must come from our own origins.
apiRouter.use(csrfGuard);

apiRouter.use('/auth', authRouter);
apiRouter.use('/auth', mfaRouter);
apiRouter.use('/students', studentRouter);
apiRouter.use('/admin', adminRouter);
// Counsellors: only the enquiries assigned to them.
apiRouter.use('/counsellor', counsellorRouter);
// Students' own enquiries, college applications and counselling appointments.
apiRouter.use('/enquiries', enquiryRouter);
apiRouter.use('/enquiries', enquiryDocumentRouter);
apiRouter.use('/admissions', admissionRouter);
apiRouter.use('/appointments', appointmentRouter);
// Published scholarships, preliminary eligibility, and students' scholarship applications.
apiRouter.use('/scholarships', scholarshipRouter);
apiRouter.use('/scholarship-applications', scholarshipApplicationRouter);
// Private files, feedback and public testimonials (consented and approved only).
apiRouter.use('/files', filesRouter);
apiRouter.use('/feedback', feedbackRouter);
apiRouter.use('/testimonials', testimonialsRouter);
// Organisation details, banners, editable pages and online payments.
apiRouter.use('/site', siteRouter);
apiRouter.use('/pages', pagesRouter);
apiRouter.use('/payments', paymentRouter);
// Public callback requests from the landing page (no account; rate limited).
apiRouter.use('/leads', leadRouter);

// Public, read-only catalogue: /locations, /courses, /colleges, /colleges/compare, /colleges/:slug.
apiRouter.use(catalogRouter);

// Prefixes of the path-mounted routers, for the generated OpenAPI document (/api/docs).
const MOUNTS = new Map<unknown, string>([
  [authRouter, '/auth'],
  [mfaRouter, '/auth'],
  [siteRouter, '/site'],
  [pagesRouter, '/pages'],
  [paymentRouter, '/payments'],
  [leadRouter, '/leads'],
  [studentRouter, '/students'],
  [adminRouter, '/admin'],
  [counsellorRouter, '/counsellor'],
  [enquiryRouter, '/enquiries'],
  [enquiryDocumentRouter, '/enquiries'],
  [admissionRouter, '/admissions'],
  [appointmentRouter, '/appointments'],
  [scholarshipRouter, '/scholarships'],
  [scholarshipApplicationRouter, '/scholarship-applications'],
  [filesRouter, '/files'],
  [feedbackRouter, '/feedback'],
  [testimonialsRouter, '/testimonials'],
]);
let openApi: ReturnType<typeof buildOpenApi> | null = null;
export const openApiDocument = () => (openApi ??= buildOpenApi(apiRouter, '/api', MOUNTS));
