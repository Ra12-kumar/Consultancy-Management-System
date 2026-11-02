import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { CallbackLeadModel } from '../src/models/CallbackLead.js';
import { EmailDeliveryModel } from '../src/models/EmailDelivery.js';
import { UserModel } from '../src/models/User.js';
import { app, client, createLimitedAdmin, ORIGIN, PASSWORD, useTestDb } from './helpers.js';

useTestDb();

const body = { name: 'Asha Verma', mobile: '98765 43210', role: 'parent', education: 'class_12', interest: 'B.Tech', consent: true };
const post = (b: unknown) => request(app).post('/api/leads/callback').set('Origin', ORIGIN).send(b as object);

describe('landing-page callback requests', () => {
  it('saves the request and emails the enquiry team without putting the phone number in stored fields', async () => {
    await UserModel.create({ name: 'Enquiry Admin', email: 'enq-admin@example.com', role: 'admin', status: 'active', permissions: ['enquiries.manage'], emailVerifiedAt: new Date() });
    const res = await post(body);
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ received: true });
    const lead = await CallbackLeadModel.findOne().lean();
    expect(lead).toMatchObject({ name: 'Asha Verma', mobile: '+919876543210', role: 'parent', education: 'class_12', interest: 'B.Tech', status: 'new' });
    expect(lead!.consentAt).toBeInstanceOf(Date);
    const mail = await EmailDeliveryModel.find({ template: 'callback_lead' }).lean();
    expect(mail.map((m) => m.to)).toContain('enq-admin@example.com');
    expect(JSON.stringify(mail.map((m) => [m.subject, m.params]))).not.toContain('98765');
  });

  it('needs consent and valid details, and refuses unknown fields', async () => {
    expect((await post({ ...body, consent: false })).status).toBe(422);
    expect((await post({ ...body, mobile: '12345' })).status).toBe(422);
    expect((await post({ ...body, role: 'admin' })).status).toBe(422);
    expect((await post({ ...body, extra: { $ne: null } })).status).toBe(422);
    expect(await CallbackLeadModel.countDocuments()).toBe(0);
  });

  it('does not store or re-send a repeat request from the same number within 10 minutes', async () => {
    expect((await post(body)).status).toBe(201);
    expect((await post(body)).status).toBe(201);
    expect(await CallbackLeadModel.countDocuments()).toBe(1);
  });
});

describe('callback requests in the Enquiries section', () => {
  async function counsellor(email: string) {
    const { hashPassword } = await import('../src/utils/password.js');
    const user = await UserModel.create({ name: 'Meera Counsellor', email, role: 'counsellor', status: 'active', passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date() });
    const c = client();
    expect((await c.post('/api/auth/login', { email, password: PASSWORD })).status).toBe(200);
    return { c, id: String(user._id) };
  }

  it('admins list and assign requests; the counsellor sees and updates only their own', async () => {
    expect((await post(body)).status).toBe(201);
    expect((await post({ ...body, name: 'Ravi Kumar', mobile: '9123456780', role: 'student' })).status).toBe(201);
    const admin = await createLimitedAdmin(['enquiries.manage']);
    const meera = await counsellor('meera@example.com');
    const other = await counsellor('other@example.com');

    let res = await admin.c.get('/api/admin/callback-leads');
    expect(res.status).toBe(200);
    expect(res.body.data.map((l: { name: string }) => l.name)).toEqual(['Ravi Kumar', 'Asha Verma']);
    expect(res.body.meta).toMatchObject({ total: 2, new: 2 });
    const asha = res.body.data[1];
    expect(asha).toMatchObject({ mobile: '+919876543210', role: 'parent', education: 'class_12', status: 'new', assignedTo: null });

    res = await admin.c.patch(`/api/admin/callback-leads/${asha.id}`, { assignedTo: meera.id, note: 'Prefers evening calls' });
    expect(res.status).toBe(200);
    expect(res.body.data.assignedTo).toEqual({ id: meera.id, name: 'Meera Counsellor' });
    expect(await EmailDeliveryModel.countDocuments({ template: 'callback_lead', to: 'meera@example.com' })).toBe(1);
    // Only people who handle enquiries can be assigned.
    const student = await UserModel.create({ name: 'Some Student', email: 's@example.com', role: 'student' });
    expect((await admin.c.patch(`/api/admin/callback-leads/${asha.id}`, { assignedTo: String(student._id) })).status).toBe(422);

    res = await meera.c.get('/api/counsellor/callback-leads');
    expect(res.body.data.map((l: { name: string }) => l.name)).toEqual(['Asha Verma']);
    res = await meera.c.patch(`/api/counsellor/callback-leads/${asha.id}`, { status: 'contacted' });
    expect(res.body.data).toMatchObject({ status: 'contacted', note: 'Prefers evening calls' });
    expect(res.body.data.contactedAt).toBeTruthy();
    // A counsellor cannot reassign, nor see or change someone else's request.
    expect((await meera.c.patch(`/api/counsellor/callback-leads/${asha.id}`, { assignedTo: other.id })).status).toBe(422);
    expect((await other.c.get('/api/counsellor/callback-leads')).body.data).toEqual([]);
    expect((await other.c.patch(`/api/counsellor/callback-leads/${asha.id}`, { status: 'closed' })).status).toBe(404);
    // Admin-only list for staff without enquiries.manage, and none for students or the public.
    expect((await (await createLimitedAdmin(['catalog.manage'])).c.get('/api/admin/callback-leads')).status).toBe(403);
    expect((await meera.c.get('/api/admin/callback-leads')).status).toBe(403);
    expect((await request(app).get('/api/admin/callback-leads')).status).toBe(401);
    expect((await admin.c.get('/api/admin/callback-leads?status=new')).body.data.map((l: { name: string }) => l.name)).toEqual(['Ravi Kumar']);
  });
});

describe('callback requests saved before assignment and notes existed', () => {
  it('are listed with an empty note and no assignee', async () => {
    await CallbackLeadModel.collection.insertOne({ name: 'Older Request', mobile: '+919000000001', role: 'student', education: 'class_12', interest: '', consentAt: new Date(), source: 'landing', status: 'new', createdAt: new Date(), updatedAt: new Date() });
    const admin = await createLimitedAdmin(['enquiries.manage']);
    const res = await admin.c.get('/api/admin/callback-leads');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ name: 'Older Request', note: '', assignedTo: null, contactedAt: null, status: 'new' });
  });
});
