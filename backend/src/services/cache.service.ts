import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { redisClient, redisKey } from '../config/redis.js';
import { logger } from '../utils/logger.js';

// Cache-aside for PUBLIC answers only (the same for every visitor: catalogue, site content). Keys are
//   <prefix>:cache:<namespace>:v<version>:<url>
// An admin change bumps the namespace version (<prefix>:cachever:<namespace>), so every older entry is
// skipped at once and expires on its own (TTL). Without Redis, or if Redis fails, requests go straight to
// MongoDB as before. Student or staff data is never cached here.

export type CacheNamespace = 'catalog' | 'site' | 'scholarships';
const ALL: CacheNamespace[] = ['catalog', 'site', 'scholarships'];

export const cacheStats = { hits: 0, misses: 0, errors: 0, bypass: 0 };

const versionKey = (ns: CacheNamespace) => redisKey('cachever', ns);

async function version(ns: CacheNamespace) {
  const r = redisClient();
  if (!r) return null;
  return (await r.get(versionKey(ns))) ?? '0';
}

// Called after any admin change to public data (see invalidateOnWrite).
export async function bumpCache(namespaces: CacheNamespace[] = ALL) {
  const r = redisClient();
  if (!r) return;
  try {
    await Promise.all(namespaces.map((ns) => r.incr(versionKey(ns))));
  } catch (err) {
    cacheStats.errors += 1;
    logger.warn({ err: { name: (err as Error).name, message: (err as Error).message }, namespaces }, 'Cache invalidation failed; entries expire by TTL');
  }
}

// GET middleware: serve a cached 200 answer, or let the route run and store its successful JSON answer.
// Sets X-Cache: HIT / MISS / BYPASS.
export function publicCache(ns: CacheNamespace, ttlSeconds = env.CACHE_TTL_SECONDS) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || !redisClient()) {
      cacheStats.bypass += 1;
      res.setHeader('X-Cache', 'BYPASS');
      return next();
    }
    let key: string;
    try {
      const v = await version(ns);
      if (v === null) {
        res.setHeader('X-Cache', 'BYPASS');
        return next();
      }
      key = redisKey('cache', ns, `v${v}`, req.originalUrl);
      const hit = await redisClient()?.get(key);
      if (hit) {
        cacheStats.hits += 1;
        req.log?.debug({ cache: 'hit', key }, 'cache hit');
        res.setHeader('X-Cache', 'HIT');
        res.type('application/json').send(hit);
        return;
      }
    } catch (err) {
      cacheStats.errors += 1;
      req.log?.warn({ err: { name: (err as Error).name, message: (err as Error).message } }, 'Cache read failed; answering from the database');
      res.setHeader('X-Cache', 'BYPASS');
      return next();
    }
    cacheStats.misses += 1;
    req.log?.debug({ cache: 'miss', key }, 'cache miss');
    res.setHeader('X-Cache', 'MISS');
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode === 200 && (body as { success?: boolean })?.success) {
        redisClient()
          ?.set(key, JSON.stringify(body), { EX: ttlSeconds })
          .catch((err: Error) => {
            cacheStats.errors += 1;
            req.log?.warn({ err: { name: err.name, message: err.message } }, 'Cache write failed');
          });
      }
      return json(body);
    };
    next();
  };
}

// Admin routers: after a successful change (non-GET, 2xx), clear the public cache BEFORE answering, so the
// admin (and everyone else) sees the change on the next page load.
export function invalidateOnWrite(namespaces: CacheNamespace[] = ALL) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    let bumped = false;
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode < 400 && redisClient()) {
        bumped = true;
        void bumpCache(namespaces).finally(() => json(body));
        return res;
      }
      return json(body);
    };
    // Answers that are not JSON (e.g. 204 after a delete, file uploads answered another way): clear right after.
    res.on('finish', () => {
      if (!bumped && res.statusCode < 400) void bumpCache(namespaces);
    });
    next();
  };
}

// Short-lived cache for STAFF-ONLY computed answers (e.g. the admin dashboard summary), read only after the route's
// permission check. Uses Redis when available, otherwise this process's memory (bounded). Never use it for one
// student's data.
const local = new Map<string, { expires: number; value: string }>();
const LOCAL_MAX = 200;

export async function memo<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const full = redisKey('memo', key);
  const r = redisClient();
  try {
    const hit = r ? await r.get(full) : (local.get(full)?.expires ?? 0) > Date.now() ? local.get(full)!.value : null;
    if (hit) {
      cacheStats.hits += 1;
      return JSON.parse(hit) as T;
    }
  } catch (err) {
    cacheStats.errors += 1;
    logger.warn({ err: { name: (err as Error).name, message: (err as Error).message } }, 'Memo read failed; computing');
  }
  cacheStats.misses += 1;
  const value = await load();
  const text = JSON.stringify(value);
  if (r) {
    r.set(full, text, { EX: ttlSeconds }).catch((err: Error) => logger.warn({ err: { name: err.name, message: err.message } }, 'Memo write failed'));
  } else {
    if (local.size >= LOCAL_MAX) local.delete(local.keys().next().value!);
    local.set(full, { expires: Date.now() + ttlSeconds * 1000, value: text });
  }
  return value;
}

// Tests start each case with an empty in-process memo.
export function clearMemo() {
  local.clear();
}
