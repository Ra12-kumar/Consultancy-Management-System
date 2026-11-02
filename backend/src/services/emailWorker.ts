import { env } from '../config/env.js';
import { getMailTransport } from '../config/mail.js';
import { EmailDeliveryModel } from '../models/EmailDelivery.js';
import { decrypt } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import { renderEmail, type TemplateName } from './emailTemplates.js';

// Sends queued emails from the MongoDB outbox (collection emailDeliveryLogs).
// - Prompt: woken right after each enqueue; also polls every 10 s for retries.
// - Reliable across restarts: the queue is in MongoDB (not an in-memory queue). It is not BullMQ/Redis; one
//   message is claimed by one worker at a time through an atomic update, so several servers are safe.
// - Retries with bounded backoff; after MAX_ATTEMPTS the message is marked failed.

export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const LOCK_MS = 60_000;

let timer: NodeJS.Timeout | null = null;
let running = false;
let again = false;
let lastDigestCheck = 0;

const sanitize = (msg: string) => msg.replace(/xsmtpsib-[A-Za-z0-9-]+|xkeysib-[A-Za-z0-9-]+/g, '[key]').slice(0, 300);

// Sends every due message once. Returns how many were processed (for tests).
export async function processEmailQueue(now = new Date()) {
  let processed = 0;
  for (;;) {
    const msg = await EmailDeliveryModel.findOneAndUpdate(
      { status: { $in: ['queued', 'retrying'] }, nextAttemptAt: { $lte: now }, $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] },
      { $set: { status: 'sending', lockedUntil: new Date(now.getTime() + LOCK_MS) }, $inc: { attempts: 1 } },
      { new: true, sort: { nextAttemptAt: 1 } },
    )
      .select('+secretParams')
      .lean();
    if (!msg) return processed;
    processed += 1;

    const secrets = msg.secretParams ? (JSON.parse(decrypt(msg.secretParams)) as Record<string, string>) : {};
    const rendered = renderEmail(msg.template as TemplateName, { ...(msg.params as Record<string, string>), ...secrets });
    const transport = getMailTransport();

    if (!transport) {
      // Email not configured: recorded honestly as not sent. Development prints the action link for testing.
      await EmailDeliveryModel.updateOne({ _id: msg._id }, { $set: { status: 'not_sent_unconfigured', lockedUntil: null, lastError: `Email not configured (missing ${env.smtpMissing.join(', ')})` } });
      if (!env.isProduction) logger.warn({ to: msg.to, template: msg.template, link: secrets.link ?? null }, 'Email NOT sent (SMTP not configured); link shown here for local testing');
      continue;
    }
    try {
      const { messageId, response } = await transport.send({ to: msg.to, subject: rendered.subject, html: rendered.html, text: rendered.text });
      await EmailDeliveryModel.updateOne({ _id: msg._id }, { $set: { status: 'sent', sentAt: new Date(), providerMessageId: messageId, lockedUntil: null, lastError: '' } });
      // "sent" means the provider accepted it; Brevo's own logs show whether the mailbox received it.
      logger.info({ template: msg.template, messageId, providerResponse: response ?? null }, 'Email accepted by provider');
    } catch (err) {
      const e = err as { responseCode?: number; message?: string; permanent?: boolean };
      const attempts = msg.attempts;
      // Permanent rejections (bad recipient, auth or sender refused) are not retried for ever.
      const permanent = e.permanent || (e.responseCode != null && e.responseCode >= 500 && e.responseCode !== 535) ? attempts >= 2 : false;
      const failed = permanent || attempts >= MAX_ATTEMPTS;
      const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)]!;
      await EmailDeliveryModel.updateOne(
        { _id: msg._id },
        { $set: { status: failed ? 'failed' : 'retrying', lockedUntil: null, lastError: sanitize(`${e.responseCode ?? ''} ${e.message ?? 'Send failed'}`.trim()), nextAttemptAt: new Date(now.getTime() + delay) } },
      );
      logger.warn({ template: msg.template, attempts, failed, providerStatus: e.responseCode ?? null, reason: sanitize(e.message ?? '') }, 'Email send failed');
    }
  }
}

async function run() {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    if (Date.now() - lastDigestCheck > 10 * 60_000) {
      lastDigestCheck = Date.now();
      await (await import('./counsellor.service.js')).sendFollowUpDigests();
    }
    do {
      again = false;
      await processEmailQueue();
    } while (again);
  } catch (err) {
    logger.error({ err: { name: (err as Error).name, message: (err as Error).message } }, 'Email worker run failed');
  } finally {
    running = false;
  }
}

// Wakes the worker now (after an enqueue). Does nothing in tests, which call processEmailQueue() directly.
export function kickEmailWorker() {
  if (env.isTest || !timer) return;
  setImmediate(() => void run());
}

export function startEmailWorker(intervalMs = 10_000) {
  if (timer) return stopEmailWorker;
  timer = setInterval(() => void run(), intervalMs);
  timer.unref();
  void run();
  return stopEmailWorker;
}

export function stopEmailWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}
