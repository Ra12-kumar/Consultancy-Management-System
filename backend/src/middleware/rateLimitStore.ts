import { MemoryStore, type ClientRateLimitInfo, type Options, type Store } from 'express-rate-limit';
import { redisClient, redisKey } from '../config/redis.js';
import { logger } from '../utils/logger.js';

// Rate-limit counters shared by every API instance through Redis (one fixed window per key). While Redis is
// not configured or not reachable, each instance counts in its own memory instead (the previous behaviour),
// so an outage never blocks sign-in for everyone and never removes the limits.

// INCR and set the window on first use, atomically; returns [hits, ms until reset].
const INCREMENT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) ttl = tonumber(ARGV[1]) end
return { hits, ttl }`;

let lastFallbackLog = 0;

export class RedisFallbackStore implements Store {
  // Counters live in Redis, not in this process (express-rate-limit uses this for its own checks).
  localKeys = false;
  private windowMs = 60_000;
  private readonly memory = new MemoryStore();

  constructor(readonly prefix: string) {}

  init(options: Options) {
    this.windowMs = options.windowMs;
    this.memory.init(options);
  }

  private key(key: string) {
    return redisKey('rl', this.prefix, key);
  }

  private fallback(err?: unknown) {
    if (err && Date.now() - lastFallbackLog > 30_000) {
      lastFallbackLog = Date.now();
      logger.warn({ err: { name: (err as Error).name, message: (err as Error).message } }, 'Rate limiting falls back to per-process counters');
    }
    return this.memory;
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const r = redisClient();
    if (!r) return this.fallback().get(key);
    try {
      const [hits, ttl] = await Promise.all([r.get(this.key(key)), r.pTTL(this.key(key))]);
      if (hits === null) return undefined;
      return { totalHits: Number(hits), resetTime: new Date(Date.now() + Math.max(0, ttl)) };
    } catch (err) {
      return this.fallback(err).get(key);
    }
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const r = redisClient();
    if (!r) return this.fallback().increment(key);
    try {
      const [hits, ttl] = (await r.eval(INCREMENT, { keys: [this.key(key)], arguments: [String(this.windowMs)] })) as [number, number];
      return { totalHits: Number(hits), resetTime: new Date(Date.now() + Number(ttl)) };
    } catch (err) {
      return this.fallback(err).increment(key);
    }
  }

  async decrement(key: string) {
    const r = redisClient();
    if (!r) return this.fallback().decrement(key);
    try {
      await r.decr(this.key(key));
    } catch (err) {
      await this.fallback(err).decrement(key);
    }
  }

  async resetKey(key: string) {
    await this.memory.resetKey(key);
    const r = redisClient();
    if (r) await r.del(this.key(key)).catch((err: Error) => this.fallback(err));
  }

  shutdown() {
    this.memory.shutdown();
  }
}

// Seconds until the client may try again (for the Retry-After header on 429 answers).
export function retryAfterSeconds(resetTime: Date | undefined, windowMs: number) {
  const ms = resetTime ? resetTime.getTime() - Date.now() : windowMs;
  return Math.max(1, Math.ceil(ms / 1000));
}
