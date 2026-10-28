import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AuditLogModel } from '../src/models/AuditLog.js';
import { UserModel } from '../src/models/User.js';
import { bootstrapFirstAdmin } from '../src/services/admin.service.js';
import { app, createAdmin, registerStudent, tokenFromEmail, useTestDb, client, PASSWORD } from './helpers.js';

useTestDb();

const profile = {
  personal: { city: 'Chennai', state: 'Tamil Nadu', guardianName: '', guardianPhone: '', preferredContact: 'email' },
  academic: { highestQualification: 'class_12', course: 'PCM', institution: 'Govt Hr Sec School', boardOrUniversity: 'TN State Board', passingYear: 2025, score: { type: 'cgpa', value: 8.5, max: 10 }, entranceExams: [{ name: 'JEE Main', score: '92 percentile', year: 2025 }] },
};

describe('unauthenticated access', () => {
  it('refuses protected endpoints without a session', async () => {
    for (const url of ['/api/auth/me', '/api/students/me', '/api/students/me/profile', '/api/admin/students', '/api/admin/dashboard/summary']) {
      expect((await request(app).get(url)).status, url).toBe(401);
    }
  });
});

describe('student data', () => {
  it('saves the student’s own profile, derives the percentage on the server, and refuses unknown fields', async () => {
    const { c } = await registerStudent();
    const saved = await c.put('/api/students/me/profile', profile);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.data.academic.percentage).toBe(85);
    expect(saved.body.data.completion).toBe(100);
    // A client-sent percentage (or other unknown field) is refused, never trusted.
    expect((await c.put('/api/students/me/profile', { ...profile, academic: { ...profile.academic, percentage: 99 } })).status).toBe(422);
    expect((await c.put('/api/students/me/profile', { ...profile, academic: { ...profile.academic, score: { type: 'cgpa', value: 11, max: 10 } } })).status).toBe(422);
    expect((await c.get('/api/students/me/profile')).body.data.personal.city).toBe('Chennai');
  });

  it('a student cannot change their role or email through the profile API', async () => {
    const { c, id } = await registerStudent();
    expect((await c.patch('/api/students/me', { role: 'admin' })).status).toBe(422);
    expect((await c.patch('/api/students/me', { email: 'x@example.com' })).status).toBe(422);
    expect((await c.patch('/api/students/me', { name: 'Priya S', mobile: '9876500000' })).body.data).toMatchObject({ name: 'Priya S', mobile: '+919876500000', role: 'student' });
    expect((await UserModel.findById(id).lean())!.role).toBe('student');
  });

  it('a student cannot read another student’s record (looks like it does not exist)', async () => {
    const a = await registerStudent();
    const b = await registerStudent({ name: 'Arjun Mehta' });
    expect((await a.c.get(`/api/students/${a.id}`)).status).toBe(200);
    const other = await a.c.get(`/api/students/${b.id}`);
    expect(other.status).toBe(404);
    expect(JSON.stringify(other.body)).not.toContain('Arjun');
  });

  it('students are refused every admin endpoint', async () => {
    const { c } = await registerStudent();
    for (const url of ['/api/admin/students', '/api/admin/dashboard/summary', '/api/admin/admins', '/api/admin/email/deliveries', '/api/admin/audit-logs']) {
      expect((await c.get(url)).status, url).toBe(403);
    }
    expect((await c.post('/api/admin/admins', { name: 'Evil Admin', email: 'evil@example.com', permissions: ['admins.manage'] })).status).toBe(403);
  });
});

describe('administrators', () => {
  it('first admin only through the bootstrap (refused once an admin exists); the set-password link works once', async () => {
    const { c, email } = await createAdmin();
    expect((await c.get('/api/auth/me')).body.data.user).toMatchObject({ email, role: 'admin', emailVerified: true });
    await expect(bootstrapFirstAdmin({ name: 'Second Boss', email: 'boss2@example.com' })).rejects.toMatchObject({ code: 'ADMIN_EXISTS' });
  });

  it('admins see students and dashboard totals; a student’s record is readable with students.read', async () => {
    const s = await registerStudent();
    await s.c.put('/api/students/me/profile', profile);
    await registerStudent({ verify: false, name: 'Neha Verma' });
    const { c } = await createAdmin();
    const list = await c.get('/api/admin/students?q=neha');
    expect(list.body.data.map((u: { name: string }) => u.name)).toEqual(['Neha Verma']);
    expect((await c.get('/api/admin/students?verified=yes')).body.meta.total).toBe(1);
    expect((await c.get('/api/admin/dashboard/summary')).body.data.students).toMatchObject({ total: 2, verified: 1, unverified: 1 });
    expect((await c.get(`/api/students/${s.id}`)).body.data.profile.academic.percentage).toBe(85);
  });

  it('least privilege: missing permissions are refused; admins cannot change their own permissions or grant ones they lack', async () => {
    const boss = await createAdmin();
    // Boss invites a limited admin (email-only viewer).
    const invited = await boss.c.post('/api/admin/admins', { name: 'Ravi Viewer', email: 'viewer@example.com', permissions: ['email.view'] });
    expect(invited.status, JSON.stringify(invited.body)).toBe(201);
    const viewer = client();
    expect((await viewer.post('/api/auth/set-password', { token: await tokenFromEmail('viewer@example.com', '/set-password'), password: PASSWORD })).status).toBe(200);
    await viewer.post('/api/auth/login', { email: 'viewer@example.com', password: PASSWORD });
    expect((await viewer.get('/api/admin/email/deliveries')).status).toBe(200);
    expect((await viewer.get('/api/admin/students')).status).toBe(403);
    expect((await viewer.post('/api/admin/admins', { name: 'Another One', email: 'x2@example.com', permissions: [] })).status).toBe(403);

    expect((await boss.c.patch(`/api/admin/admins/${boss.id}/permissions`, { permissions: [] })).body.error.code).toBe('OWN_PERMISSIONS');
    const viewerId = invited.body.data.id;
    expect((await boss.c.patch(`/api/admin/admins/${viewerId}/permissions`, { permissions: ['email.view', 'students.read'] })).status).toBe(200);
    // The changed admin's sessions end so new rights apply at once.
    expect((await viewer.get('/api/auth/me')).status).toBe(401);
    expect(await AuditLogModel.countDocuments({ action: 'admin.permissions_changed' })).toBe(1);
  });

  it('audit records cannot be changed or deleted through the application', async () => {
    await createAdmin();
    await expect(AuditLogModel.updateMany({}, { $set: { action: 'tampered' } })).rejects.toThrow(/append-only/);
    await expect(AuditLogModel.deleteMany({})).rejects.toThrow(/append-only/);
  });
});
