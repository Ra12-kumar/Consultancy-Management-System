import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

// Email transport: Brevo's SMTP relay (or any SMTP server) when every SMTP setting is present.
// Otherwise email is "log-only": messages are recorded as not sent and, in development, their action links
// are written to the server log so the flows stay testable. Nothing is ever reported as sent when it was not.

export type MailMessage = { to: string; subject: string; html: string; text: string };
// `response` is the provider's acceptance reply (e.g. "250 OK: queued as …"). Acceptance is not delivery.
export type MailResult = { messageId: string | null; response?: string };
export interface MailTransport {
  send(message: MailMessage): Promise<MailResult>;
}

let transporter: Transporter | null = null;
let override: MailTransport | null = null;
let lastVerify: { ok: boolean; at: Date; error: string | null } | null = null;

export function mailStatus(): 'smtp' | 'log-only' {
  return env.smtpConfigured || override ? 'smtp' : 'log-only';
}

export function mailHealth() {
  return { mode: mailStatus(), missing: env.smtpConfigured ? [] : env.smtpMissing, lastVerify };
}

function smtp(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER!, pass: env.SMTP_PASS! },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  return transporter;
}

// The transport the email worker uses. Tests replace it with setMailTransport().
const BREVO_API = 'https://api.brevo.com/v3';

// Brevo transactional email over HTTPS. 4xx answers (bad key, unverified sender, bad recipient) are permanent.
async function brevoSend({ to, subject, html, text }: MailMessage): Promise<MailResult> {
  const res = await fetch(`${BREVO_API}/smtp/email`, {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { name: env.EMAIL_FROM_NAME, email: env.EMAIL_FROM }, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { messageId?: string; code?: string; message?: string };
  if (!res.ok) {
    // Brevo error bodies describe the problem without echoing the key.
    throw Object.assign(new Error(`Brevo API ${res.status}: ${body.code ?? ''} ${(body.message ?? '').slice(0, 150)}`.trim()), { responseCode: res.status, permanent: res.status >= 400 && res.status < 500 && res.status !== 429 });
  }
  return { messageId: body.messageId ?? null, response: `${res.status} accepted by Brevo` };
}

export function getMailTransport(): MailTransport | null {
  if (override) return override;
  if (!env.smtpConfigured) return null;
  if (env.brevoApi) return { send: brevoSend };
  return {
    async send({ to, subject, html, text }) {
      const info = await smtp().sendMail({ from: { name: env.EMAIL_FROM_NAME, address: env.EMAIL_FROM! }, to, subject, html, text });
      return { messageId: info.messageId ?? null, response: String(info.response ?? '').slice(0, 120) };
    },
  };
}

export function setMailTransport(t: MailTransport | null) {
  override = t;
}

// Checks the SMTP login (nothing is sent). The reason is kept for the admin email page, without secrets.
export async function verifyMailTransport() {
  if (!env.smtpConfigured) {
    lastVerify = { ok: false, at: new Date(), error: `Email not configured (missing ${env.smtpMissing.join(', ')})` };
    logger.warn({ missing: env.smtpMissing }, 'Email is not configured: messages are logged, not sent');
    return lastVerify;
  }
  if (env.brevoApi) {
    // Checks the API key without sending anything.
    try {
      const res = await fetch(`${BREVO_API}/account`, { headers: { 'api-key': env.BREVO_API_KEY!, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
      lastVerify = { ok: res.ok, at: new Date(), error: res.ok ? null : `Brevo API key check failed (${res.status})` };
    } catch (err) {
      lastVerify = { ok: false, at: new Date(), error: `Brevo check failed: ${(err as Error).message.slice(0, 120)}` };
    }
    if (lastVerify.ok) logger.info({ provider: 'brevo-api', sender: env.EMAIL_FROM }, 'Brevo API key accepted');
    else logger.error({ reason: lastVerify.error }, 'Brevo API check failed');
    return lastVerify;
  }
  try {
    await smtp().verify();
    lastVerify = { ok: true, at: new Date(), error: null };
    logger.info({ host: env.SMTP_HOST }, 'SMTP login accepted');
  } catch (err) {
    const e = err as { code?: string; responseCode?: number; message?: string };
    const reason = e.responseCode === 535 ? 'SMTP login rejected (check SMTP_USER and SMTP_PASS)' : `${e.code ?? 'SMTP error'}: ${(e.message ?? '').slice(0, 120)}`;
    lastVerify = { ok: false, at: new Date(), error: reason };
    logger.error({ reason }, 'SMTP check failed');
  }
  return lastVerify;
}
