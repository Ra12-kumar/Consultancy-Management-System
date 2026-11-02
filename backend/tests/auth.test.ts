import { describe, expect, it } from 'vitest';
import { AuthTokenModel } from '../src/models/AuthToken.js';
import { EmailOtpModel } from '../src/models/EmailOtp.js';
import { SessionModel } from '../src/models/Session.js';
import { UserModel } from '../src/models/User.js';
import { PASSWORD, client, codeFromEmail, outbox, registerStudent, tokenFromEmail, useTestDb } from './helpers.js';
import { processEmailQueue } from '../src/services/emailWorker.js';

useTestDb();

const valid = (email = 'ravi@example.com') => ({ name: 'Ravi Kumar', email, mobile: '+91 98765 43210', password: PASSWORD });

// Verifies ravi@example.com with the emailed code (which also signs that client in).
const verified = async (c: ReturnType<typeof client>) => expect((await c.post('/api/auth/verify-otp', { email: 'ravi@example.com', code: await codeFromEmail('ravi@example.com') })).status).toBe(200);
const otherCode = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

describe('registration', () => {
  it('creates a student (never an admin), hashes the password, stores only a hash of the emailed code', async () => {
    const c = client();
    const res = await c.post('/api/auth/register', { ...valid('Ravi@Example.com'), qualification: 'class_12', preferredCourse: 'B.Tech', preferredLocation: 'Bengaluru' });
    expect(res.status).toBe(201);
    const user = await UserModel.findOne({ email: 'ravi@example.com' }).select('+passwordHash').lean();
    expect(user).toMatchObject({ role: 'student', mobile: '+919876543210', emailVerifiedAt: null });
    expect(user!.passwordHash).toMatch(/^\$argon2id\$/);
    const code = await codeFromEmail('ravi@example.com');
    expect(outbox[0]).toMatchObject({ to: 'ravi@example.com', subject: expect.stringContaining('verify') });
    expect(outbox[0]!.html).toContain(code);
    const otp = await EmailOtpModel.findOne({ user: user!._id }).lean();
    expect(otp!.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(otp)).not.toContain(code);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2|\d{6}/);
    // The optional academic details start the profile.
    await verified(c);
    expect((await c.get('/api/students/me/profile')).body.data).toMatchObject({ academic: { highestQualification: 'class_12' }, preferences: { course: 'B.Tech', location: 'Bengaluru' } });
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

describe('email verification by code', () => {
  it('only verified students can sign in; the code verifies once and signs the student in', async () => {
    const c = client();
    await c.post('/api/auth/register', valid());
    const code = await codeFromEmail('ravi@example.com');
    const blocked = await client().post('/api/auth/login', { email: 'ravi@example.com', password: PASSWORD });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(blocked.headers['set-cookie']).toBeUndefined();
    // A wrong password never reveals the verification state.
    expect((await client().post('/api/auth/login', { email: 'ravi@example.com', password: 'Wrong-pass-123' })).status).toBe(401);

    const ok = await c.post('/api/auth/verify-otp', { email: 'ravi@example.com', code });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ signedIn: true, user: { emailVerified: true, role: 'student' } });
    expect((await c.get('/api/auth/me')).status).toBe(200);
    expect((await client().post('/api/auth/verify-otp', { email: 'ravi@example.com', code })).body.error.code).toBe('INVALID_CODE');
    expect((await client().post('/api/auth/login', { email: 'ravi@example.com', password: PASSWORD })).status).toBe(200);
  });

  it('refuses expired codes, stops after 5 wrong guesses, and answers unknown emails the same way', async () => {
    const c = client();
    await c.post('/api/auth/register', valid());
    const code = await codeFromEmail('ravi@example.com');
    await EmailOtpModel.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await c.post('/api/auth/verify-otp', { email: 'ravi@example.com', code });
    const unknown = await c.post('/api/auth/verify-otp', { email: 'nobody@example.com', code });
    expect(expired.status).toBe(400);
    // Same error either way (each response carries its own random request id).
    expect(unknown.body.error).toEqual(expired.body.error);
    expect((await c.post('/api/auth/verify-otp', { email: 'ravi@example.com', code: '12ab56' })).status).toBe(422);

    // A new code (after the resend cooldown), then 5 wrong guesses make even the right code stop working.
    await EmailOtpModel.updateMany({}, { $set: { lastSentAt: new Date(Date.now() - 61_000) } });
    expect((await c.post('/api/auth/resend-verification', { email: 'ravi@example.com' })).status).toBe(200);
    const fresh = await codeFromEmail('ravi@example.com');
    for (let i = 0; i < 5; i += 1) expect((await c.post('/api/auth/verify-otp', { email: 'ravi@example.com', code: otherCode(fresh) })).status).toBe(400);
    expect((await c.post('/api/auth/verify-otp', { email: 'ravi@example.com', code: fresh })).status).toBe(400);
    expect(await UserModel.countDocuments({ emailVerifiedAt: { $ne: null } })).toBe(0);
  });

  it('resends at most once a minute, with the same answer for unknown emails; only the newest code works', async () => {
    const c = client();
    await c.post('/api/auth/register', valid());
    await processEmailQueue();
    const mails = () => outbox.filter((m) => m.to === 'ravi@example.com');
    expect(mails()).toHaveLength(1);
    const known = await c.post('/api/auth/resend-verification', { email: 'ravi@example.com' });
    const unknown = await c.post('/api/auth/resend-verification', { email: 'nobody@example.com' });
    expect(known.body).toEqual(unknown.body);
    await processEmailQueue();
    expect(mails()).toHaveLength(1); // still within the cooldown
    await EmailOtpModel.updateMany({}, { $set: { lastSentAt: new Date(Date.now() - 61_000) } });
    await c.post('/api/auth/resend-verification', { email: 'ravi@example.com' });
    await processEmailQueue();
    expect(mails()).toHaveLength(2);
    const [older, newer] = mails().map((m) => m.text.match(/Your code: (\d{6})/)![1]!);
    if (older !== newer) expect((await c.post('/api/auth/verify-otp', { email: 'ravi@example.com', code: older! })).status).toBe(400);
    expect((await c.post('/api/auth/verify-otp', { email: 'ravi@example.com', code: newer! })).status).toBe(200);
  });

  it('links from older verification emails still work once and cannot be guessed', async () => {
    const c = client();
    await c.post('/api/auth/register', valid());
    const user = await UserModel.findOne({ email: 'ravi@example.com' }).lean();
    const { issueToken } = await import('../src/services/token.service.js');
    const { token } = await issueToken(String(user!._id), 'verify_email');
    expect((await c.post('/api/auth/verify-email', { token })).body.data.user.emailVerified).toBe(true);
    expect((await c.post('/api/auth/verify-email', { token })).body.error.code).toBe('INVALID_TOKEN');
    expect((await c.post('/api/auth/verify-email', { token: 'x'.repeat(43) })).status).toBe(400);
    expect(await AuthTokenModel.countDocuments({ usedAt: { $ne: null } })).toBe(1);
  });
});

describe('sign-in and sessions', () => {
  it('signs in with a HttpOnly session cookie, and gives one generic error for wrong email or password', async () => {
    const c = client();
    await c.post('/api/auth/register', valid());
    await verified(c);
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
    expect(wrongPassword.body.error).toEqual(noAccount.body.error);
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
