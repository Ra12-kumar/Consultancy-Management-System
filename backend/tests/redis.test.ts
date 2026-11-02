import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectRedis, disconnectRedis, redisClient, redisState } from '../src/config/redis.js';
import { makeLimiter } from '../src/middleware/rateLimits.js';
import { cacheStats } from '../src/services/cache.service.js';
import { app, createLimitedAdmin, registerStudent, useTestDb } from './helpers.js';

// Runs against a real Redis when REDIS_URL_TEST is set (CI provides one; locally e.g.
// REDIS_URL_TEST=redis://127.0.0.1:6390/15). Use a Redis database reserved for tests: it is emptied before each test.
const url = process.env.REDIS_URL_TEST;

describe.skipIf(!url)('Redis cache and shared rate limits', () => {
  useTestDb();
  beforeAll(async () => {
    await connectRedis(url);
    for (let i = 0; i < 50 && redisState() !== 'connected'; i += 1) await new Promise((r) => setTimeout(r, 100));
    expect(redisState()).toBe('connected');
  });
  beforeEach(async () => {
    await redisClient()!.flushDb();
  });
  afterAll(async () => {
    await disconnectRedis();
  });

  it('serves public answers from the cache and clears them as soon as an admin changes something', async () => {
    const first = await request(app).get('/api/site');
    expect(first.headers['x-cache']).toBe('MISS');
    const second = await request(app).get('/api/site');
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body).toEqual(first.body);

    const admin = await createLimitedAdmin(['settings.manage']);
    expect((await admin.c.put('/api/admin/settings/site', { organisation: { whatsapp: '+91 98765 43210' } })).status).toBe(200);
    const fresh = await request(app).get('/api/site');
    expect(fresh.headers['x-cache']).toBe('MISS');
    expect(fresh.body.data.organisation.whatsapp).toBe('+91 98765 43210');

    const list = await request(app).get('/api/colleges?page=1');
    expect(list.headers['x-cache']).toBe('MISS');
    expect((await request(app).get('/api/colleges?page=1')).headers['x-cache']).toBe('HIT');
    expect(cacheStats.hits).toBeGreaterThanOrEqual(2);
  });

  it('never caches failed requests or anything personal', async () => {
    expect((await request(app).get('/api/colleges?nope=1')).status).toBe(422);
    expect((await request(app).get('/api/colleges?nope=1')).headers['x-cache']).toBe('MISS');
    const student = await registerStudent();
    const me = await student.c.get('/api/students/me/profile');
    expect(me.status).toBe(200);
    expect(me.headers['x-cache']).toBeUndefined();
    const keys = await redisClient()!.keys('*');
    expect(keys.some((k) => k.includes('students') || k.includes('auth'))).toBe(false);
  });

  it('counts rate limits across API instances, answers 429 with Retry-After, and keeps limiting without Redis', async () => {
    // Two "instances" with the same limiter name share one counter in Redis.
    const instance = () => {
      const a = express();
      a.set('trust proxy', 0);
      a.use(makeLimiter('test-shared', 60_000, 3, () => 'same-client', 'Slow down'));
      a.get('/', (_req, res) => res.json({ ok: true }));
      return a;
    };
    const [one, two] = [instance(), instance()];
    expect((await request(one).get('/')).status).toBe(200);
    expect((await request(two).get('/')).status).toBe(200);
    expect((await request(one).get('/')).status).toBe(200);
    const blocked = await request(two).get('/');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toEqual({ code: 'RATE_LIMITED', message: 'Slow down' });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(60);

    // Redis gone: public pages still answer (from MongoDB) and limits still apply, per process.
    await disconnectRedis();
    const site = await request(app).get('/api/site');
    expect(site.status).toBe(200);
    expect(site.headers['x-cache']).toBe('BYPASS');
    const solo = express();
    solo.use(makeLimiter('test-fallback', 60_000, 1, () => 'k', 'Slow down'));
    solo.get('/', (_req, res) => res.json({ ok: true }));
    expect((await request(solo).get('/')).status).toBe(200);
    expect((await request(solo).get('/')).status).toBe(429);
    await connectRedis(url);
    for (let i = 0; i < 50 && redisState() !== 'connected'; i += 1) await new Promise((r) => setTimeout(r, 100));
  });
});
