# Database indexes

All indexes are declared in the Mongoose models (`backend/src/models/*.ts`). There are 116 `.index()` declarations, 29 of them unique, across 22 model files, plus MongoDB's own `_id` index on every collection.

| When | How indexes are created |
|---|---|
| Development and tests | Automatically (`autoIndex` is on outside production). |
| Production | `autoIndex` is **off**, so a deploy can't start a surprise index build. Run `npm run migrate:indexes` once after a release that adds indexes. It only **adds** missing indexes (`createIndexes`) and never drops one. |

## Review method (Phase 9)

`explain("executionStats")` was run for the API's most frequent query shapes, taken from the service code. The tool is the read-only script `loadtest/explain-queries.cjs`, run against the development database on 2026-11-02.

The development database is small (from 1 to about 75 documents per collection). On a collection that small, MongoDB sometimes prefers a collection scan even when a usable index exists. Wherever the planner skipped an index, the index was forced with `hint()` to prove it can serve the query.

| Query (service) | Index used | Notes |
|---|---|---|
| Sign-in by email (`auth`) | `user_email_unique` | Unique, normalised email |
| Session by token hash (every signed-in request) | `session_token_unique` | Unique. A TTL index (`session_ttl`) removes expired sessions |
| Public college list, featured first | `college_public_listing` {status, featured, name} | Filter and sort from one index |
| Public list by state, course and fee | `college_by_place`, `college_by_course`, `college_by_fee` | |
| College page by slug | `college_slug_unique` | |
| **Admin college list, newest change first** | **COLLSCAN + in-memory sort**, then **`college_admin_recent` (new)** | **Fixed in Phase 9.** The directory can hold thousands of imported colleges. |
| Offerings of a college | `offering_unique` {college, course, specialization} + small sort | One college has few offerings |
| Active offerings (course browser) | `offering_browse` {status, mode} | |
| Published fee of an offering | `fee_one_published` (partial, unique) + small sort | |
| Student: my enquiries | `enquiry_by_student` {student, createdAt} | |
| Admin: enquiries by status, newest | `enquiry_by_status` {status, createdAt} + sort on `_id` tie-break | Top-k sort of one page only |
| Counsellor: my open enquiries | `enquiry_by_counsellor` {assignedTo, status} | |
| Follow-ups due or overdue | `enquiry_follow_up` (partial: followUpAt is a date) | Planner chose a scan on a 1-document collection; `hint()` confirms the index serves `$lte` and `$gte/$lt` ranges |
| Enquiries by college | `enquiry_by_college` | |
| Enquiry history | `event_by_enquiry` {enquiry, createdAt} | |
| Public scholarships | `scholarship_listing` {status, applicationDeadline} | |
| Callback requests by status / by counsellor | `lead_by_status`, `lead_by_assignee` (new in this release) | |
| Email queue: due messages | `email_due` {status, nextAttemptAt} | |

## Changes made in this work

| Collection | Index | Why |
|---|---|---|
| `colleges` | `college_admin_recent` {updatedAt: -1} | The admin list sorted all colleges in memory. With large AISHE imports that becomes slow and memory-heavy. |
| `callbackleads` | `lead_by_status` {status, createdAt}, `lead_by_assignee` {assignedTo, status, createdAt} | New "Website callback requests" lists for admins and counsellors |

No index was removed. The existing compound indexes already cover the brief's list: student and admin email (unique), college name, location and status, course and college, enquiry student, college, status and date, and scholarship college and course.

The brief's "student marks and eligibility filters" are evaluated in application code against a single student's profile (`eligibility.service.ts`), not with database queries, so no index is needed.

## Not done, and why

- **Text indexes:** college search uses the `normalizedName` prefix index (`college_by_name`) and the in-memory finder. A text index would change search behaviour and needs a product decision.
- **Cursor pagination:** lists use page and limit with indexed sorts. Admin lists are bounded, and the CSV export is capped (`MAX_EXPORT`). Cursor pagination would change the API contract and is worth doing only when collections reach hundreds of thousands of documents.
- **Production-sized `explain()`:** the review used development data. Re-run `loadtest/explain-queries.cjs` against a staging copy of production data before relying on these plans at scale.
