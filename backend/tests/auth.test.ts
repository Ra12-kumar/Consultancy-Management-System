import { describe, expect, it } from 'vitest';
import { AuthTokenModel } from '../src/models/AuthToken.js';
import { SessionModel } from '../src/models/Session.js';
import { UserModel } from '../src/models/User.js';
import { PASSWORD, client, outbox, registerStudent, tokenFromEmail, useTestDb } from './helpers.js';
import { processEmailQueue } from '../src/services/emailWorker.js';

useTestDb();

const valid = (email = 'ravi@example.com') => ({ name: 'Ravi Kumar', email, mobile: '+91 98765 43210', password: PASSWORD });

describe('registration', () => {
  it('creates a student (never an admin), hashes the password and emails a verification link', async () => {
    const c = client();
    const res = await c.post('/api/auth/register', valid('Ravi@Example.com'));
    expect(res.status).toBe(201);
    const user = await UserModel.findOne({ email: 'ravi@example.com' }).select('+passwordHash').lean();
    expect(user).toMatchObject({ role: 'student', mobile: '+919876543210', emailVerifiedAt: null });
    expect(user!.passwordHash).toMatch(/^\$argon2id\$/);
    await processEmailQueue();
    expect(outbox[0]).toMatchObject({ to: 'ravi@example.com', subject: expect.stringContaining('verify') });
    expect(outbox[0]!.html).toContain('/verify-email?token=');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
  });

  it('refuses a role field and invalid input with 422', async () => {
    const c = client();
    const smuggled = await c.post('/api/auth/register', { ...valid(), role: 'admin' });
    expect(smuggled.status).toBe(422);
    expect(await UserModel.countDocuments()).toBe(0);
    const bad = await c.post('/api/auth/register', { name: 'R', email: 'nope', mobile: '123', password: 'short' });
    expect(bad.status).toBe(422);
    expect([...new Set(bad.body.error.details.map((d: { field: string }) => d.field))].sort()).toEqual(['email', 'mobile', 'name', 'password']);
  });

  it('answers a duplicate email exactly like a new one, creates no second account, and tells the owner', async () => {
    const c = client();
    const first = await c.post('/api/auth/register', valid());
    const second = await c.post('/api/auth/register', { ...valid(), name: 'Someone Else' });
    expect(second.status).toBe(first.status);
    expect(second.body).toEqual(first.body);
    expect(await UserModel.countDocuments({ email: 'ravi@example.com' })).toBe(1);
    await processEmailQueue();
    expect(outbox.map((m) => m.subject)).toEqual(expect.arrayContaining([expect.stringContaining('someone tried to register')]));
  });
});

describe('email verification', () => {
  it('verifies once with a valid link; the link cannot be reused or guessed', async () => {
    const c = client();
    await c.post('/api/auth/register', valid());
    const token = await tokenFromEmail('ravi@example.com', '/verify-email');
    expect((await c.post('/api/auth/verify-email', { token })).body.data.user.emailVerified).toBe(true);
    expect((await c.post('/api/auth/verify-email', { token })).body.error.code).toBe('INVALID_TOKEN');
    expect((await c.post('/api/auth/verify-email', { token: 'x'.repeat(43) })).status).toBe(400);
  });

  it('refuses an expired link and sends a new one on request (same answer for unknown emails)', async () => {
    const c = client();
    await c.post('/api/auth/register', valid());
    const token = await tokenFromEmail('ravi@example.com', '/verify-email');
    await AuthTokenModel.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await c.post('/api/auth/verify-email', { token })).status).toBe(400);
    const known = await c.post('/api/auth/resend-verification', { email: 'ravi@example.com' });
    const unknown = await c.post('/api/auth/resend-verification', { email: 'nobody@example.com' });
    expect(known.body).toEqual(unknown.body);
    const fresh = await tokenFromEmail('ravi@example.com', '/verify-email');
    expect(fresh).not.toBe(token);
    expect((await c.post('/api/auth/verify-email', { token: fresh })).status).toBe(200);
  });
});

