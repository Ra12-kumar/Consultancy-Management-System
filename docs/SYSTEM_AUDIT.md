# System audit: Udaan education consultancy system

Phase 1 of the production-readiness work. **Audit date:** 2026-11-01. **Scope:** this repository (`backend/`, `frontend/`, `e2e/`, `database/`, `docs/`, Docker and CI files).

All results below were measured on this machine on the audit date. Nothing is estimated. Each later phase updates this file and the checklist at the end.

## 1. Repository at a glance

| Item | Found |
|---|---|
| Tracked files | 274 |
| TypeScript source files (backend, frontend, e2e) | 310 |
| Backend | Express 5, TypeScript, Mongoose 8, Zod 3, argon2, pino and pino-http, helmet, express-rate-limit, multer, nodemailer |
| Backend layout | 22 models, 12 route files, 6 controllers, about 40 services, 5 middleware files |
| Frontend | Next.js 16 (App Router, Turbopack), React, Tailwind CSS 4 |
| Database | MongoDB, local dev database. MongoDB Atlas works through `MONGODB_URI` |
| Sessions | Server-side sessions (`Session` model) in an HttpOnly cookie, with CSRF middleware. **No JWT is used** |
| Redis | **Not used.** Not in any `package.json` and not installed on this machine |
| Socket.IO | **Not used** |
| Containers | `docker-compose.yml` (mongo, api, web), `backend/Dockerfile`, `frontend/Dockerfile`, with health checks |
| Nginx / load balancer | **Not configured.** The compose file publishes the web container on 127.0.0.1:3000 and expects a proxy in front |
| CI | `.github/workflows/ci.yml`: lint, typecheck, unit and API tests, build, then Playwright e2e against a throwaway MongoDB |
| Docs | api, architecture, security, deployment, setup, acceptance, college directory, plus the PRD PDF |

## 2. Quality gates (measured 2026-11-01)

| Check | Result |
|---|---|
| `npm run lint` (backend and frontend) | Pass, 0 errors |
| `npm run typecheck` (backend and frontend) | Pass, 0 errors |
| Backend tests (Vitest and Supertest, real test database) | **173 passed**, 26 files |
| Frontend tests (Vitest and React Testing Library) | **95 passed**, 20 files |
| End-to-end tests (Playwright, Edge, separate e2e database) | **14 passed** (4 user journeys and 10 phone-layout checks) |
| `npm run build` (backend tsc and Next.js production build) | Pass |
| Test coverage | **Not measured yet.** Planned for Phase 4 |
| `npm audit` (production dependencies) | 1 high (zod), 9 moderate, 0 critical |
| `npm audit` (all dependencies) | 1 high, 25 moderate, 0 critical. Most are in eslint and archiver, which are build-time tools |

## 3. What already exists (keep and build on)

| Area | Existing implementation |
|---|---|
| Central error handling | `middleware/errorHandler.ts` turns these into safe 4xx/5xx JSON responses: `ApiError`, Zod errors, Mongoose ValidationError and CastError, duplicate key (11000), multer errors, JSON parse errors, oversized bodies, and database unavailable (503 with `Retry-After`). No stack traces are sent to clients; 5xx errors are logged. |
| Request correlation | An `X-Request-Id` on every request (an incoming id is accepted only if it is safe), carried in pino-http logs |
| Process safety | Graceful shutdown on SIGTERM and SIGINT, bounded at 8 seconds. Unhandled rejections and uncaught exceptions are logged as fatal, then the process shuts down cleanly |
| Health | Liveness at `/api/health` and readiness that checks the database, with no hosts or credentials exposed |
| Security headers and CORS | helmet; CORS restricted to `CORS_ORIGINS`; `x-powered-by` off; `trust proxy` set from `TRUST_PROXY` |
| Body limits | JSON and form bodies are capped at 100 KB. Uploads are capped per route (multer) and checked by content type |
| Rate limiting | Overall API limit, plus separate limits for sign-in (per IP and per account), registration, emailed codes, emails sent on request, token pages, outside searches and callback leads. All return 429 with standard `RateLimit` headers. **They are stored in memory per process** (see finding F-03) |
| Auth | argon2 password hashing; email codes stored as HMAC hashes, single use, with an attempt limit; HttpOnly session cookie; CSRF check; staff invitation codes; MFA support for admins; role and permission checks on every admin route (`docs.test` enforces this) |
| Indexes | Every model declares indexes: 116 `.index()` calls and 29 unique constraints across 22 models |
| Queries | `.lean()` is used in about 300 places |
| Audit trail | `AuditLog` records admin and counsellor writes |
| Email | A queue (`EmailDelivery`) with a retrying worker; secret values are encrypted and kept out of stored subjects |

## 4. Findings

Severity: **High** means a release blocker or a security or data risk. **Medium** means it should be fixed before real traffic. **Low** means it's worth improving.

