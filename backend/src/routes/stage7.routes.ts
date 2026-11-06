import { Router, type Request } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission, requireRole, requireVerifiedEmail } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimits.js';
import { validate } from '../middleware/validate.js';
import { AUDIENCES, PAGE_SLUGS, PAYMENT_STATUSES } from '../models/Content.js';
import * as mfa from '../services/mfa.service.js';
import * as pay from '../services/payment.service.js';
import * as site from '../services/settings.service.js';
import { publicCache } from '../services/cache.service.js';
import { sendSuccess } from '../utils/response.js';
import { socialUrl } from '../validators/catalog.validators.js';
import { objectIdSchema, pagination } from '../validators/common.js';

const text = (max: number) => z.string().trim().max(max);
const v = (req: Request) => req.valid as { body: any; query: any; params: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const idParams = { params: z.object({ id: objectIdSchema }).strict() };
const code = z.string().trim().min(6).max(12);
const payRef = { params: z.object({ reference: z.string().regex(/^PAY-\d{4}-\d{6}$/) }).strict() };
const student = [authenticate, requireRole('student')];

// ---- Two-step sign-in (mounted on /api/auth) ----
export const mfaRouter = Router();
mfaRouter.post('/mfa/verify', ...loginLimiter, validate({ body: z.object({ challenge: z.string().regex(/^[A-Za-z0-9_-]{32,100}$/), code }).strict() }), async (req, res) => sendSuccess(res, { user: await mfa.completeChallenge(v(req).body, req, res) }));
mfaRouter.post('/mfa/setup', authenticate, requireRole('admin'), async (req, res) => sendSuccess(res, await mfa.startSetup(req)));
mfaRouter.post('/mfa/enable', authenticate, requireRole('admin'), validate({ body: z.object({ code }).strict() }), async (req, res) => sendSuccess(res, await mfa.enable(req, v(req).body.code)));
mfaRouter.post('/mfa/disable', authenticate, requireRole('admin'), validate({ body: z.object({ password: z.string().min(1).max(128), code }).strict() }), async (req, res) => sendSuccess(res, { user: await mfa.disable(req, v(req).body) }));

// ---- Public site content: /api/site and /api/pages ----
export const siteRouter = Router();
siteRouter.get('/', publicCache('site'), async (_req, res) => sendSuccess(res, { ...(await site.publicSiteSettings()), banners: await site.publicBanners(), payments: { enabled: pay.paymentsStatus().enabled } }));
export const pagesRouter = Router();
pagesRouter.get('/:slug', publicCache('site'), validate({ params: z.object({ slug: z.enum(PAGE_SLUGS) }).strict() }), async (req, res) => sendSuccess(res, await site.publicPage(v(req).params.slug)));

// ---- Student announcements (mounted on /api/students) ----
export const studentAnnouncementsRouter = Router();
studentAnnouncementsRouter.get('/me/announcements', requireRole('student'), async (req, res) => sendSuccess(res, await site.myAnnouncements(req)));

// ---- Payments: /api/payments ----
export const paymentRouter = Router();
// Razorpay calls this directly (no session); it is verified by signature on the raw body.
paymentRouter.post('/webhook', async (req, res) => sendSuccess(res, await pay.handleWebhook((req as Request & { rawBody?: Buffer }).rawBody, req.get('x-razorpay-signature'))));
paymentRouter.get('/', ...student, async (req, res) => sendSuccess(res, await pay.myPayments(req)));
paymentRouter.get('/:reference', ...student, validate(payRef), async (req, res) => sendSuccess(res, await pay.myPayment(req, v(req).params.reference)));
paymentRouter.post('/:reference/order', ...student, requireVerifiedEmail, validate(payRef), async (req, res) => sendSuccess(res, await pay.createOrder(req, v(req).params.reference)));
paymentRouter.post(
  '/:reference/verify',
  ...student,
  validate({ ...payRef, body: z.object({ razorpay_order_id: text(60).min(1), razorpay_payment_id: text(60).min(1), razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/) }).strict() }),
  async (req, res) => sendSuccess(res, await pay.verifyCheckout(req, v(req).params.reference, v(req).body)),
);

// ---- Admin (mounted inside /api/admin) ----
export const adminStage7Router = Router();
const settings = requirePermission('settings.manage');
// A Google Maps link to the office (https, Google Maps addresses only), or empty.
const mapsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    if (v === '') return true;
    try {
      const u = new URL(v);
      const host = u.hostname.toLowerCase().replace(/^www\./, '');
      if (u.protocol !== 'https:') return false;
      if (/^maps\.google\.[a-z.]+$/.test(host) || host === 'maps.app.goo.gl') return true;
      return (/^google\.[a-z.]+$/.test(host) || host === 'goo.gl') && u.pathname.startsWith('/maps');
    } catch {
      return false;
    }
  }, 'Use the full https:// Google Maps link (Share → Copy link in Google Maps)');
