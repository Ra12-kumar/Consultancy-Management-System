import mongoose from 'mongoose';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionModel } from '../src/models/Session.js';
import { UserModel } from '../src/models/User.js';
import { emailDomainAcceptsMail, setDomainResolver, type DomainResolver } from '../src/utils/emailDomain.js';
import { client, codeFromEmail, createAdmin, outbox, registerStudent, useTestDb } from './helpers.js';

useTestDb();

const PASSWORD = 'Str0ng-pass-2026';
const body = (email: string, extra: object = {}) => ({ name: 'Kiran Rao', email, mobile: '9876512345', password: PASSWORD, ...extra });
const err = (code: string) => Object.assign(new Error(code), { code });

// A stub DNS: gmail.com has MX, nomx.in has only an address record, example.com has a null MX, the rest do not exist.
const dns: DomainResolver = {
  async resolveMx(d) {
    if (d === 'gmail.com') return [{ exchange: 'gmail-smtp-in.l.google.com', priority: 5 }];
    if (d === 'example.com') return [{ exchange: '', priority: 0 }];
    if (d === 'slow.in') throw err('ETIMEOUT');
    if (d === 'nomx.in') throw err('ENODATA');
    throw err('ENOTFOUND');
  },
  async resolve4(d) {
    if (d === 'nomx.in') return ['203.0.113.7'];
    throw err('ENODATA');
  },
  async resolve6() {
    throw err('ENODATA');
  },
};

afterEach(() => setDomainResolver(null));

describe('registration', () => {
  it('one email, one account: case and spaces are normalised, repeats and parallel requests create nothing more', async () => {
    expect((await client().post('/api/auth/register', body('Kiran.Rao@Example.com'))).status).toBe(201);
    const again = await client().post('/api/auth/register', body('  kiran.rao@EXAMPLE.COM '));
    expect(again.status).toBe(201); // same answer as a new email, so nobody can probe which emails have accounts
    const parallel = await Promise.all(Array.from({ length: 5 }, () => client().post('/api/auth/register', body('asha@example.com'))));
    expect(parallel.every((r) => r.status === 201)).toBe(true);
    expect(await UserModel.countDocuments({ email: 'kiran.rao@example.com' })).toBe(1);
    expect(await UserModel.countDocuments({ email: 'asha@example.com' })).toBe(1);
    // The owner is told by email that someone tried to register again.
    const { processEmailQueue } = await import('../src/services/emailWorker.js');
    await processEmailQueue();
    expect(outbox.some((m) => m.to === 'kiran.rao@example.com' && /already have an account|already registered/i.test(m.text))).toBe(true);
    // The database enforces it too, whatever the code does.
    const idx = await UserModel.collection.indexes();
    expect(idx.find((i) => i.name === 'user_email_unique')).toMatchObject({ unique: true, key: { email: 1 } });
    await expect(UserModel.collection.insertOne({ email: 'asha@example.com', name: 'X', role: 'student' })).rejects.toMatchObject({ code: 11000 });
  });

  it('checks email format, password strength and unknown fields on the server', async () => {
    for (const email of ['not-an-email', 'a@b', 'kiran@', '@example.com', 'kiran rao@example.com']) {
      const r = await client().post('/api/auth/register', body(email));
      expect(r.status, email).toBe(422);
      expect(r.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'email' })]));
    }
    for (const password of ['short1', 'onlyletterslong', '1234567890', 'kiran@example.com']) {
      const r = await client().post('/api/auth/register', body('kiran@example.com', { password }));
      expect(r.status, password).toBe(422);
    }
    expect((await client().post('/api/auth/register', body('kiran@example.com', { role: 'admin' }))).status).toBe(422);
    expect(await UserModel.countDocuments()).toBe(0);
  });

  it('refuses email domains that cannot receive mail, but never blocks sign-up when DNS is down', async () => {
    setDomainResolver(dns);
    for (const email of ['kiran@gmial.con', 'kiran@made-up-college-xyz.in', 'kiran@example.com']) {
      const r = await client().post('/api/auth/register', body(email));
      expect(r.status, email).toBe(422);
      expect(r.body.error.details[0]).toMatchObject({ field: 'email', message: expect.stringMatching(/cannot receive email/) });
    }
    expect(await UserModel.countDocuments()).toBe(0);
    expect((await client().post('/api/auth/register', body('kiran@gmail.com'))).status).toBe(201);
    expect(await emailDomainAcceptsMail('x@nomx.in')).toBe(true); // no MX but an address record: mail is possible
    expect(await emailDomainAcceptsMail('x@slow.in')).toBe(true); // DNS timeout: allowed
  });

  it('stores only an argon2 hash of the password', async () => {
    await client().post('/api/auth/register', body('kiran@example.com'));
    const u = await UserModel.findOne({ email: 'kiran@example.com' }).select('+passwordHash').lean();
    expect(u!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(u)).not.toContain(PASSWORD);
  });
});

describe('verification and sign-in', () => {
  it('no sign-in for unknown accounts or wrong passwords (one message); none until the emailed code is entered', async () => {
    const unknown = await client().post('/api/auth/login', { email: 'nobody@example.com', password: PASSWORD });
    const wrong = await (async () => {
      await client().post('/api/auth/register', body('kiran@example.com'));
      return client().post('/api/auth/login', { email: 'kiran@example.com', password: 'Wrong-pass-2026' });
    })();
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error).toEqual(wrong.body.error);
    expect(unknown.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' });

    // Right password, email not verified: no session.
    const c = client();
    const blocked = await c.post('/api/auth/login', { email: 'kiran@example.com', password: PASSWORD });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(blocked.headers['set-cookie']).toBeUndefined();
    expect((await c.get('/api/auth/me')).status).toBe(401);

    // A made-up code never verifies; the real one does, once.
    expect((await c.post('/api/auth/verify-otp', { email: 'kiran@example.com', code: '000000' })).status).toBe(400);
    const code = await codeFromEmail('kiran@example.com');
    expect((await c.post('/api/auth/verify-otp', { email: 'kiran@example.com', code })).status).toBe(200);
    expect((await client().post('/api/auth/verify-otp', { email: 'kiran@example.com', code })).status).toBe(400);
    const ok = await client().post('/api/auth/login', { email: 'KIRAN@example.com ', password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.headers['set-cookie']![0]).toMatch(/HttpOnly/i);
  });

  it('private APIs refuse visitors (401), the wrong role (403) and unverified students (403 on protected actions)', async () => {
    expect((await client().get('/api/students/me/profile')).status).toBe(401);
    expect((await client().get('/api/enquiries')).status).toBe(401);
    const { c } = await registerStudent();
    expect((await c.get('/api/admin/dashboard/summary')).status).toBe(403);
    const { c: unverified } = await registerStudent({ verify: false });
    const r = await unverified.post('/api/enquiries', { idempotencyKey: '7d0f8f0e-3c3b-4e8e-9b55-8c2a2f7e9a10' });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    const admin = await createAdmin();
    expect((await admin.c.get('/api/admin/dashboard/summary')).status).toBe(200);
  });

  it('logout ends the session on the server; expired sessions are refused', async () => {
    const { c, id } = await registerStudent();
    expect((await c.get('/api/auth/me')).status).toBe(200);
    expect((await c.post('/api/auth/logout')).status).toBe(200);
    expect((await c.get('/api/auth/me')).status).toBe(401);

    const again = await registerStudent();
    await SessionModel.updateMany({ user: new mongoose.Types.ObjectId(again.id) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await again.c.get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(id).not.toBe(again.id);
  });
});
