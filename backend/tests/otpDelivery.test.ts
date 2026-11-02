import { describe, expect, it } from 'vitest';
import { setMailTransport } from '../src/config/mail.js';
import { EmailDeliveryModel } from '../src/models/EmailDelivery.js';
import { processEmailQueue } from '../src/services/emailWorker.js';
import { client, codeFromEmail, outbox, useTestDb } from './helpers.js';

useTestDb();

const KEY = 'xsmtpsib-0123456789abcdef0123456789abcdef-AbCdEfGh';
const student = (email: string) => ({ name: 'Kiran Rao', email, mobile: '9876512345', password: 'Str0ng-pass-2026' });

// A provider stub that fails with the given error once, then behaves like the normal test transport.
function providerFails(error: Error & { responseCode?: number; code?: string }) {
  let failed = false;
  setMailTransport({
    async send(m) {
      if (!failed) {
        failed = true;
        throw error;
      }
      outbox.push(m);
      return { messageId: '<ok@brevo>', response: '250 2.0.0 OK: queued' };
    },
  });
}

describe('OTP delivery status', () => {
  it('says codes are sent only when email delivery is configured', async () => {
    let res = await client().get('/api/auth/email-delivery');
    expect(res.body.data).toEqual({ available: true });
    res = await client().post('/api/auth/register', student('kiran@example.com'));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ emailDelivery: true, message: expect.stringMatching(/sent a 6-digit code/) });

    setMailTransport(null);
    res = await client().get('/api/auth/email-delivery');
    expect(res.body.data).toEqual({ available: false });
    res = await client().post('/api/auth/register', student('asha@example.com'));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ emailDelivery: false, message: expect.stringMatching(/could not email your code/) });
    expect(res.body.data.message).not.toMatch(/We have sent/);
    res = await client().post('/api/auth/resend-verification', { email: 'asha@example.com' });
    expect(res.body.data).toMatchObject({ emailDelivery: false });

    // Recorded honestly as not sent; the code is never in the outbox record or the response.
    await processEmailQueue();
    const d = await EmailDeliveryModel.findOne({ to: 'asha@example.com' }).select('+secretParams').lean();
    expect(d).toMatchObject({ status: 'not_sent_unconfigured', providerMessageId: null });
    expect(Object.keys(res.body.data).sort()).toEqual(['emailDelivery', 'message']);
    expect(String(d!.secretParams)).not.toMatch(/"code"/);
  });

  it('records the provider acceptance id; acceptance is stored as "sent", not as delivered', async () => {
    await client().post('/api/auth/register', student('kiran@example.com'));
    const code = await codeFromEmail('kiran@example.com');
    expect(code).toMatch(/^\d{6}$/);
    const d = await EmailDeliveryModel.findOne({ to: 'kiran@example.com' }).lean();
    expect(d).toMatchObject({ template: 'welcome_verify', status: 'sent', providerMessageId: expect.any(String) });
  });

  it('invalid credentials (535) and network timeouts are retried, with the reason kept and no key leaked', async () => {
    providerFails(Object.assign(new Error(`Invalid login: 535 5.7.8 Authentication failed for ${KEY}`), { responseCode: 535 }));
    await client().post('/api/auth/register', student('kiran@example.com'));
    await processEmailQueue();
    let d = await EmailDeliveryModel.findOne({ to: 'kiran@example.com' }).lean();
    expect(d).toMatchObject({ status: 'retrying', attempts: 1 });
    expect(d!.lastError).toMatch(/535/);
    expect(d!.lastError).not.toContain(KEY);

    // The retry succeeds once the provider recovers.
    await processEmailQueue(new Date(d!.nextAttemptAt.getTime() + 1));
    d = await EmailDeliveryModel.findOne({ to: 'kiran@example.com' }).lean();
    expect(d).toMatchObject({ status: 'sent', attempts: 2 });

    providerFails(Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT' }));
    await client().post('/api/auth/register', student('asha@example.com'));
    await processEmailQueue();
    expect(await EmailDeliveryModel.findOne({ to: 'asha@example.com' }).lean()).toMatchObject({ status: 'retrying', lastError: expect.stringMatching(/timeout/) });
  });

  it('a permanent provider rejection (bad recipient or unverified sender) ends as failed, not sent', async () => {
    setMailTransport({
      async send() {
        throw Object.assign(new Error('550 5.7.1 Sender address rejected: not verified'), { responseCode: 550 });
      },
    });
    await client().post('/api/auth/register', student('kiran@example.com'));
    await processEmailQueue();
    let d = await EmailDeliveryModel.findOne({ to: 'kiran@example.com' }).lean();
    await processEmailQueue(new Date(d!.nextAttemptAt.getTime() + 1));
    d = await EmailDeliveryModel.findOne({ to: 'kiran@example.com' }).lean();
    expect(d).toMatchObject({ status: 'failed', attempts: 2, providerMessageId: null });
    expect(d!.lastError).toMatch(/550/);
  });

  it('rejects malformed codes and email addresses before any lookup', async () => {
    expect((await client().post('/api/auth/verify-otp', { email: 'kiran@example.com', code: '12ab56' })).status).toBe(422);
    expect((await client().post('/api/auth/verify-otp', { email: 'not-an-email', code: '123456' })).status).toBe(422);
    expect((await client().post('/api/auth/register', student('not-an-email'))).status).toBe(422);
  });
});
