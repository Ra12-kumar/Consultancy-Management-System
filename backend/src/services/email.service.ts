import { EmailDeliveryModel } from '../models/EmailDelivery.js';
import { encrypt } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import { renderEmail, type TemplateName } from './emailTemplates.js';
import { kickEmailWorker } from './emailWorker.js';

type Enqueue = {
  to: string;
  template: TemplateName;
  // Shown in the delivery log (names only; never secrets).
  params: Record<string, string>;
  // Links with tokens: encrypted at rest, never shown in the admin UI.
  secretParams?: Record<string, string>;
  // Once-only key for this event: the same event never creates a second email.
  dedupeKey: string;
  related?: { type: string; id: string };
};

// Puts an email in the outbox and wakes the worker. Never throws for delivery problems, and never makes the
// caller wait for the email provider: the user's action has already succeeded.
export async function enqueueEmail({ to, template, params, secretParams, dedupeKey, related }: Enqueue) {
  const { subject } = renderEmail(template, { ...params, ...(secretParams ?? {}) });
  try {
    await EmailDeliveryModel.create({
      to,
      template,
      subject,
      params,
      secretParams: secretParams ? encrypt(JSON.stringify(secretParams)) : null,
      dedupeKey,
      relatedType: related?.type ?? null,
      relatedId: related?.id ?? null,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return false; // already queued for this event
    logger.error({ err: { name: (err as Error).name, message: (err as Error).message }, template }, 'Could not queue email');
    return false;
  }
  kickEmailWorker();
  return true;
}
