import mongoose from 'mongoose';

export const EMAIL_STATUSES = ['queued', 'sending', 'sent', 'retrying', 'failed', 'not_sent_unconfigured'] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

// The email outbox and delivery log in one: every notification is stored here first, then sent by the worker
// (services/emailWorker.ts) with retries. Message bodies are rendered at send time from the template name and
// params; links containing tokens are kept only in `secretParams`, encrypted.
const emailDeliverySchema = new mongoose.Schema(
  {
    to: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    template: { type: String, required: true, maxlength: 60 },
    subject: { type: String, required: true, maxlength: 200 },
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
    secretParams: { type: String, default: null, select: false },
    status: { type: String, enum: EMAIL_STATUSES, default: 'queued', required: true },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: () => new Date() },
    lockedUntil: { type: Date, default: null },
    lastError: { type: String, maxlength: 300, default: '' },
    providerMessageId: { type: String, maxlength: 200, default: null },
    sentAt: { type: Date, default: null },
    // Once-only key per event (e.g. "verify:<tokenId>").
    dedupeKey: { type: String, required: true, maxlength: 160 },
    relatedType: { type: String, maxlength: 40, default: null },
    relatedId: { type: String, maxlength: 60, default: null },
  },
  { timestamps: true },
);
emailDeliverySchema.index({ dedupeKey: 1 }, { unique: true, name: 'email_dedupe_unique' });
emailDeliverySchema.index({ status: 1, nextAttemptAt: 1 }, { name: 'email_due' });
emailDeliverySchema.index({ createdAt: -1 }, { name: 'email_recent' });

export const EmailDeliveryModel = mongoose.model('EmailDelivery', emailDeliverySchema, 'emailDeliveryLogs');
