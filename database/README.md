# Database

MongoDB with Mongoose. This project's databases:

| Database | Purpose |
|---|---|
| `education_consultancy` | Development (from `MONGODB_URI` in the root `.env`) |
| `education_consultancy_test` | Automated tests only (set in `backend/vitest.config.ts`) |

Connection logic lives in `backend/src/config/database.ts`. Models live in `backend/src/models/`, with indexes and timestamps.

## Scripts (explicit only, never run at startup)
| Command | Script | What it does |
|---|---|---|
| `npm run db:check` | `scripts/check-connection.ts` | Connects and lists the database name and collections. Read-only. |
| `npm run seed:catalog` (also `npm run seed`) | `seeds/seed-catalog.ts` | Adds locations, the course catalogue and 10 **fictional sample colleges** with illustrative fees. Samples have `isSample: true`, names starting with "Sample", and no accreditation claims, and the UI labels them "Sample data – not a real institution". The seed inserts only what is missing and refuses to run in production. |
| `npm run seed:remove-samples` | `scripts/remove-samples.ts` | Deletes every sample college with its offerings, fees, shortlist entries and saved comparisons, plus every sample scholarship (and any scholarship of a sample college) with its applications. Nothing else. |
| `npm run catalog:rebuild` | `scripts/rebuild-catalog.ts` | Recomputes the colleges' derived fields (location ancestry, courses, fee range). |
| `npm run migrate:stage2` | `scripts/migrate-stage2.ts` | One-off upgrade of a Stage 1 database; run it after `seed:catalog`. It does four things: <br>• Stage 1 colleges get a `status` (active → draft, inactive → archived), so nothing becomes public. <br>• The three Stage 1 dev colleges are marked as samples. <br>• Cities are linked by name. <br>• College indexes are synced (the obsolete `college_city_listing` index is replaced). |
| `npm run migrate:stage3` | `scripts/migrate-stage3.ts` | One-off: grants the new `admissions.confirm` permission to owner admins (those with `admins.manage`) and creates the indexes for `enquiries`, `enquiryEvents`, `admissionApplications` and `counsellingAppointments`. |
| `npm run migrate:stage5` | `scripts/migrate-stage5.ts` | One-off: grants `feedback.manage` and `privacy.manage` to owner admins and creates the indexes for `storedFiles`, `feedback` and `dataRequests`. |
| `npm run migrate:stage7` | `scripts/migrate-stage7.ts` | One-off: grants `content.manage` and `payments.manage` to owner admins and creates the indexes for site settings, email templates, pages, announcements and payments. |
| `npm run admin:bootstrap` | `scripts/bootstrap-admin.ts` | Creates the first administrator (see `docs/setup.md`). |

Nothing in this project drops, resets or migrates a database automatically: every script above runs only when you call it.
