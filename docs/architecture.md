# Architecture

```
Browser ──> Next.js frontend (:3000) ──fetch──> Express API (:5100, /api) ──> MongoDB (education_consultancy)
```

## Responsibilities
| Folder | Responsibility |
|---|---|
| `frontend/` | Pages (App Router), UI components, browser-side API calls. No secrets; it reads only `NEXT_PUBLIC_*`. |
| `backend/` | REST API, validation, authentication and authorisation (next stage), business rules, database access, email. |
| `database/` | Explicit, non-destructive scripts: seeds and a connection check. Never run at startup. |
| `config/` | Non-secret project configuration examples. |
| `docs/` | Setup, architecture, API and security notes. |

## Backend layers (`backend/src`)
- **`config/`**: `env.ts` (validated settings), `database.ts` (connection, retry, state), `mail.ts` (SMTP or logged mail).
- **`routes/`**: URL mapping only.
- **`controllers/`**: translate HTTP to service calls.
- **`services/`**: business logic.
- **`models/`**: Mongoose schemas with indexes and timestamps.
- **`validators/`**: Zod request schemas.
- **`middleware/`**: `validate`, `errorHandler`, `notFound`.
- **`utils/`**: `ApiError`, `sendSuccess`, `logger`.

Each request goes through: request id → logging → security headers (helmet) → CORS (frontend origin only) → body limits → rate limit → route → validation → controller → service → model. All errors pass through one error handler, which returns a consistent shape:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [{ "field": "limit", "message": "..." }] } }
```

## Frontend (`frontend/src`)
- **`app/`**: routes (home, about, colleges, courses, scholarships, contact, login, register, student, admin).
- **`components/`**: shared UI (header, footer, page shells).
- **`features/`**: feature UI (for example `health/HealthStatus`).
- **`hooks/`**, **`services/`** (API client), **`lib/`** (public config), **`types/`**, **`styles/`** (design tokens).

## Roles
Admin and Student. Every permission is enforced on the backend (route guards plus record ownership checks), never only in the UI.

## Catalogue (Stage 2)
- **Models:** `Location` (region/state/city with `parents`), `Course` (catalogue), `College`, `CollegeCourse` (an offering: duration, eligibility, exams, deadline), `CollegeFee` (versioned fees), `Shortlist` and `SavedComparison`.
- **Derived fields:** `College.locationIds` (the city and every ancestor), `courseIds` and `feeSummary` are recomputed by `refreshCollegeSummary` whenever a location, offering or fee changes; `npm run catalog:rebuild` recomputes them all. Search filters on them with indexes instead of joins.
- **Fees:** one `CollegeFee` document per version. Drafts are editable. Publishing marks the previous published version `superseded`; a unique partial index allows one published version per offering, academic year and intake. Published versions never change, so earlier estimates stay explainable.
- **Fee totals:** `feeCalculator.ts` is the only place they are computed. Each component counts once per occurrence (`per_year` = ceil(months/12), `per_semester` = ceil(months/6), `one_time` and `total_course` = 1). Official fees, optional hostel/transport and the consultancy service charge are kept separate; discounts apply to tuition only.
- **No MongoDB transactions:** a standalone local server has none. Fee publishing supersedes and then publishes, with the unique index and a compensating step guarding races.
- **Frontend:**
  - `features/catalog` covers the directory, detail, compare, courses and student lists; the compare tray lives in sessionStorage only.
  - `features/admin/catalog` covers colleges (Profile, Courses and Fees tabs), courses and locations.
  - Dynamic routes (`/colleges/[slug]`, `/admin/colleges/[id]`) and URL-reading components (including the header and admin shell) render inside `<Suspense>`, as Cache Components require.

## Enquiries and admissions (Stage 3)
- **Collections:**
  - `enquiries`: the student snapshot, preferences, the fee-estimate snapshot, a bounded documents checklist, the assignee and follow-up.
  - `enquiryEvents`: the append-only history and conversation, each event marked `internal` or `student`.
  - `admissionApplications`, `counsellingAppointments`.
  - `counters`: atomic per-year reference numbers.
- **Status rules** live in `services/enquiryWorkflow.ts` (pure, unit-tested; mirrored in `frontend/src/features/enquiry/shared.tsx` for the UI only):
  - Forward moves are allowed, plus one step back.
  - On-hold, rejected, withdrawn and closed can be set from any open status; finished enquiries can only be reopened.
  - Reasons are required for pausing, ending, reopening and going back.
  - Evidence gates guard SUBMITTED and OFFER_RECEIVED.
  - `ADMITTED` comes only from `confirmAdmission`, which needs `admissions.confirm`, an offer and evidence.
  - Status updates use optimistic concurrency: `fromStatus` must match.
- **Automatic steps (each recorded and emailed like a manual change):** a reached contact moves NEW → CONTACTED, the first session booked moves to COUNSELLING_SCHEDULED, and a document request moves to DOCUMENTS_PENDING.
- **Privacy by construction:** `services/enquiryViews.ts` builds student responses from a whitelist of fields and of `student` events only.
- **Duplicates:** prevented by a per-student `idempotencyKey` (unique index; a concurrent second request returns the first) and the "one open enquiry per main course" rule.
- **Scholarships (Stage 4):**
  - Collections: `scholarships` (provider type, benefit, eligibility rules, verification) and `scholarshipApplications` (declared facts, the preliminary result at submission, a bounded status history of at most 50 entries, and the decision).
  - A partial unique index allows one active application per student and scholarship.
  - The pure checker `checkEligibility` is shared by the eligibility endpoints and by application submission.
- **Reminders:** `sendAppointmentReminders` runs every 5 minutes (`startAppointmentReminders` in `server.ts`). It claims each due session atomically, so reminders are sent once per scheduled time.