| ID | Area | File(s) | Finding | Severity | Planned fix (phase) |
|---|---|---|---|---|---|
| F-01 | Dependencies | `backend/package.json` (zod 3.25.76) | GHSA-mrhx-c7xc-m3w5: Zod before 4.6.6 can use excessive memory when validating oversized constrained collections. The fix is a major upgrade to Zod 4. The 100 KB body limit and `.max()` limits on arrays reduce the exposure. | High (mitigated) | Phase 11: upgrade to Zod 4 with the full test suite, or document the accepted risk if you decide against it |
| F-02 | Dependencies | exceljs → archiver/uuid; eslint toolchain | 9 moderate advisories in production dependencies. Most are in the Excel export path (archiver, uuid, glob, minimatch); the rest are in build-time tooling. | Medium | Phase 11: update exceljs if a fixed version exists, otherwise document |
| F-03 | Scaling | `middleware/rateLimits.ts`, `app.ts`, `lead.routes.ts` | Rate limits are stored in memory. With several API instances behind a load balancer, each instance counts separately, so the real limit becomes N times larger. | High for multi-instance deployment | Phase 8: a Redis-backed store, enabled when `REDIS_URL` is set, with in-memory as the fallback |
| F-04 | Performance | catalog, colleges, courses, site content | No caching layer. Public listings hit MongoDB on every request. | Medium | Phase 7: Redis cache-aside for public data only, with invalidation on admin writes |
| F-05 | Scaling | deployment | No Nginx or load-balancer configuration, and no multi-instance compose setup. | Medium | Phase 10: `deploy/nginx.conf` and a compose profile with 2 API instances |
| F-06 | Frontend | `frontend/src/app` | No `not-found.tsx`, `error.tsx` or `global-error.tsx`. Unknown pages show the plain Next.js 404, and an unexpected render error shows the framework's default screen instead of a branded page with a way back. | Medium | Phase 2: add branded 404 and error pages |
| F-07 | API contract | `errorHandler.ts` | Error responses are `{ success:false, error:{ code, message, details? } }`, not the shape suggested in the brief, and do not include `requestId`. The frontend reads the existing shape, so changing it would break every screen. | Low | Phase 3: add `requestId` to error responses and keep the current shape |
| F-08 | Monitoring | backend, frontend | No external error monitoring (Sentry or similar) and no metrics endpoint. | Medium | Phase 14: optional Sentry through `SENTRY_DSN` (off when unset); document it |
| F-09 | Testing | e2e | E2E covers 4 journeys plus phone layouts. Admin college, course and fee creation, scholarships, uploads and session expiry are not covered in the browser (they are covered by API tests). Tablet and the full 360–1920 px width list are not covered. | Medium | Phase 6 (journeys) and Phase 12 (all required widths) |
| F-10 | Testing | all | Test coverage is not measured. | Low | Phase 4: add coverage reporting and record the numbers |
| F-11 | Load | all | Never load-tested. No k6 or Artillery script. | Medium | Phase 13: k6 scripts. **This needs k6 installed**; it is not on this machine |
| F-12 | Ops | `server.ts:25` | `disconnectDatabase().catch(() => {})` during shutdown drops the error without logging it. | Low | Phase 3: log at warn level |
| F-13 | Docs | `docs/` | The documents the brief asks for (BUG_REPORT, TESTING_REPORT, DATABASE_INDEXES, REDIS_CACHING, LOAD_BALANCING, PERFORMANCE_REPORT, PRODUCTION_CHECKLIST, …) don't exist. Some content is already in api.md, security.md and deployment.md. | Low | Each phase writes its own document |

Not found: no `@ts-ignore` or `@ts-expect-error`. There are 59 `eslint-disable` comments in total. Most are scoped, explained exceptions (`no-img-element` for local SVGs, and hook dependency rules), and they get a review in Phase 2.

## 5. Corrections to the brief's assumptions about this system

- **No JWT.** Sessions are server-side and stored in MongoDB, so the brief's "JWT expired or invalid" handling maps to session expiry and invalid sessions, which already return 401.
- **No Socket.IO**, so no Redis adapter or sticky sessions are needed.
- **No Redis yet.** Adding it is new infrastructure. It will be **optional** (`REDIS_URL`), so local development and the existing tests keep working without it.
- **Response shape:** the existing `{ success, data, meta }` and `{ success, error }` contract is kept (see F-07).

## 6. Environment limits on this machine

| Needed for | Status |
|---|---|
| Redis (Phases 7–8 live tests) | Not installed. Docker Desktop is installed **but not running**. Start it (or install Memurai / Redis) to test Redis live; otherwise Redis code is unit-tested against an in-memory fake only. |
| k6 or Artillery (Phase 13) | Not installed. |
| Nginx (Phase 10) | Not installed; would run inside Docker. |
| Sentry (Phase 14) | Needs your DSN; it is only documented until one is provided. |

## 7. Implementation checklist

| Phase | Work | Status |
|---|---|---|
| 1 | Inspect and audit the repository; this report | **Done** |
| 2 | Fix bugs: branded 404/error pages (F-06), review the eslint-disable comments, click-through of key screens | Not started |
| 3 | Error handling additions: `requestId` in error responses (F-07), log the shutdown error (F-12) | Not started |
| 4 | Unit tests: coverage reporting (F-10), gaps found by coverage | Not started |
| 5 | Integration tests: the brief's 14 scenarios mapped to existing API tests, with the missing ones added | Not started |
| 6 | Playwright: admin catalogue, fee and scholarship flows, uploads, session expiry (F-09) | Not started |
| 7 | Redis cache-aside for public data, with invalidation (F-04) | Not started |
| 8 | Redis-backed rate limiting with Retry-After (F-03) | Not started |
| 9 | Index review using `explain()` on the main queries; DATABASE_INDEXES.md | Not started |
| 10 | Nginx config, 2-instance compose profile, LOAD_BALANCING.md (F-05) | Not started |
| 11 | Security: zod (F-01), exceljs (F-02), SECURITY_AUDIT.md | Not started |
| 12 | Responsive checks at 360/375/390/430/768/1024/1366/1920 px on every page | Not started |
| 13 | k6 load tests at 50/100/250/500 users (F-11); PERFORMANCE_REPORT.md | Not started (needs k6) |
| 14 | Monitoring: optional Sentry, CI dependency check (F-08) | Not started |
| 15 | Final verification; PRODUCTION_CHECKLIST.md | Not started |
