import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { openApiDocument } from '../src/routes/index.js';
import { app } from './helpers.js';

type Access = { auth: boolean; roles: string[]; permissions: string[]; verifiedEmail: boolean };
const operations = () =>
  Object.entries(openApiDocument().paths).flatMap(([path, methods]) => Object.entries(methods).map(([method, op]) => ({ path, method, access: (op as { 'x-access': Access })['x-access'] })));

describe('API documentation', () => {
  it('serves an OpenAPI document generated from the routes', async () => {
    const res = await request(app).get('/api/docs.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.paths['/api/enquiries'].post.requestBody.content['application/json'].schema.required).toContain('idempotencyKey');
    expect((await request(app).get('/api/docs/')).status).toBe(200);
  });

  it('every admin route needs the admin role and a specific permission (no accidental open admin routes)', () => {
    const admin = operations().filter((o) => o.path.startsWith('/api/admin/'));
    expect(admin.length).toBeGreaterThan(50);
    const weak = admin.filter((o) => !o.access.auth || !o.access.roles.includes('admin') || o.access.permissions.length === 0);
    expect(weak.map((o) => `${o.method} ${o.path}`)).toEqual([]);
  });

  it('every student write needs a session and the student role; public routes are reads (plus sign-in flows)', () => {
    const ops = operations();
    const publicWrites = ops.filter((o) => !o.access.auth && o.method !== 'get').map((o) => o.path);
    // Sign-in flows, plus the Razorpay webhook (verified by signature instead of a session).
    expect(publicWrites.filter((p) => !p.startsWith('/api/auth/'))).toEqual(['/api/payments/webhook']);
    for (const prefix of ['/api/enquiries', '/api/appointments', '/api/scholarship-applications', '/api/feedback', '/api/students/me']) {
      const writes = ops.filter((o) => o.path.startsWith(prefix) && o.method !== 'get');
      expect(writes.length, prefix).toBeGreaterThan(0);
      expect(writes.every((o) => o.access.auth && o.access.roles.includes('student')), prefix).toBe(true);
    }
  });
});