describe('sign-in and sessions', () => {
  it('signs in with a HttpOnly session cookie, and gives one generic error for wrong email or password', async () => {
    const c = client();
    await c.post('/api/auth/register', valid());
    const ok = await c.post('/api/auth/login', { email: 'ravi@example.com', password: PASSWORD });
    expect(ok.status).toBe(200);
    const cookie = ok.headers['set-cookie']![0]!;
    expect(cookie).toMatch(/^ec_sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect((await c.get('/api/auth/me')).body.data.user).toMatchObject({ email: 'ravi@example.com', role: 'student' });

    const wrongPassword = await client().post('/api/auth/login', { email: 'ravi@example.com', password: 'Wrong-pass-123' });
    const noAccount = await client().post('/api/auth/login', { email: 'ghost@example.com', password: 'Wrong-pass-123' });
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body).toEqual(noAccount.body);
  });

  it('locks the account after 10 failed attempts', async () => {
    const c = client();
    await c.post('/api/auth/register', valid());
    for (let i = 0; i < 10; i += 1) await client().post('/api/auth/login', { email: 'ravi@example.com', password: 'Wrong-pass-123' });
    const locked = await client().post('/api/auth/login', { email: 'ravi@example.com', password: PASSWORD });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('logout ends the session on the server; logout-all ends every device', async () => {
    const { c, email } = await registerStudent();
    expect((await c.post('/api/auth/logout')).status).toBe(200);
    expect((await c.get('/api/auth/me')).status).toBe(401);

    const a = client();
    const b = client();
    await a.post('/api/auth/login', { email, password: PASSWORD });
    await b.post('/api/auth/login', { email, password: PASSWORD });
    await a.post('/api/auth/logout-all');
    expect((await b.get('/api/auth/me')).status).toBe(401);
    expect(await SessionModel.countDocuments()).toBe(0);
  });

  it('refuses cookie-authenticated writes from another site (CSRF)', async () => {
    const { c } = await registerStudent();
    const forged = await c.agent.patch('/api/students/me').set('Origin', 'https://evil.example').send({ name: 'Hacked Name' });
    expect(forged.status).toBe(403);
    expect(forged.body.error.code).toBe('CSRF_REJECTED');
    const noOrigin = await c.agent.patch('/api/students/me').send({ name: 'Hacked Name' });
    expect(noOrigin.status).toBe(403);
  });
});

describe('password reset and change', () => {
  it('resets with a single-use link, ends all sessions, and confirms by email', async () => {
    const { c, email } = await registerStudent();
    const generic = await client().post('/api/auth/forgot-password', { email: 'ghost@example.com' });
    const real = await client().post('/api/auth/forgot-password', { email });
    expect(real.body).toEqual(generic.body);
    const token = await tokenFromEmail(email, '/reset-password');
    expect((await client().post('/api/auth/reset-password', { token, password: 'New-pass-2026x' })).status).toBe(200);
    expect((await client().post('/api/auth/reset-password', { token, password: 'Other-pass-2026' })).status).toBe(400);
    expect((await c.get('/api/auth/me')).status).toBe(401);
    expect((await client().post('/api/auth/login', { email, password: PASSWORD })).status).toBe(401);
    expect((await client().post('/api/auth/login', { email, password: 'New-pass-2026x' })).status).toBe(200);
    await processEmailQueue();
    expect(outbox.some((m) => m.to === email && m.subject.includes('password was changed'))).toBe(true);
  });

  it('refuses an expired reset link', async () => {
    const { email } = await registerStudent();
    await client().post('/api/auth/forgot-password', { email });
    const token = await tokenFromEmail(email, '/reset-password');
    await AuthTokenModel.updateMany({ type: 'reset_password' }, { $set: { expiresAt: new Date(Date.now() - 1) } });
    expect((await client().post('/api/auth/reset-password', { token, password: 'New-pass-2026x' })).body.error.code).toBe('INVALID_TOKEN');
  });

  it('changes the password with the current one; other devices are signed out', async () => {
    const { c, email } = await registerStudent();
    const other = client();
    await other.post('/api/auth/login', { email, password: PASSWORD });
    expect((await c.post('/api/auth/change-password', { currentPassword: 'wrong', newPassword: 'New-pass-2026x' })).status).toBe(422);
    expect((await c.post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'New-pass-2026x' })).status).toBe(200);
    expect((await c.get('/api/auth/me')).status).toBe(200);
    expect((await other.get('/api/auth/me')).status).toBe(401);
  });
});
