# Redis: caching and shared rate limits

Redis is **optional**. Set `REDIS_URL` to turn it on. Without it, the API works exactly as before: it caches nothing, and each process keeps its own rate-limit counters. **Redis is never the source of truth.** MongoDB holds every record, and Redis holds only copies of public answers and counters.

| Setting | Default | Meaning |
|---|---|---|
| `REDIS_URL` | (unset) | `redis://host:6379` or `rediss://…` (TLS). A managed Redis, such as Upstash, Elasticache or Azure Cache, works. |
| `REDIS_PREFIX` | `consultancy` | Start of every key, so several environments can share one Redis safely |
| `CACHE_TTL_SECONDS` | `300` | Maximum age of a cached public answer |

Code: `backend/src/config/redis.ts` (connection), `backend/src/services/cache.service.ts` (cache), `backend/src/middleware/rateLimitStore.ts` (rate limits).

## Connection and failure behaviour

- The client reconnects in the background, waiting longer after each failure (100 ms doubling up to 10 s). There is no offline queue, so commands fail at once while Redis is down, and callers use their fallback.
- If Redis can't be reached at start-up, the API still starts and connects when Redis comes back.
- Redis errors are logged as warnings, at most once every 30 seconds.
- Readiness (`/api/health/ready`) reports `cache: disabled | connected | unavailable`. A Redis outage **does not** make the API "not ready", because MongoDB still answers everything.
- Shutdown closes Redis cleanly after the HTTP server stops.

## What is cached (cache-aside)

Only answers that are **the same for every visitor** are cached, and only successful (`200`, `success: true`) answers:

| Namespace | Routes |
|---|---|
| `catalog` | `GET /api/locations`, `/api/courses`, `/api/courses/offerings`, `/api/colleges`, `/api/colleges/filters`, `/api/colleges/districts`, `/api/colleges/compare`, `/api/colleges/:slug` |
| `site` | `GET /api/site`, `/api/pages/:slug` |
| `scholarships` | `GET /api/scholarships`, `/api/scholarships/:slug` |

**Never cached:**
- anything that needs a session (student, counsellor and admin APIs);
- the live college finder (`/api/colleges/explore`, which has its own in-memory list);
- the external CollegeDB search (it has its own quota-saving cache);
- file downloads;
- error answers.

None of the cached handlers read the signed-in user. This was checked for every handler when the cache was added.

Response header `X-Cache: HIT | MISS | BYPASS` shows what happened. BYPASS means Redis is off or unreachable.

## Keys

```
consultancy:cachever:<namespace>                    version number of a namespace (INCR on change)
consultancy:cache:<namespace>:v<version>:<url>      cached JSON answer (expires after CACHE_TTL_SECONDS)
consultancy:rl:<limiter>:<client key>               rate-limit counter (expires with its window)
```

The URL includes the query string. Unknown query parameters are refused with 422 before anything is cached, so random parameters can't fill the cache. In the scaled stack, Redis runs with `maxmemory 256mb` and `allkeys-lru` as a backstop.

## Invalidation

Any **successful admin write** (any non-GET under `/api/admin` that returns 2xx) increases the version of all three namespaces **before the answer is sent**, so the next public request reads fresh data from MongoDB. Older entries are no longer read and expire on their own.

This is deliberately coarse (one admin change clears all public caches). It's simple and can't miss a dependency, such as a fee change affecting the college list, the college page and comparisons. Admin writes are rare compared with public reads.

**Changes that don't go through the admin API** (directory import jobs, seed or migration scripts) become visible within `CACHE_TTL_SECONDS` (5 minutes by default). Scheduled banner start and end times are subject to the same delay.

## Shared rate limits

Every limiter (overall API, sign-in per IP and per account, registration, email codes, emails sent on request, token pages, external search, callback leads) stores its counters in Redis when it's available. That makes the limits **global across all API instances**. A Lua script increments the counter and sets its window in one atomic step.

If Redis is unavailable, each limiter falls back to counting in its own process memory (the previous behaviour). An outage never switches the limits off and never locks everyone out. Account lockout after repeated wrong passwords is stored in MongoDB and doesn't depend on Redis.

Every 429 answer carries `Retry-After` (seconds) and the standard `RateLimit` / `RateLimit-Policy` headers.

## Tests

`backend/tests/redis.test.ts` runs against a real Redis when `REDIS_URL_TEST` is set. CI provides one; locally you can use a Docker container. It checks:
- MISS, then HIT, then a fresh MISS after an admin change;
- failed and personal requests are never cached;
- two API "instances" share one rate-limit counter, with 429 and `Retry-After`;
- with Redis down, pages answer (BYPASS) and limits still apply per process.

Without `REDIS_URL_TEST` the suite is skipped, and every other test runs without Redis.
