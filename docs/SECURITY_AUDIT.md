# Security audit

**Scope:** the consultancy system (backend, frontend, deployment files). **Date:** 2026-11-02/03.

Each control below was checked in the code and is covered by the automated tests named in the right-hand column. See TESTING_REPORT.md for the latest run.

## Controls verified

| Area | What is in place | Evidence (tests) |
|---|---|---|
| Passwords | argon2id hashes only; one generic "wrong email or password" message; lockout after 10 failures (stored in MongoDB, independent of Redis) | `auth.test.ts`, `authAudit.test.ts` |
| Email codes (OTP) | Stored only as HMAC hashes; single use; 5 wrong guesses ends a code; resend at most once a minute; per-IP and per-email limits; the same answer for unknown emails | `auth.test.ts`, `otpDelivery.test.ts` |
| Sessions | Server-side sessions in an HttpOnly cookie, idle and absolute expiry; logout ends the session on the server; password change and reset end other sessions. **No JWT** is used, so JWT-specific attacks don't apply | `auth.test.ts`, `access.test.ts` |
| CSRF | Cookie-authenticated writes need an allowed `Origin` | `auth.test.ts` ("refuses cookie-authenticated writes from another site") |
| Roles and permissions | Every `/api/admin` route needs the admin role **and** a specific permission. A test walks the generated route table and fails on any unprotected admin route. Counsellors see only enquiries and callback requests assigned to them | `docs.test.ts`, `access.test.ts`, `counsellorWorkflow.test.ts`, `callbackLead.test.ts` |
| Student data isolation | A student can't read, message or withdraw another student's enquiry, shortlist, comparison, application or payment ("looks like it doesn't exist") | `access.test.ts`, `enquiries.test.ts`, `shortlist.test.ts`, `scholarships.test.ts` |
| Input validation | Zod `.strict()` on every body, query and params schema: unknown fields are refused (422), which also blocks `role` / `$ne` injection | `auth.test.ts`, `callbackLead.test.ts`, `catalog.test.ts` |
| NoSQL injection | Strict schemas reject operator objects; IDs are validated as ObjectIds before queries | `callbackLead.test.ts` (`{ $ne: null }` refused) |
| XSS | React escapes output; email templates escape parameters (`esc`); the CSP (helmet) blocks inline scripts on the API, including Swagger UI | `email.test.ts`, `health.test.ts` (headers) |
| Uploads | Size limits per route; content checked by magic bytes (images, PDF); private files stored outside the web root; served only to the owner or staff with the matching permission | `support.test.ts`, `collegeImages.test.ts`, `collegeCourses.test.ts` |
| Rate limiting | Overall per IP, plus sign-in (IP and account), registration, codes, email requests, token pages, external search and callback leads. **Shared across instances through Redis** (Phase 8), with `Retry-After` on every 429 | `redis.test.ts`, `auth.test.ts` |
| Proxy and IP trust | `trust proxy` is the exact hop count (`TRUST_PROXY`). Nginx overwrites `X-Forwarded-For` | `deploy/nginx/nginx.conf`, LOAD_BALANCING.md |
| Error responses | No stack traces, paths or internal messages; a generic 500 with a `requestId` | `health.test.ts` ("never sends stack traces …") |
| Secrets | Read from the environment only; validated at start-up; values never printed; email secrets encrypted at rest in the queue; `.env` is git-ignored. **Repository scan before the GitHub push found no real keys** (3 matches, all placeholders) | `email.test.ts` ("keeps token links encrypted at rest") |
| Headers and CORS | helmet (CSP, HSTS, nosniff, frame-ancestors); CORS restricted to `CORS_ORIGINS`; `x-powered-by` off | `health.test.ts` |
| Audit trail | Admin and counsellor writes are recorded in `AuditLog`, which is append-only | `access.test.ts` |
| Containers and Kubernetes | Non-root, read-only root filesystem, all capabilities dropped, seccomp, restricted Pod Security, NetworkPolicies | `deploy/k8s` (kubeconform: 36/36 valid) |

## Findings and fixes in this work

| ID | Severity | Finding | Fix | Status |
|---|---|---|---|---|
| S-1 | High | Zod 3.25.76: GHSA-mrhx-c7xc-m3w5 (memory exhaustion on oversized constrained collections) | Upgraded to Zod 4.6.7; the API docs now use Zod's own JSON Schema export (removed `zod-to-json-schema`) | **Fixed.** `npm audit --omit=dev`: 0 high, 0 critical |
| S-2 | High (data integrity) | Found during the upgrade: under Zod 4, `.partial()` fills absent fields with their defaults, so an admin edit of one field would have reset other fields of colleges, courses, locations, offerings and scholarships | `patchOf()` in `validators/common.ts` strips defaults for update bodies | **Fixed.** `patchOf.test.ts`, catalogue and scholarship tests |
| S-3 | Medium | Rate limits were counted per process, so with N instances the limits were N times weaker | Redis-backed counters (Phase 8) | **Fixed** (when `REDIS_URL` is set) |
| S-4 | Low | Errors didn't carry a correlation id for support | `requestId` in every error body | **Fixed** |

## Accepted risks (documented, not fixed)

| Item | Severity | Why accepted | Revisit |
|---|---|---|---|
| exceljs 4.4.0 (latest) brings archiver, zip-stream, readdir-glob, glob, minimatch, rimraf and uuid with 9 **moderate** advisories | Moderate | npm's only suggested "fix" is a **downgrade** to exceljs 3.4.0. The advisories concern zipping folders with glob patterns (not used: the app writes CSV and reads uploaded XLSX) and uuid v3/v5/v6 with a caller-supplied buffer (not used). No user input reaches these code paths. | When exceljs publishes a release with patched dependencies |
| Dev-only tooling (eslint toolchain) advisories | Moderate | Not shipped in production images (`--omit=dev`) | Routine dependency updates |
| 26 `any` types on Zod-validated request objects | Low | Input is validated at runtime by strict Zod schemas before use. It's type debt, not a vulnerability. | Gradual typing work |

## Gate in CI

`npm audit --omit=dev --audit-level=high` runs on every push and pull request, so a new high or critical advisory in production dependencies fails the build.

## Not covered by this audit

- No external penetration test or automated DAST scan was run.
- Production infrastructure isn't covered (network, WAF, backups, Atlas access lists).
- Email deliverability settings (SPF, DKIM, DMARC) aren't covered.

Review these before go-live (PRODUCTION_CHECKLIST.md).
