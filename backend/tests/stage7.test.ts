import crypto from 'node:crypto';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { AuditLogModel } from '../src/models/AuditLog.js';
import { EmailDeliveryModel } from '../src/models/EmailDelivery.js';
import { PaymentModel } from '../src/models/Content.js';
import { renderEmail, setTemplateOverrides } from '../src/services/emailTemplates.js';
import { processEmailQueue } from '../src/services/emailWorker.js';
import { setRazorpayClient } from '../src/services/payment.service.js';
import { base32Encode, timeStep, totpCode } from '../src/utils/totp.js';
import { enquiryWorld, submitEnquiry } from './enquiryFixtures.js';
import { ORIGIN, PASSWORD, app, client, createAdmin, createLimitedAdmin, outbox, registerStudent, useTestDb } from './helpers.js';

useTestDb();
afterEach(() => {
  setTemplateOverrides([]);
  setRazorpayClient(null);
});

describe('two-step sign-in (TOTP)', () => {
  it('matches the RFC 6238 test vector', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(totpCode(secret, 1)).toBe('287082'); // T = 59 s
  });

  it('admins enable it, then sign in with a code; codes cannot be replayed; recovery codes work once', async () => {
    const { c, email } = await createAdmin();
    const { secret, otpauthUrl } = (await c.post('/api/auth/mfa/setup')).body.data;
    expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect((await c.post('/api/auth/mfa/enable', { code: '000000' })).body.error.code).toBe('INVALID_CODE');
    const enabled = await c.post('/api/auth/mfa/enable', { code: totpCode(secret, timeStep()) });
    expect(enabled.status, JSON.stringify(enabled.body)).toBe(200);
    const recovery = enabled.body.data.recoveryCodes as string[];
    expect(recovery).toHaveLength(8);
    expect((await c.get('/api/auth/me')).body.data.user.mfaEnabled).toBe(true);

    // A correct password alone no longer signs in.
    const fresh = client();
    const first = await fresh.post('/api/auth/login', { email, password: PASSWORD });
    expect(first.body.data).toMatchObject({ mfaRequired: true });
    expect(first.body.data.user).toBeUndefined();
    expect((await fresh.get('/api/auth/me')).status).toBe(401);
    expect((await fresh.post('/api/auth/mfa/verify', { challenge: first.body.data.challenge, code: '123456' })).status).toBe(422);
    const nextCode = totpCode(secret, timeStep() + 1);
    const ok = await fresh.post('/api/auth/mfa/verify', { challenge: first.body.data.challenge, code: nextCode });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect((await fresh.get('/api/auth/me')).status).toBe(200);
    // The challenge is single-use, and the same code cannot be used again.
    expect((await fresh.post('/api/auth/mfa/verify', { challenge: first.body.data.challenge, code: nextCode })).body.error.code).toBe('INVALID_TOKEN');
    const again = client();
    const second = (await again.post('/api/auth/login', { email, password: PASSWORD })).body.data.challenge;
    expect((await again.post('/api/auth/mfa/verify', { challenge: second, code: nextCode })).body.error.code).toBe('INVALID_CODE');
    expect((await again.post('/api/auth/mfa/verify', { challenge: second, code: recovery[0]!.toLowerCase() })).status).toBe(200);
    const third = client();
    const ch3 = (await third.post('/api/auth/login', { email, password: PASSWORD })).body.data.challenge;
    expect((await third.post('/api/auth/mfa/verify', { challenge: ch3, code: recovery[0]! })).body.error.code).toBe('INVALID_CODE');

    // Turning it off needs the password and a code.
    expect((await c.post('/api/auth/mfa/disable', { password: 'wrong-pass-123', code: recovery[1]! })).body.error.code).toBe('WRONG_PASSWORD');
    expect((await c.post('/api/auth/mfa/disable', { password: PASSWORD, code: recovery[1]! })).body.data.user.mfaEnabled).toBe(false);
    expect(await AuditLogModel.countDocuments({ action: { $in: ['auth.mfa_enabled', 'auth.mfa_disabled'] } })).toBe(2);
    const students = await registerStudent();
    expect((await students.c.post('/api/auth/mfa/setup')).status).toBe(403);
  });
});

