import { describe, expect, it } from 'vitest';
import { setMailTransport } from '../src/config/mail.js';
import { EmailDeliveryModel } from '../src/models/EmailDelivery.js';
import { enqueueEmail } from '../src/services/email.service.js';
import { MAX_ATTEMPTS, RETRY_DELAYS_MS, processEmailQueue } from '../src/services/emailWorker.js';
import { createAdmin, failSends, outbox, useTestDb } from './helpers.js';

useTestDb();

const queue = (dedupeKey = 'test:1') => enqueueEmail({ to: 'meera@example.com', template: 'verify_email', params: { name: 'Meera' }, secretParams: { link: 'http://localhost:3000/verify-email?token=SECRET_TOKEN_VALUE' }, dedupeKey });

describe('email outbox', () => {
  it('sends a queued email once and records the provider message id', async () => {
    await queue();
    expect(await processEmailQueue()).toBe(1);
    const d = await EmailDeliveryModel.findOne().lean();
    expect(d).toMatchObject({ status: 'sent', attempts: 1, providerMessageId: '<test-1@brevo>' });
    expect(outbox[0]!.html).toContain('SECRET_TOKEN_VALUE');
    expect(outbox[0]!.text).toContain('SECRET_TOKEN_VALUE');
    expect(await processEmailQueue()).toBe(0);
  });

  it('never queues the same event twice (dedupe key)', async () => {
    expect(await queue('same')).toBe(true);
    expect(await queue('same')).toBe(false);
    expect(await EmailDeliveryModel.countDocuments()).toBe(1);
  });

  it('keeps token links encrypted at rest (not readable in the database or the admin log)', async () => {
    await queue();
    const raw = await EmailDeliveryModel.collection.findOne({});
    expect(JSON.stringify(raw)).not.toContain('SECRET_TOKEN_VALUE');
    const { c } = await createAdmin();
    const log = await c.get('/api/admin/email/deliveries');
    expect(JSON.stringify(log.body)).not.toMatch(/SECRET_TOKEN_VALUE|token=/);
  });

  it('retries with growing delays after provider failures, then succeeds', async () => {
    await queue();
    failSends(2);
    const t0 = new Date();
    await processEmailQueue(t0);
    let d = await EmailDeliveryModel.findOne().lean();
    expect(d).toMatchObject({ status: 'retrying', attempts: 1 });
    expect(d!.nextAttemptAt.getTime() - t0.getTime()).toBe(RETRY_DELAYS_MS[0]);
    expect(await processEmailQueue(t0)).toBe(0); // not due yet

    const t1 = new Date(d!.nextAttemptAt.getTime() + 1);
    await processEmailQueue(t1);
    d = await EmailDeliveryModel.findOne().lean();
    expect(d).toMatchObject({ status: 'retrying', attempts: 2 });
    expect(d!.nextAttemptAt.getTime() - t1.getTime()).toBe(RETRY_DELAYS_MS[1]);

    await processEmailQueue(new Date(d!.nextAttemptAt.getTime() + 1));
    expect(await EmailDeliveryModel.findOne().lean()).toMatchObject({ status: 'sent', attempts: 3 });
  });

  it('marks a message failed after the maximum attempts', async () => {
    await queue();
    failSends(100);
    let now = new Date();
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      await processEmailQueue(now);
      const d = await EmailDeliveryModel.findOne().lean();
      now = new Date(d!.nextAttemptAt.getTime() + 1);
    }
    expect(await EmailDeliveryModel.findOne().lean()).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS });
  });

  it('without SMTP configured, records the email as not sent (never as sent)', async () => {
    setMailTransport(null);
    await queue();
    await processEmailQueue();
    expect(await EmailDeliveryModel.findOne().lean()).toMatchObject({ status: 'not_sent_unconfigured', providerMessageId: null });
  });

  it('a slow or failing provider never blocks registration', async () => {
    failSends(100);
    const { client } = await import('./helpers.js');
    const res = await client().post('/api/auth/register', { name: 'Kiran Rao', email: 'kiran@example.com', mobile: '9876512345', password: 'Str0ng-pass-2026' });
    expect(res.status).toBe(201);
    expect(await EmailDeliveryModel.countDocuments({ to: 'kiran@example.com', status: 'queued' })).toBe(1);
  });
});
