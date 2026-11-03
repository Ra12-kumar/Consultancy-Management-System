# Production checklist

**Status key:** ✅ done and verified here · 🟡 done, needs your environment to confirm · ⬜ your action before go-live.

## Acceptance criteria from the brief

| # | Criterion | Status | Evidence / what's left |
|---|---|---|---|
| 1 | Existing core features work | ✅ | Backend API tests and Playwright journeys (TESTING_REPORT.md) |
| 2 | Critical bugs fixed | ✅ | BUG_REPORT.md: 2 high and 3 medium fixed, none open |
| 3 | Unit tests pass | ✅ | TESTING_REPORT.md |
| 4 | Integration tests pass | ✅ | Backend suite (real MongoDB test database) |
| 5 | End-to-end tests pass | ✅ | Playwright (TESTING_REPORT.md) |
| 6 | TypeScript checks pass | ✅ | `npm run typecheck` |
| 7 | Production build succeeds | ✅ | `npm run build` |
| 8 | Centralised exception handling | ✅ | `errorHandler.ts`, `requestId`, graceful shutdown (SYSTEM_AUDIT.md) |
| 9 | Redis caching with correct invalidation | ✅ / 🟡 | Proven by `redis.test.ts`. Hit ratio under load not measured (PERFORMANCE_REPORT.md) |
| 10 | Distributed rate limiting | ✅ | `redis.test.ts`: two instances share one counter; 429 with Retry-After |
| 11 | MongoDB indexes verified | ✅ | DATABASE_INDEXES.md (`explain`), `migrate:indexes` |
| 12 | Slow queries optimised | ✅ | Admin college list index; dashboard 10–17× faster (PERFORMANCE_REPORT.md) |
| 13 | Load balancing configuration tested | 🟡 | Two instances measured (1.78× throughput); Nginx and Compose configs validated. **Live Nginx run pending** (Docker unavailable here) |
| 14 | No unresolved critical security issues | ✅ | SECURITY_AUDIT.md: 0 critical, 0 high; 9 moderate accepted with reasons |
| 15 | Responsive at required sizes | ✅ | 51 pages × 8 widths (360–1920): 0 overflow after the fix |
| 16 | No broken critical buttons or forms | ✅ | Playwright journeys and component tests |
| 17 | Important workflows load-tested | ✅ | Browse, sign-in, registration, enquiry, dashboard: 0% errors up to 500 users (one laptop) |
| 18 | Monitoring and logging operational | 🟡 | Structured logs with request ids, liveness and readiness. **External error monitoring (Sentry or similar) needs your account** |
| 19 | CI/CD quality gates | ✅ / 🟡 | `.github/workflows/ci.yml` (lint, types, coverage, build, audit, e2e). **First GitHub run pending** |
| 20 | Deployment and recovery docs | ✅ | DEPLOYMENT_GUIDE.md, LOAD_BALANCING.md, KUBERNETES.md |

## Before go-live (your actions)

- ⬜ **Secrets:**
  - Create the production `.env.production` / Kubernetes `api-secrets`: a new random `SESSION_SECRET` (64 hex) and `MONGODB_URI` (Atlas).
  - Email: Brevo API key + verified sender, or SMTP.
  - Razorpay keys, only if online payments are used.
- ⬜ **Domain and HTTPS:** `FRONTEND_URL` and `CORS_ORIGINS` set to the real `https://` domain; certificates (cert-manager or the cloud load balancer).
- ⬜ **Proxy:** `TRUST_PROXY` set to the exact number of proxies in front of the API.
- ⬜ **Database:** Atlas replica set, IP access list or private endpoint, continuous backup on, **one test restore done**. Run `npm run migrate:indexes`.
- ⬜ **Redis:** a managed Redis, or the bundled one, with `REDIS_URL` set (otherwise there's no cache and limits are per instance).
- ⬜ **Uploads:** shared storage (ReadWriteMany volume or object storage) with backups.
- ⬜ **Email deliverability:** SPF, DKIM and DMARC for the sending domain; send a real OTP to a test inbox.
- ⬜ **First admin:** `npm run admin:bootstrap -- --email you@your-domain.in --name "Full Name"` (the set-password link is emailed).
- ⬜ **Sample data:** `npm run seed:remove-samples` if sample colleges were ever seeded into production.
- ⬜ **Monitoring:** an uptime check on `/api/health/ready`; log shipping (pino JSON to your log platform); an error tracker (Sentry DSN) if wanted.
- ⬜ **CI:** watch the first GitHub Actions run go green; protect `main` and require CI before merging.
- ⬜ **Staging:** deploy to staging, run the Playwright suite against it, then a k6 run on staging hardware to set a real capacity figure.
- ⬜ **Load balancer:** run the scaled stack once with Docker (`docs/LOAD_BALANCING.md`); stop one API instance during a k6 run and confirm requests keep succeeding.

## Known limitations (accepted)

- Dashboard figures can be up to 20 seconds old (deliberate cache).
- After a directory import or seed script (anything outside the admin API), public pages can take up to `CACHE_TTL_SECONDS` (5 minutes) to update.
- exceljs's dependencies carry moderate advisories with no non-downgrade fix (SECURITY_AUDIT.md).
- Capacity figures come from one laptop; repeat them on production hardware.
