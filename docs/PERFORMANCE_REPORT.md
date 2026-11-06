# Performance report

Every number below was **measured** with k6 v2.3.0 on 2026-11-03. Nothing is estimated or extrapolated.

## Test setup (read this before using the numbers)

| Item | Value |
|---|---|
| Machine | One laptop: Intel Core i5-9300H (4 cores / 8 threads), 7.8 GB RAM, Windows 11 |
| On the same machine | MongoDB, **two** API instances (production build `node dist/server.js`, ports 5201/5202), the Next.js dev server, the k6 load generator. Everything competes for the same 4 cores |
| Database | `education_consultancy_loadtest` (separate). Seeded with the sample catalogue (10 colleges, 23 offerings, 23 fees, 4 scholarships), 1 admin and 500 verified students (`loadtest/seed-loadtest.ts`) |
| Load balancing | k6 spread virtual users round-robin over the two instances (`BASES=…5201,…5202`). **Nginx and Redis were not in the path**: Docker Desktop stopped responding after the machine slept, and restarting it would also restart another application's containers, so it was left alone |
| Email | Log-only (no provider), so email sending isn't part of the timings |
| Rate limits | Raised for the test, because all virtual users come from one IP |
| Script | `loadtest/k6.js` (scenarios browse, login, register, enquiry, dashboard) |

These are **single-laptop** figures. They show relative behaviour (where it slows down, what scales, whether anything fails), not production capacity. A production server, with MongoDB on its own machine, will do better. Re-run `loadtest/k6.js` on staging hardware before claiming any capacity figure.

## Results

| Scenario | Virtual users | Requests | Req/s | Avg ms | p95 ms | p99 ms | Max ms | HTTP errors | Checks passed |
|---|---|---|---|---|---|---|---|---|---|
| Browse (college list, college page, course browser, site) | 50 | 5,054 | 164.7 | 299 | 521 | 901 | 1,976 | 0.00% | 5052/5052 |
| Browse | 100 | 5,674 | 184.8 | 533 | 905 | 1,183 | 1,856 | 0.00% | 5672/5672 |
| Browse | 250 | 6,378 | 197.0 | 1,228 | 2,106 | 2,922 | 4,250 | 0.00% | 6376/6376 |
| Browse | 500 | 6,382 | 183.8 | 2,478 | 4,532 | 5,088 | 6,054 | 0.00% | 6380/6380 |
| Browse, **one** instance only | 250 | 4,002 | 110.8 | 2,196 | 3,673 | 4,092 | 4,584 | 0.00% | 4000/4000 |
| Sign-in (argon2 check) | 50 | 1,079 | 34.7 | 1,415 | 1,813 | 2,074 | 2,289 | 0.00% | 1077/1077 |
| Sign-in | 100 | 1,235 | 38.4 | 2,510 | 3,466 | 3,863 | 4,368 | 0.00% | 1233/1233 |
| Sign-in | 250 | 1,415 | 38.5 | 5,899 | 6,842 | 7,086 | 7,309 | 0.00% | 1413/1413 |
| Registration | 50 | 487 | 23.3 | 2,101 | 3,403 | 3,640 | 3,913 | 0.00% | 485/485 |
| Enquiry submission (250 students at once, after signing in) | 250 | 502 | 31.8 | 6,565 | 10,045 | 11,294 | 12,113 | 0.00% | 250/250 enquiries created |
| Admin dashboard, **before** caching | 50 | 738 | 23.4 | 2,094 | 2,701 | 2,826 | 2,947 | 0.00% | 686/686 |
| Admin dashboard, **before** caching | 100 | 711 | 21.6 | 4,467 | 6,258 | 6,656 | 6,937 | 0.00% | 609/609 |
| Admin dashboard, **after** caching | 50 | 7,412 | 244.3 | 203 | 498 | 1,379 | 2,264 | 0.00% | 7360/7360 |
| Admin dashboard, **after** caching | 100 | 11,041 | 365.9 | 272 | 371 | 2,671 | 3,536 | 0.00% | 10939/10939 |

"Checks passed" counts the scenario's requests that returned the expected status. The difference from "Requests" is the setup and sign-in calls. **No request failed in any run.**

Unloaded single requests (10 in a row): admin dashboard summary 52–72 ms; college list 19–33 ms.