describe('settings, templates, pages and announcements', () => {
  it('email templates: subject and introduction only, with safe placeholders; needs settings.manage', async () => {
    const { c } = await createAdmin();
    const content = await createLimitedAdmin(['content.manage']);
    expect((await content.c.get('/api/admin/email-templates')).status).toBe(403);
    const saved = await c.put('/api/admin/email-templates/enquiry_ack', { subject: 'Thanks {{name}} – {{reference}} {{passwordHash}}', intro: 'Our office is closed on Sunday.' });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.data.preview.subject).toBe('Thanks Priya – ENQ-2026-000001 ');
    const rendered = renderEmail('enquiry_ack', { name: 'Asha', reference: 'ENQ-2026-000009', course: 'BBA', link: 'https://example.com/x' });
    expect(rendered.text).toContain('Our office is closed on Sunday.');
    expect(rendered.html).toContain('https://example.com/x');
    expect((await c.put('/api/admin/email-templates/not_a_template', { subject: 'x' })).status).toBe(404);
    await c.put('/api/admin/email-templates/enquiry_ack', { subject: '', intro: '' });
    expect(renderEmail('enquiry_ack', { name: 'A', reference: 'R', course: 'C', link: 'https://e.x' }).subject).toBe('We received your enquiry R');
  });

  it('content pages: drafts of public text with revisions; public sees the saved page', async () => {
    const { c } = await createAdmin();
    const s = await registerStudent();
    expect((await request(app).get('/api/pages/privacy')).status).toBe(404);
    expect((await s.c.put('/api/admin/pages/privacy', { title: 'x' })).status).toBe(403);
    await c.put('/api/admin/pages/privacy', { title: 'Privacy policy', intro: 'v1', body: '## Data we hold\n- Name\n- Email' });
    await c.put('/api/admin/pages/privacy', { title: 'Privacy policy', intro: 'v2', body: 'Updated' });
    const pub = await request(app).get('/api/pages/privacy');
    expect(pub.body.data).toMatchObject({ title: 'Privacy policy', intro: 'v2' });
    expect(pub.body.data.revisions).toBeUndefined();
    const pages = (await c.get('/api/admin/pages')).body.data;
    const privacy = pages.find((p: { slug: string }) => p.slug === 'privacy');
    expect(privacy.revisions).toHaveLength(1);
    await c.post(`/api/admin/pages/privacy/restore/${privacy.revisions[0].id}`);
    expect((await request(app).get('/api/pages/privacy')).body.data.intro).toBe('v1');
    expect((await request(app).get('/api/pages/nonsense')).status).toBe(422);
    await c.del('/api/admin/pages/privacy');
    expect((await request(app).get('/api/pages/privacy')).status).toBe(404);
    // Organisation details appear on the public site endpoint.
    await c.put('/api/admin/settings/site', { organisation: { supportPhone: '+91 98765 43210', officeHours: 'Mon–Sat 10–6' } });
    expect((await request(app).get('/api/site')).body.data.organisation).toMatchObject({ supportPhone: '+91 98765 43210' });
  });

  it('announcements reach the chosen students (dashboard and email) and can be withdrawn', async () => {
    const { c } = await createAdmin();
    const verified = await registerStudent();
    const unverified = await registerStudent({ verify: false, name: 'Neha Verma' });
    outbox.length = 0;
    await EmailDeliveryModel.deleteMany({});
    expect((await c.post('/api/admin/announcements', { title: 'Office closed', body: 'x', audience: 'public', sendEmail: true })).status).toBe(422);
    const a = await c.post('/api/admin/announcements', { title: 'Counselling week', body: 'Free sessions all week.', audience: 'students_verified', sendEmail: true });
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(a.body.data.emailedCount).toBe(1);
    await processEmailQueue();
    expect(outbox.map((m) => m.to)).toEqual([verified.email]);
    expect((await verified.c.get('/api/students/me/announcements')).body.data.map((x: { title: string }) => x.title)).toEqual(['Counselling week']);
    expect((await unverified.c.get('/api/students/me/announcements')).body.data).toEqual([]);
    await c.post('/api/admin/announcements', { title: 'Admissions open', body: 'For 2027.', audience: 'public' });
    expect((await request(app).get('/api/site')).body.data.banners.map((b: { title: string }) => b.title)).toEqual(['Admissions open']);
    await c.post(`/api/admin/announcements/${a.body.data.id}/withdraw`);
    expect((await verified.c.get('/api/students/me/announcements')).body.data).toEqual([]);
  });

  it('dashboard figures follow the filters', async () => {
    const w = await enquiryWorld();
    await submitEnquiry(w);
    await submitEnquiry(w, { courses: [String(w.p.mba._id)], colleges: [] });
    const all = (await w.admin.c.get('/api/admin/dashboard/summary')).body.data;
    expect(all.enquiries.total).toBe(2);
    const mba = (await w.admin.c.get(`/api/admin/dashboard/summary?course=${w.p.mba._id}`)).body.data;
    expect(mba).toMatchObject({ filtered: true, enquiries: { total: 1 } });
    expect((await w.admin.c.get('/api/admin/dashboard/summary?status=ADMITTED')).body.data.enquiries).toMatchObject({ total: 0, new: 0 });
    expect((await w.admin.c.get('/api/admin/dashboard/summary?status=MAYBE')).status).toBe(422);
  });
});

