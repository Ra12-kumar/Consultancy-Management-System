import { describe, expect, it } from 'vitest';
import { InviteCodeModel } from '../src/models/InviteCode.js';
import { UserModel } from '../src/models/User.js';
import { createInviteFromCli } from '../src/services/inviteCode.service.js';
import { client, codeFromEmail, createAdmin, createLimitedAdmin, registerStudent, useTestDb } from './helpers.js';

useTestDb();

const PASSWORD = 'Str0ng-pass-2026';
let n = 0;
const person = (extra: object = {}) => {
  n += 1;
  return { name: 'Meera Nair', email: `staff${n}@example.com`, mobile: '9876512345', password: PASSWORD, ...extra };
};

// Registers with a code, verifies the emailed code, then signs in with the password (staff never sign in by code alone).
async function signUpStaff(accountType: 'counsellor' | 'admin', inviteCode: string, email?: string) {
  const body = person({ accountType, inviteCode, ...(email && { email }) });
  const res = await client().post('/api/auth/register', body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const c = client();
  const blocked = await c.post('/api/auth/login', { email: body.email, password: PASSWORD });
  expect(blocked.status).toBe(403);
  expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  const verified = await c.post('/api/auth/verify-otp', { email: body.email, code: await codeFromEmail(body.email) });
  expect(verified.body.data.signedIn).toBe(false);
  const login = await c.post('/api/auth/login', { email: body.email, password: PASSWORD });
  expect(login.status).toBe(200);
  return { c, email: body.email, user: login.body.data.user };
}

describe('three-role sign-up', () => {
  it('is a student by default; staff roles need a code, and the role can never be chosen in the request', async () => {
    const student = await client().post('/api/auth/register', person());
    expect(student.status).toBe(201);
    expect(await UserModel.findOne({ email: `staff${n}@example.com` }).lean()).toMatchObject({ role: 'student', permissions: [] });

    const noCode = await client().post('/api/auth/register', person({ accountType: 'admin' }));
    expect(noCode.status).toBe(403);
    expect(noCode.body.error.code).toBe('INVITE_REQUIRED');
    const fake = await client().post('/api/auth/register', person({ accountType: 'counsellor', inviteCode: 'ABCD-EFGH-JKMN-PQRS' }));
    expect(fake.status).toBe(403);
    expect(fake.body.error.code).toBe('INVITE_INVALID');
    expect((await client().post('/api/auth/register', person({ role: 'admin' }))).status).toBe(422);
    expect((await client().post('/api/auth/register', person({ accountType: 'superuser' }))).status).toBe(422);
    expect(await UserModel.countDocuments({ role: { $ne: 'student' } })).toBe(0);
  });

  it('a counsellor code makes a counsellor (no admin powers); an admin code makes an admin with the code permissions', async () => {
    const cc = await createInviteFromCli({ role: 'counsellor' });
    const counsellor = await signUpStaff('counsellor', cc.code.toLowerCase().replace(/-/g, ' '));
    expect(counsellor.user).toMatchObject({ role: 'counsellor', permissions: [] });
    expect((await counsellor.c.get('/api/counsellor/summary')).body.data).toMatchObject({ assignedOpen: 0, followUpsToday: 0 });
    expect((await counsellor.c.get('/api/admin/dashboard/summary')).status).toBe(403);
    expect((await counsellor.c.get('/api/admin/enquiries')).status).toBe(403);
    expect((await counsellor.c.get('/api/admin/colleges')).status).toBe(403);

    const ac = await createInviteFromCli({ role: 'admin' });
    const admin = await signUpStaff('admin', ac.code);
    expect(admin.user.role).toBe('admin');
    expect((await admin.c.get('/api/admin/dashboard/summary')).status).toBe(200);

    // Codes work once; the role must match the code.
    expect((await client().post('/api/auth/register', person({ accountType: 'counsellor', inviteCode: cc.code }))).body.error.code).toBe('INVITE_INVALID');
    const other = await createInviteFromCli({ role: 'counsellor' });
    expect((await client().post('/api/auth/register', person({ accountType: 'admin', inviteCode: other.code }))).body.error.code).toBe('INVITE_INVALID');
  });

  it('refuses expired, revoked and other-email codes; parallel sign-ups with one code create one account', async () => {
    const expired = await createInviteFromCli({ role: 'counsellor' });
    await InviteCodeModel.updateOne({ _id: expired.invite.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await client().post('/api/auth/register', person({ accountType: 'counsellor', inviteCode: expired.code }))).status).toBe(403);

    const locked = await createInviteFromCli({ role: 'counsellor', email: 'only.this@example.com' });
    expect((await client().post('/api/auth/register', person({ accountType: 'counsellor', inviteCode: locked.code }))).status).toBe(403);
    expect((await client().post('/api/auth/register', person({ accountType: 'counsellor', inviteCode: locked.code, email: 'only.this@example.com' }))).status).toBe(201);

    const shared = await createInviteFromCli({ role: 'counsellor' });
    const results = await Promise.all(Array.from({ length: 4 }, () => client().post('/api/auth/register', person({ accountType: 'counsellor', inviteCode: shared.code }))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await UserModel.countDocuments({ role: 'counsellor' })).toBe(2);
  });

  it('an existing email does not use up the code', async () => {
    const { email } = await registerStudent();
    const code = await createInviteFromCli({ role: 'counsellor' });
    const res = await client().post('/api/auth/register', person({ accountType: 'counsellor', inviteCode: code.code, email }));
    expect(res.status).toBe(201);
    expect(await UserModel.findOne({ email }).lean()).toMatchObject({ role: 'student' });
    expect((await InviteCodeModel.findById(code.invite.id).lean())!.usedAt).toBeNull();
  });
});

describe('invitation codes in the admin dashboard', () => {
  it('admins.manage creates (shown once, stored hashed), lists and revokes codes; never with permissions they lack', async () => {
    const admin = await createAdmin();
    const created = await admin.c.post('/api/admin/invite-codes', { role: 'admin', permissions: ['enquiries.manage'], days: 3 });
    expect(created.status).toBe(201);
    expect(created.body.data.code).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    const stored = await InviteCodeModel.findById(created.body.data.invite.id).select('+codeHash').lean();
    expect(JSON.stringify(stored)).not.toContain(created.body.data.code.replace(/-/g, ''));

    const list = await admin.c.get('/api/admin/invite-codes');
    expect(list.body.data[0]).toMatchObject({ role: 'admin', status: 'active', permissions: ['enquiries.manage'] });
    expect(JSON.stringify(list.body)).not.toContain(created.body.data.code);
    expect((await admin.c.del(`/api/admin/invite-codes/${created.body.data.invite.id}`)).body.data.status).toBe('revoked');
    expect((await client().post('/api/auth/register', person({ accountType: 'admin', inviteCode: created.body.data.code }))).status).toBe(403);

    const limited = await createLimitedAdmin(['admins.manage']);
    expect((await limited.c.post('/api/admin/invite-codes', { role: 'admin', permissions: ['payments.manage'] })).status).toBe(403);
    expect((await limited.c.post('/api/admin/invite-codes', { role: 'counsellor' })).status).toBe(201);
    const noPerm = await createLimitedAdmin(['enquiries.manage']);
    expect((await noPerm.c.post('/api/admin/invite-codes', { role: 'counsellor' })).status).toBe(403);
  });

  it('students cannot reach counsellor or invitation APIs', async () => {
    const { c } = await registerStudent();
    expect((await c.get('/api/counsellor/summary')).status).toBe(403);
    expect((await c.post('/api/admin/invite-codes', { role: 'admin' })).status).toBe(403);
    expect((await client().get('/api/counsellor/summary')).status).toBe(401);
  });
});
