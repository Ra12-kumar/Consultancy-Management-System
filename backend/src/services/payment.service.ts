import crypto from 'node:crypto';
import type { Request } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { PaymentModel } from '../models/Content.js';
import { EnquiryModel } from '../models/Enquiry.js';
import { UserModel } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { actorFrom, audit } from './audit.service.js';
import { pageMeta } from './catalog.service.js';
import { addEvent, eventActor, frontendLink, nextReference, oid, safeEmail } from './enquiryShared.js';

// Online payment of the consultancy's own service charge through Razorpay. Official college fees are never collected
// here. A payment is "paid" only after the signature from Razorpay is verified on the server (checkout callback or
// webhook); the browser's word is never trusted.

type Lean = Record<string, any> & { _id: mongoose.Types.ObjectId }; // eslint-disable-line @typescript-eslint/no-explicit-any
const inr = (minor: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(minor / 100);

// ---- Razorpay client (replaceable in tests) ----

type OrderRequest = { amount: number; currency: 'INR'; receipt: string; notes: Record<string, string> };
type RazorpayClient = { createOrder(o: OrderRequest): Promise<{ id: string; amount: number; currency: string; status: string }> };

const httpClient: RazorpayClient = {
  async createOrder(order) {
    const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const res = await fetch('https://api.razorpay.com/v1/orders', { method: 'POST', headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' }, body: JSON.stringify(order), signal: AbortSignal.timeout(15_000) });
    const json = (await res.json().catch(() => null)) as { id?: string; amount?: number; currency?: string; status?: string; error?: { description?: string } } | null;
    if (!res.ok || !json?.id) {
      logger.error({ status: res.status, reason: json?.error?.description ?? 'unknown' }, 'Razorpay order creation failed');
      throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'The payment service is not available right now. Please try again shortly.');
    }
    return { id: json.id, amount: json.amount!, currency: json.currency!, status: json.status! };
  },
};
let client: RazorpayClient = httpClient;
let configured = () => env.paymentsConfigured;
export function setRazorpayClient(c: RazorpayClient | null, opts?: { configured?: boolean; keySecret?: string; webhookSecret?: string }) {
  client = c ?? httpClient;
  configured = opts?.configured === undefined ? () => env.paymentsConfigured : () => opts.configured!;
  secrets = { key: opts?.keySecret, webhook: opts?.webhookSecret };
}
let secrets: { key?: string; webhook?: string } = {};
const keySecret = () => secrets.key ?? env.RAZORPAY_KEY_SECRET ?? '';
const webhookSecret = () => secrets.webhook ?? env.RAZORPAY_WEBHOOK_SECRET ?? '';

const hmac = (key: string, data: string | Buffer) => crypto.createHmac('sha256', key).update(data).digest('hex');
function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---- Views ----

const toPayment = (p: Lean) => ({
  reference: p.reference,
  id: String(p._id),
  description: p.description,
  amountMinor: p.amountMinor,
  currency: p.currency,
  status: p.status,
  receiptNumber: p.receiptNumber,
  paidAt: p.paidAt ?? null,
  razorpayPaymentId: p.razorpayPaymentId,
  enquiry: p.enquiry ? String(p.enquiry) : null,
  createdAt: p.createdAt,
});

export const paymentsStatus = () => ({ enabled: configured(), keyId: configured() ? (env.RAZORPAY_KEY_ID ?? 'rzp_test_stub') : null });

// ---- Admin (payments.manage) ----

export async function requestPayment(enquiryId: string, input: { amountMinor: number; description: string }, req: Request) {
  const e = (await EnquiryModel.findById(enquiryId).lean()) as Lean | null;
  if (!e) throw ApiError.notFound('Enquiry not found');
  const p = await PaymentModel.create({ ...input, reference: await nextReference('PAY'), student: e.student, enquiry: e._id, requestedBy: oid(req.user!.id) });
  await addEvent(e._id, { type: 'message', visibility: 'student', actor: eventActor(req), body: `Payment request ${p.reference}: ${inr(input.amountMinor)} – ${input.description || 'consultancy service charge'}.` });
  await audit(actorFrom(req), 'payment.requested', { type: 'payment', id: String(p._id) }, req, { amountMinor: input.amountMinor, enquiry: enquiryId });
  await safeEmail({ to: e.studentSnapshot.email, template: 'payment_request', params: { name: e.studentSnapshot.name, reference: p.reference, amount: inr(input.amountMinor), description: input.description, link: frontendLink('/student/payments') }, dedupeKey: `pay-req:${String(p._id)}` });
  return toPayment(p.toObject() as Lean);
}

export async function cancelPayment(id: string, req: Request) {
  const p = await PaymentModel.findOneAndUpdate({ _id: id, status: { $in: ['requested', 'pending', 'failed'] } }, { $set: { status: 'cancelled' } }, { new: true }).lean();
  if (!p) throw new ApiError(409, 'PAYMENT_LOCKED', 'Only an unpaid request can be cancelled');
  await audit(actorFrom(req), 'payment.cancelled', { type: 'payment', id }, req);
  return toPayment(p as Lean);
}

export async function adminPayments(q: { status?: string; page: number; limit: number }) {
  const filter = q.status ? { status: q.status } : {};
  const [items, total] = await Promise.all([PaymentModel.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), PaymentModel.countDocuments(filter)]);
  const students = new Map((await UserModel.find({ _id: { $in: items.map((p) => p.student) } }).select('name email').lean()).map((u) => [String(u._id), u]));
  return { items: (items as Lean[]).map((p) => ({ ...toPayment(p), studentName: students.get(String(p.student))?.name ?? '—', studentEmail: students.get(String(p.student))?.email ?? '' })), meta: pageMeta(q.page, q.limit, total) };
}

// ---- Student ----

const mine = async (req: Request, reference: string) => {
  const p = (await PaymentModel.findOne({ reference, student: req.user!.id }).lean()) as Lean | null;
  if (!p) throw ApiError.notFound('Payment not found');
  return p;
};

export async function myPayments(req: Request) {
  return { payments: ((await PaymentModel.find({ student: req.user!.id }).sort({ createdAt: -1 }).lean()) as Lean[]).map(toPayment), ...paymentsStatus() };
}

export async function myPayment(req: Request, reference: string) {
  const p = await mine(req, reference);
  const u = await UserModel.findById(req.user!.id).select('name email').lean();
  return { ...toPayment(p), payer: { name: u?.name ?? '', email: u?.email ?? '' } };
}

// Creates (or reuses) the Razorpay order for a payment request; returns what the checkout widget needs.
export async function createOrder(req: Request, reference: string) {
  if (!configured()) throw new ApiError(503, 'PAYMENTS_DISABLED', 'Online payment is not available yet. Please contact your counsellor.');
  const p = await mine(req, reference);
  if (!['requested', 'pending', 'failed'].includes(p.status)) throw new ApiError(409, 'PAYMENT_LOCKED', 'This payment is already completed or cancelled');
  let orderId = p.razorpayOrderId as string | null;
  if (!orderId || p.status === 'failed') {
    const order = await client.createOrder({ amount: p.amountMinor, currency: 'INR', receipt: p.reference, notes: { reference: p.reference } });
    if (order.amount !== p.amountMinor) throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'The payment service returned an unexpected amount');
    orderId = order.id;
    await PaymentModel.updateOne({ _id: p._id, status: p.status }, { $set: { razorpayOrderId: orderId, status: 'pending', failureReason: '' } });
  }
  const u = await UserModel.findById(req.user!.id).select('name email mobile').lean();
  return { keyId: paymentsStatus().keyId, orderId, amount: p.amountMinor, currency: 'INR', name: env.APP_NAME, description: p.description || 'Consultancy service charge', reference: p.reference, prefill: { name: u?.name ?? '', email: u?.email ?? '', contact: u?.mobile ?? '' } };
}

