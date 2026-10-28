import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { CollegeModel } from '../src/models/College.js';

const app = createApp();

beforeAll(async () => {
  // Safety: tests only ever run against the dedicated test database.
  expect(env.MONGODB_URI).toMatch(/\/education_consultancy_test(\?|$)/);
  await connectDatabase(env.MONGODB_URI, { attempts: 1 });
  await CollegeModel.syncIndexes();
  await CollegeModel.deleteMany({});
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) await CollegeModel.deleteMany({});
  await disconnectDatabase();
});

describe('health', () => {
  it('reports liveness without checking dependencies', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { status: 'ok', service: 'education-consultancy-api' } });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('reports readiness with the database connected, without exposing connection details', async () => {
    const res = await request(app).get('/api/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'ready', database: 'connected', mail: 'log-only' });
    expect(JSON.stringify(res.body)).not.toMatch(/mongodb|127\.0\.0\.1|27017|education_consultancy|secret/i);
  });
});

describe('API conventions', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: { code: 'NOT_FOUND', message: 'Route GET /api/nope not found' } });
  });

  it('validates input with 422 and field details', async () => {
    const res = await request(app).get('/api/colleges?limit=500&type=castle');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual(['limit', 'type']);
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app).post('/api/health').set('Content-Type', 'application/json').send('{"x":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('sets security headers and allows only the configured frontend origin', async () => {
    const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:3000');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
    expect(allowed.headers['x-powered-by']).toBeUndefined();
    const other = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(other.headers['access-control-allow-origin']).not.toBe('http://localhost:5173');
  });

  it('lists only published colleges, with filters and pagination', async () => {
    await CollegeModel.create([
      { name: 'Alpha Institute', slug: 'alpha', type: 'private', status: 'published' },
      { name: 'Beta College', slug: 'beta', type: 'government', status: 'published' },
      { name: 'Draft College', slug: 'draft', type: 'private', status: 'draft' },
      { name: 'Closed College', slug: 'closed', type: 'private', status: 'archived' },
    ]);
    const res = await request(app).get('/api/colleges?type=private');
    expect(res.status).toBe(200);
    expect(res.body.data.map((c: { slug: string }) => c.slug)).toEqual(['alpha']);
    expect(res.body.meta).toMatchObject({ total: 1, page: 1 });
    expect((await request(app).get('/api/colleges?limit=1')).body.meta).toMatchObject({ total: 2, totalPages: 2 });
    // Duplicate slugs are refused by the unique index.
    await expect(CollegeModel.create({ name: 'Alpha 2', slug: 'alpha', type: 'private' })).rejects.toMatchObject({ code: 11000 });
  });
});

describe('database outage', () => {
  it('answers readiness with 503 while MongoDB is disconnected (liveness stays up)', async () => {
    await disconnectDatabase();
    expect((await request(app).get('/api/health/ready')).status).toBe(503);
    expect((await request(app).get('/api/health')).status).toBe(200);
    await connectDatabase(env.MONGODB_URI, { attempts: 1 });
    expect((await request(app).get('/api/health/ready')).status).toBe(200);
  });
});
