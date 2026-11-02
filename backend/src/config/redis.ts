import { createClient } from 'redis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

// Optional Redis connection (REDIS_URL). Redis is never the source of truth: callers ask for the client with
// redisClient() and fall back to MongoDB / per-process behaviour when it returns null (not configured, not yet
// connected, or temporarily down). Reconnects run in the background with growing delays (max 10 s).

type Client = ReturnType<typeof createClient>;
let client: Client | null = null;
let ready = false;
let lastErrorLog = 0;

export function redisConfigured() {
  return Boolean(env.REDIS_URL);
}

// Every key this project writes starts with REDIS_PREFIX, e.g. "consultancy:cache:…".
export const redisKey = (...parts: Array<string | number>) => [env.REDIS_PREFIX, ...parts].join(':');

export async function connectRedis(url = env.REDIS_URL) {
  if (!url || client) return;
  client = createClient({
    url,
    socket: {
      connectTimeout: 3000,
      reconnectStrategy: (retries) => Math.min(10_000, 100 * 2 ** Math.min(retries, 7)),
    },
    // Commands fail at once while disconnected (no unbounded queue); callers fall back.
    disableOfflineQueue: true,
  });
  client.on('ready', () => {
    ready = true;
    logger.info('Redis connected');
  });
  client.on('end', () => (ready = false));
  client.on('reconnecting', () => (ready = false));
  client.on('error', (err: Error) => {
    ready = false;
    // At most one log line every 30 s while Redis is unreachable.
    if (Date.now() - lastErrorLog > 30_000) {
      lastErrorLog = Date.now();
      logger.warn({ err: { name: err.name, message: err.message } }, 'Redis unavailable; using fallbacks');
    }
  });
  try {
    await client.connect();
  } catch (err) {
    // The client keeps retrying in the background; the API starts without Redis.
    logger.warn({ err: { name: (err as Error).name, message: (err as Error).message } }, 'Redis not reachable at start-up; continuing without it');
  }
}

export function redisClient(): Client | null {
  return client && ready ? client : null;
}

export function redisState(): 'disabled' | 'connected' | 'unavailable' {
  if (!client) return 'disabled';
  return ready ? 'connected' : 'unavailable';
}

export async function disconnectRedis() {
  const c = client;
  client = null;
  ready = false;
  if (c) await c.close().catch((err: Error) => logger.warn({ err: { name: err.name, message: err.message } }, 'Redis did not close cleanly'));
}
