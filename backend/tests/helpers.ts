import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { setMailTransport, type MailMessage } from '../src/config/mail.js';
import { processEmailQueue } from '../src/services/emailWorker.js';
import { clearMemo } from '../src/services/cache.service.js';
import { invalidateDirectoryCache } from '../src/services/directory/cache.js';

export const ORIGIN = 'http://localhost:3000';
export const PASSWORD = 'Str0ng-pass-2026';
export const app = createApp();

// Emails "sent" during a test (a stub transport instead of Brevo).
export const outbox: MailMessage[] = [];
export let failNextSends = 0;
export const failSends = (n: number) => (failNextSends = n);

export function useTestDb() {
  beforeAll(async () => {
    expect(env.MONGODB_URI).toMatch(/\/education_consultancy_test(\?|$)/);
    await connectDatabase(env.MONGODB_URI, { attempts: 1 });
    await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  });
  beforeEach(async () => {
    // Raw driver deletes (audit records are append-only even for test code going through Mongoose).
    const collections = await mongoose.connection.db!.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
    outbox.length = 0;
    invalidateDirectoryCache();
    clearMemo();
    failNextSends = 0;
    setMailTransport({
      async send(m) {
        if (failNextSends > 0) {
          failNextSends -= 1;
          throw Object.assign(new Error('Temporary SMTP failure'), { responseCode: 421 });
        }
        outbox.push(m);
        return { messageId: `<test-${outbox.length}@brevo>` };
      },
    });
  });
  afterAll(async () => {
    setMailTransport(null);
    await disconnectDatabase();
  });
}

// Sends queued emails and returns the token from the last link in an email to `to` for `path`.
export async function tokenFromEmail(to: string, path: string) {
  await processEmailQueue();
  const mail = [...outbox].reverse().find((m) => m.to === to && m.text.includes(path));
  expect(mail, `no email to ${to} containing ${path}`).toBeTruthy();
  return new URL(mail!.text.match(/https?:\/\/\S+/g)!.find((u) => u.includes(path))!).searchParams.get('token')!;
}

// Sends queued emails and returns the 6-digit code from the latest email to `to` that contains one.
export async function codeFromEmail(to: string) {
  await processEmailQueue();
  const mail = [...outbox].reverse().find((m) => m.to === to && /Your code: \d{6}/.test(m.text));
  expect(mail, `no email with a code to ${to}`).toBeTruthy();
  return mail!.text.match(/Your code: (\d{6})/)![1]!;
}

// A browser-like client: keeps cookies and sends our Origin on writes.
export function client() {
  const agent = request.agent(app);
  const withOrigin = (r: request.Test) => r.set('Origin', ORIGIN);
  return {
    agent,
    get: (url: string) => agent.get(url),
    post: (url: string, body?: object) => withOrigin(agent.post(url)).send(body ?? {}),
    put: (url: string, body?: object) => withOrigin(agent.put(url)).send(body ?? {}),
    patch: (url: string, body?: object) => withOrigin(agent.patch(url)).send(body ?? {}),
    del: (url: string) => withOrigin(agent.delete(url)),
  };
}

let n = 0;
export async function registerStudent({ verify = true, name = 'Priya Sharma' }: { verify?: boolean; name?: string } = {}) {
  n += 1;
  const email = `student${n}-${Date.now()}@example.com`;
  const c = client();
  const res = await c.post('/api/auth/register', { name, email, mobile: `98765${String(10000 + n).slice(-5)}`, password: PASSWORD });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  // Verifying the emailed code signs the student in.
  expect((await c.post('/api/auth/verify-otp', { email, code: await codeFromEmail(email) })).status).toBe(200);
  const me = await c.get('/api/auth/me');
  // An account whose email is not (or no longer) verified, e.g. a session from before verification was required.
  if (!verify) {
    const { UserModel } = await import('../src/models/User.js');
    await UserModel.updateOne({ _id: me.body.data.user.id }, { $set: { emailVerifiedAt: null } });
  }
  return { c, email, id: me.body.data.user.id as string };
}

export async function createAdmin(email = `admin-${Date.now()}@example.com`, permissions?: string[]) {
  const { bootstrapFirstAdmin } = await import('../src/services/admin.service.js');
  const { UserModel } = await import('../src/models/User.js');
  const { user } = await bootstrapFirstAdmin({ name: 'Asha Admin', email });
  if (permissions) await UserModel.updateOne({ _id: user.id }, { $set: { permissions } });
  const c = client();
  expect((await c.post('/api/auth/set-password', { token: await tokenFromEmail(email, '/set-password'), password: PASSWORD })).status).toBe(200);
  expect((await c.post('/api/auth/login', { email, password: PASSWORD })).status).toBe(200);
  return { c, email, id: user.id };
}

// A further admin with only the given permissions (created directly; the invitation flow is tested elsewhere).
export async function createLimitedAdmin(permissions: string[]) {
  const { UserModel } = await import('../src/models/User.js');
  const { hashPassword } = await import('../src/utils/password.js');
  n += 1;
  const email = `limited${n}-${Date.now()}@example.com`;
  await UserModel.create({ name: 'Limited Admin', email, role: 'admin', permissions, passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date() });
  const c = client();
  expect((await c.post('/api/auth/login', { email, password: PASSWORD })).status).toBe(200);
  return { c, email };
}