Memory after the runs: **about 104 MB per API instance**, well within the 512 Mi limit set in the Kubernetes files.

## What the numbers show

1. **No errors at any load tested (up to 500 concurrent users).** The API slows down under load but doesn't fail or drop requests.
2. **The machine's CPU is the limit.** Browsing levels off at about 185–197 req/s from 100 users upwards. More users then mean longer waits, not more throughput.
3. **Horizontal scaling helps:** two instances gave **1.78×** the throughput of one at 250 users (197 vs 111 req/s), with p95 falling from 3.7 s to 2.1 s, even though both share the same 4 cores.
4. **Sign-in and registration are deliberately expensive.** argon2 password hashing is designed to slow down password guessing. They level off at about 38 and 23 per second on this machine, and they scale with CPU cores and instances.
5. **Enquiry submission:** 250 different students submitting at the same moment all got their own enquiry and a unique reference, with 0 errors. The automated test `enquiries.test.ts` also checks uniqueness and isolation.

## Optimisation applied and measured: admin dashboard

The dashboard summary runs about 20 counts and aggregations per request. Under load it was the slowest endpoint (21–23 req/s). It now uses a 20-second staff-only cache (`memo()` in `cache.service.ts`): Redis when available, otherwise in-process. It's checked after the permission check and keyed by the selected filters.

| Users | Before: req/s, p95 | After: req/s, p95 | Change |
|---|---|---|---|
| 50 | 23.4, 2,701 ms | 244.3, 498 ms | **10.4× throughput, p95 −82%** |
| 100 | 21.6, 6,258 ms | 365.9, 371 ms | **16.9× throughput, p95 −94%** |

Trade-off: dashboard figures can be up to 20 seconds old.

## Fewer API requests per page (frontend, measured 2026-11-03)

API requests made while a page loads, counted in the **production build** (`next start`) with the browser's network log:

| Page | Before | After | What changed |
|---|---|---|---|
| Counsellor dashboard | 16 | **10** | The 7 or 14 per-day counts for the trend chart now come from one request (`GET /api/counsellor/trend?days=N`, one MongoDB aggregation) |
| Counsellor My Enquiries | 8 | 8 | No duplicates found |
| Admin dashboard | 3 | 3 | No duplicates found |

The API client also **shares identical GET requests that are in flight at the same moment.** For example, the side menu and the page both load the counsellor summary and the callback count. Each shared request goes out once. Nothing is cached after the answer arrives, so data is never stale. Each caller can still cancel its own wait, and the network request is cancelled only when no caller is left (`frontend/src/services/api.ts`, tested in `api.test.ts`).

In development, React deliberately mounts components twice, so the browser shows cancelled-and-repeated requests. That's expected and doesn't happen in production.

## Not measured (and why)

- **Redis cache hit ratio under load:** Redis wasn't reachable this run (see setup). The cache's behaviour (MISS → HIT → MISS after an admin change, BYPASS without Redis) is proven by `backend/tests/redis.test.ts`. The `cache_hits` and `cache_misses` counters in `loadtest/k6.js` report the ratio when the script is pointed at the scaled stack (`BASES=http://127.0.0.1:8088`).
- **Nginx in the request path, and failover when an instance is stopped:** the configuration is checked (`docker compose … config`). Run the scaled stack (`docs/LOAD_BALANCING.md`) and repeat the browse scenario through `127.0.0.1:8088`.
- **MongoDB query times and connection counts under load,** and host CPU percentages: not instrumented in this run.
- **Loads above 500 users:** not run, because at 500 the single laptop was already saturated, so higher numbers would only measure the laptop.

## How to repeat

```
cd backend
MONGODB_URI=mongodb://127.0.0.1:27017/education_consultancy_loadtest npx tsx ../database/seeds/seed-catalog.ts
MONGODB_URI=… LOADTEST_PASSWORD=<12+ chars> npx tsx ../loadtest/seed-loadtest.ts 500
# start one or more API instances against that database (raise the rate limits for a single-IP test)
k6 run -e SCENARIO=browse -e VUS=250 -e DURATION=30s -e BASES=http://127.0.0.1:5201,http://127.0.0.1:5202 -e PASSWORD=<same> loadtest/k6.js
```