// Phone and WhatsApp numbers: digits with an optional leading +, spaces, hyphens or brackets.
const phone = text(30).refine((v) => v === '' || /^\+?[0-9][0-9 ()-]{5,24}$/.test(v), 'Use a phone number such as +91 98765 43210');
const content = requirePermission('content.manage');
const payments = requirePermission('payments.manage');

adminStage7Router.get('/settings/site', settings, async (_req, res) => sendSuccess(res, await site.getSiteSettings()));
adminStage7Router.put(
  '/settings/site',
  settings,
  validate({
    body: z
      .object({
        organisation: z
          .object({ name: text(120), supportEmail: z.union([z.literal(''), z.string().trim().toLowerCase().email().max(254)]), supportPhone: phone, whatsapp: phone, address: text(400), officeHours: text(200), instagram: socialUrl('instagram'), facebook: socialUrl('facebook'), contactPerson: text(120), mapsUrl, linkedin: socialUrl('linkedin'), youtube: socialUrl('youtube'), x: socialUrl('x') })
          .partial()
          .strict()
          .default({}),
        crm: z.object({ autoAssign: z.boolean() }).partial().strict().optional(),
      })
      .strict(),
  }),
  async (req, res) => sendSuccess(res, await site.updateSiteSettings(v(req).body.organisation, req, v(req).body.crm)),
);
adminStage7Router.get('/email-templates', settings, async (_req, res) => sendSuccess(res, await site.listTemplates()));
adminStage7Router.put('/email-templates/:template', settings, validate({ params: z.object({ template: z.string().regex(/^[a-z_]{3,40}$/) }).strict(), body: z.object({ subject: text(160).default(''), intro: text(1000).default('') }).strict() }), async (req, res) =>
  sendSuccess(res, await site.saveTemplate(v(req).params.template, v(req).body, req)),
);

const slugParams = z.object({ slug: z.enum(PAGE_SLUGS) }).strict();
const pageBody = z
  .object({ title: text(120).min(2), intro: text(600).default(''), body: text(30_000).default(''), faqs: z.array(z.object({ question: text(300).min(3), answer: text(2000).min(1) }).strict()).max(50).default([]) })
  .strict();
adminStage7Router.get('/pages', content, async (_req, res) => sendSuccess(res, await site.adminPages()));
adminStage7Router.put('/pages/:slug', content, validate({ params: slugParams, body: pageBody }), async (req, res) => sendSuccess(res, await site.savePage(v(req).params.slug, v(req).body, req)));
adminStage7Router.post('/pages/:slug/restore/:revisionId', content, validate({ params: z.object({ slug: z.enum(PAGE_SLUGS), revisionId: objectIdSchema }).strict() }), async (req, res) =>
  sendSuccess(res, await site.restoreRevision(v(req).params.slug, v(req).params.revisionId, req)),
);
adminStage7Router.delete('/pages/:slug', content, validate({ params: slugParams }), async (req, res) => sendSuccess(res, await site.resetPage(v(req).params.slug, req)));
adminStage7Router.get('/announcements', content, validate({ query: z.object(pagination).strict() }), async (req, res) => {
  const { items, meta } = await site.adminAnnouncements(v(req).query);
  sendSuccess(res, items, { meta });
});
adminStage7Router.post(
  '/announcements',
  content,
  validate({ body: z.object({ title: text(120).min(3), body: text(2000).min(3), audience: z.enum(AUDIENCES), sendEmail: z.boolean().default(false), expiresAt: z.coerce.date().nullable().default(null) }).strict() }),
  async (req, res) => sendSuccess(res, await site.createAnnouncement(v(req).body, req), { status: 201 }),
);
adminStage7Router.post('/announcements/:id/withdraw', content, validate(idParams), async (req, res) => sendSuccess(res, await site.withdrawAnnouncement(v(req).params.id, req)));

adminStage7Router.get('/payments/status', payments, (_req, res) => sendSuccess(res, pay.paymentsStatus()));
adminStage7Router.get('/payments', payments, validate({ query: z.object({ status: z.enum(PAYMENT_STATUSES).optional(), ...pagination }).strict() }), async (req, res) => {
  const { items, meta } = await pay.adminPayments(v(req).query);
  sendSuccess(res, items, { meta });
});
adminStage7Router.post('/enquiries/:id/payments', payments, validate({ ...idParams, body: z.object({ amountMinor: z.number().int().min(100).max(10_000_000_00), description: text(200).default('') }).strict() }), async (req, res) =>
  sendSuccess(res, await pay.requestPayment(v(req).params.id, v(req).body, req), { status: 201 }),
);
adminStage7Router.post('/payments/:id/cancel', payments, validate(idParams), async (req, res) => sendSuccess(res, await pay.cancelPayment(v(req).params.id, req)));
