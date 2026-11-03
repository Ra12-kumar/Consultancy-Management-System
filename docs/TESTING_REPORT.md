# Testing report

**Final run:** 2026-11-03 on the development machine. All results below come from that run, unless marked otherwise.

## Summary

| Gate | Command | Result |
|---|---|---|
| Lint (backend + frontend) | `npm run lint` | ✅ 0 errors |
| TypeScript (backend + frontend) | `npm run typecheck` | ✅ 0 errors |
| Backend unit and integration tests | `npm run test:coverage` (backend) | ✅ **175 passed**, 3 skipped (Redis suite, see below), 0 failed, 27 files |
| Frontend component tests | `npm run test:coverage` (frontend) | ✅ **95 passed**, 0 failed, 20 files |
| End-to-end (Playwright, Edge) | `npm run e2e` | ✅ **14 passed** (4.2 min) |
| Production build | `npm run build` | ✅ |
| Dependency audit | `npm audit --omit=dev --audit-level=high` | ✅ 0 critical, 0 high (9 moderate accepted, SECURITY_AUDIT.md) |
| Kubernetes manifests | `kubectl kustomize` + kubeconform `-strict` (K8s 1.31) | ✅ 36/36 valid |
| Responsive layout | 51 pages × 8 widths (360, 375, 390, 430, 768, 1024, 1366, 1920) | ✅ 0 sideways overflow (one defect found and fixed) |
| Load tests (k6) | `loadtest/k6.js` | ✅ 0% failed requests in every run (PERFORMANCE_REPORT.md) |

**Redis suite:** `backend/tests/redis.test.ts`, 3 tests (cache MISS/HIT/invalidation; failed and personal answers never cached; rate limits shared across instances with 429 and Retry-After, plus the fallback without Redis). It ran **and passed** on 2026-11-02 against a real Redis (`REDIS_URL_TEST=redis://127.0.0.1:6390/15`). In the final run it was skipped, because Docker (which hosted that Redis) had stopped responding. CI runs it on every push with its own Redis service.

## Coverage (V8, measured in the final run)

| Package | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| Backend (`backend/src`) | **84.15%** (4790/5692) | 70.03% (2695/3848) | 85.85% (1190/1386) | 88.65% (4007/4520) |
| Frontend (`frontend/src`) | **41.74%** (1969/4717) | 37.77% (1856/4913) | 32.29% (651/2016) | 42.83% (1677/3915) |

Most frontend screens are exercised by Playwright, which isn't counted in V8 unit coverage. The lowest-covered frontend areas are the admin management screens (catalogue editing, settings, payments). Raising that number with component tests is the main testing gap left.

## The brief's integration scenarios

| # | Scenario | Covered by |
|---|---|---|
| 1 | Registration → OTP email → verification → active account | `auth.test.ts`, `staffSignup.test.ts`, e2e `journeys.spec.ts` |
| 2 | Student sign-in → dashboard | `auth.test.ts`, e2e |
| 3 | Admin sign-in → admin dashboard | `access.test.ts`, e2e |
| 4 | Admin adds college → stored → visible to students only when published | `catalog.test.ts`, `collegeCourses.test.ts` |
| 5 | Admin adds course → linked to college | `catalog.test.ts`, `collegeCourses.test.ts` |
| 6 | Course pricing → student sees the correct price | `fees.test.ts` (versioned fees, server-computed totals), e2e |
| 7 | Scholarship → eligibility calculated | `scholarships.test.ts`, `recommendations.test.ts` |
| 8 | Enquiry → saved → team notified | `enquiries.test.ts` (emails checked in the outbox) |
| 9 | Admin updates enquiry → student sees the permitted update | `workflow.test.ts`, `crm.test.ts`, e2e |
| 10 | Profile update persists | `access.test.ts` |
| 11 | Profile photo stored securely | `support.test.ts` (content-checked, private, owner or staff only) |
| 12 | Many students submit enquiries at once | **new** `enquiries.test.ts` ("many students at once"); k6 enquiry run (250 at once, 250/250 created) |
| 13 | Cache invalidated after college or course changes | **new** `redis.test.ts` |
| 14 | Unauthorised users can't reach protected data | `access.test.ts`, `docs.test.ts` (every admin route needs a role and permission), `callbackLead.test.ts` |

All of these use separate test databases (`education_consultancy_test`, `_e2e`). The test helpers refuse to run against any other database name.

## Tests added in this work

- `health.test.ts`: unexpected errors never leak internals and carry the `requestId`.
- `enquiries.test.ts`: 8 students submitting in parallel get unique references and see only their own enquiry.
- `redis.test.ts`: cache and shared rate limits (3 tests).
- `patchOf.test.ts`: update validators never fill absent fields with defaults (2 tests).
- `callbackLead.test.ts`: website callback requests in the Enquiries section; older records without notes.
- `collegeFinder.test.ts`: A–Z sort.
- Frontend: `colleges.test.tsx`, `courses.test.tsx`, `callbackLeads.test.tsx`, `landing.test.tsx`, `board.test.tsx`, `dashboards.test.tsx`.

## Test-stability fixes

- Frontend test timeout raised from 5 s to 20 s, and Testing Library's wait from 1 s to 5 s. Multi-step form tests timed out under coverage instrumentation and on a busy machine; they pass alone and now also under coverage.
- Two auth tests compared whole response bodies, which now differ only by the random `requestId`. They compare the error part instead; the "same answer for known and unknown accounts" property is unchanged.

## Not covered

- **Playwright on tablet** isn't a separate project. Tablet widths (768/1024) are covered by the responsive sweep, not by journeys.
- **Browser journeys for admin catalogue and fee editing, uploads and session expiry:** these are covered at the API level only.
- **Mobile Safari and Firefox:** the e2e suite runs on Chromium-based Edge.