describe('payments (consultancy service charge via Razorpay)', () => {
  const KEY = 'test_key_secret';
  const HOOK = 'test_webhook_secret';
  const sign = (key: string, data: string | Buffer) => crypto.createHmac('sha256', key).update(data).digest('hex');
  let orders = 0;
  const stub = () =>
    setRazorpayClient({ async createOrder(o) { orders += 1; return { id: `order_test${orders}`, amount: o.amount, currency: o.currency, status: 'created' }; } }, { configured: true, keySecret: KEY, webhookSecret: HOOK });

  it('admins request, students pay through Razorpay; only a valid signature marks it paid', async () => {
    const w = await enquiryWorld();
    const { id } = await submitEnquiry(w);
    expect((await w.student.c.post(`/api/admin/enquiries/${id}/payments`, { amountMinor: 1_000_000 })).status).toBe(403);
    const req = await w.admin.c.post(`/api/admin/enquiries/${id}/payments`, { amountMinor: 1_000_000, description: 'Consultancy service charge' });
    expect(req.status, JSON.stringify(req.body)).toBe(201);
    const ref = req.body.data.reference;
    expect(ref).toMatch(/^PAY-\d{4}-\d{6}$/);

    // Switched off until keys are configured.
    setRazorpayClient(null, { configured: false });
    expect((await w.student.c.post(`/api/payments/${ref}/order`)).body.error.code).toBe('PAYMENTS_DISABLED');
    stub();
    const order = await w.student.c.post(`/api/payments/${ref}/order`);
    expect(order.body.data).toMatchObject({ amount: 1_000_000, currency: 'INR', reference: ref });
    const orderId = order.body.data.orderId;
    const other = await registerStudent({ name: 'Arjun Mehta' });
    expect((await other.c.post(`/api/payments/${ref}/order`)).status).toBe(404);

    const forged = await w.student.c.post(`/api/payments/${ref}/verify`, { razorpay_order_id: orderId, razorpay_payment_id: 'pay_1', razorpay_signature: 'a'.repeat(64) });
    expect(forged.body.error.code).toBe('PAYMENT_SIGNATURE_INVALID');
    const paid = await w.student.c.post(`/api/payments/${ref}/verify`, { razorpay_order_id: orderId, razorpay_payment_id: 'pay_1', razorpay_signature: sign(KEY, `${orderId}|pay_1`) });
    expect(paid.body.data).toMatchObject({ status: 'paid', razorpayPaymentId: 'pay_1' });
    expect(paid.body.data.receiptNumber).toMatch(/^RCP-\d{4}-\d{6}$/);
    expect((await w.student.c.post(`/api/payments/${ref}/order`)).body.error.code).toBe('PAYMENT_LOCKED');
    await processEmailQueue();
    expect(outbox.find((m) => m.to === w.student.email && m.subject.startsWith('Payment received'))).toBeTruthy();
    expect((await w.student.c.get(`/api/enquiries/${(await w.student.c.get('/api/enquiries')).body.data[0].reference}`)).body.data.timeline.some((t: { body: string }) => t.body.startsWith('Payment received'))).toBe(true);
  });

  it('webhooks are verified on the raw body and are idempotent', async () => {
    const w = await enquiryWorld();
    const { id } = await submitEnquiry(w);
    stub();
    const ref = (await w.admin.c.post(`/api/admin/enquiries/${id}/payments`, { amountMinor: 500_000 })).body.data.reference;
    const orderId = (await w.student.c.post(`/api/payments/${ref}/order`)).body.data.orderId;
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_hook', order_id: orderId } } } });
    const send = (sig: string) => request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').set('x-razorpay-signature', sig).send(body);
    expect((await send('b'.repeat(64))).status).toBe(400);
    expect((await send(sign(HOOK, body))).body.data.handled).toBe(true);
    expect((await send(sign(HOOK, body))).status).toBe(200);
    const p = await PaymentModel.findOne({ reference: ref }).lean();
    expect(p).toMatchObject({ status: 'paid', razorpayPaymentId: 'pay_hook' });
    expect(await AuditLogModel.countDocuments({ action: 'payment.paid' })).toBe(1);
    // A cookie-less webhook is not blocked by the CSRF guard, but browser writes still are.
    expect((await request(app).post(`/api/payments/${ref}/order`).set('Origin', 'https://evil.example')).status).toBe(401);
    expect(ORIGIN).toBe('http://localhost:3000');
  });
});