async function markPaid(p: Lean, paymentId: string, via: string, req?: Request) {
  const receiptNumber = await nextReference('RCP');
  const updated = (await PaymentModel.findOneAndUpdate({ _id: p._id, status: { $in: ['requested', 'pending', 'failed'] } }, { $set: { status: 'paid', razorpayPaymentId: paymentId, receiptNumber, paidAt: new Date() } }, { new: true }).lean()) as Lean | null;
  if (!updated) return (await PaymentModel.findById(p._id).lean()) as Lean; // already paid (idempotent)
  const u = await UserModel.findById(p.student).select('name email').lean();
  if (p.enquiry) await addEvent(p.enquiry, { type: 'message', visibility: 'student', actor: req ? eventActor(req) : { user: null, role: 'system', name: 'Payments' }, body: `Payment received: ${inr(p.amountMinor)} (receipt ${receiptNumber}).` });
  await audit(req ? actorFrom(req) : { user: null, role: 'system', label: `Razorpay ${via}` }, 'payment.paid', { type: 'payment', id: String(p._id) }, req, { via, amountMinor: p.amountMinor, razorpayPaymentId: paymentId });
  if (u) await safeEmail({ to: u.email, template: 'payment_receipt', params: { name: u.name, reference: p.reference, receipt: receiptNumber, amount: inr(p.amountMinor), description: p.description, link: frontendLink(`/student/payments/${p.reference}`) }, dedupeKey: `pay-rcpt:${String(p._id)}` });
  return updated;
}

// Checkout callback: the signature proves Razorpay produced this payment for this order.
export async function verifyCheckout(req: Request, reference: string, input: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
  const p = await mine(req, reference);
  if (!p.razorpayOrderId || p.razorpayOrderId !== input.razorpay_order_id) throw new ApiError(422, 'PAYMENT_MISMATCH', 'This payment does not match the order');
  if (!safeEqual(hmac(keySecret(), `${input.razorpay_order_id}|${input.razorpay_payment_id}`), input.razorpay_signature)) {
    await audit(actorFrom(req), 'payment.signature_rejected', { type: 'payment', id: String(p._id) }, req);
    throw new ApiError(422, 'PAYMENT_SIGNATURE_INVALID', 'We could not confirm this payment. If money was taken, it will be confirmed automatically or refunded.');
  }
  return toPayment(await markPaid(p, input.razorpay_payment_id, 'checkout', req));
}

// Razorpay webhook (payment.captured / order.paid / payment.failed), verified with the webhook secret on the raw body.
export async function handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
  if (!webhookSecret() || !rawBody || !signature || !safeEqual(hmac(webhookSecret(), rawBody), signature)) throw new ApiError(400, 'BAD_SIGNATURE', 'Invalid webhook signature');
  const event = JSON.parse(rawBody.toString('utf8')) as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; error_description?: string } } } };
  const entity = event.payload?.payment?.entity;
  if (!entity?.order_id) return { handled: false };
  const p = (await PaymentModel.findOne({ razorpayOrderId: entity.order_id }).lean()) as Lean | null;
  if (!p) return { handled: false };
  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    await markPaid(p, entity.id ?? '', 'webhook');
    return { handled: true };
  }
  if (event.event === 'payment.failed') {
    await PaymentModel.updateOne({ _id: p._id, status: 'pending' }, { $set: { status: 'failed', failureReason: (entity.error_description ?? 'Payment failed').slice(0, 300) } });
    return { handled: true };
  }
  return { handled: false };
}
