# API

Base URL: `/api`. The browser calls this through the frontend (http://localhost:3000/api, proxied to the backend on :5100), so the session cookie stays first-party.

- **Success:** `{ "success": true, "data": ..., "meta"?: {...} }`
- **Failure:** `{ "success": false, "error": { "code", "message", "details"? } }`
- Every response has an `X-Request-Id` header.
- **Authentication:**
  - The `ec_sid` HttpOnly session cookie (SameSite=Lax, Secure in production).
  - Writes that carry the cookie must come from an allowed origin (CSRF check), otherwise the answer is `403 CSRF_REJECTED`.

## Health
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/health/ready` | `{ status, database, mail }`; 503 when the database is unavailable |

## Auth (`/api/auth`)
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/register` | public | `{ name, email, mobile, password, qualification?, preferredCourse?, preferredLocation? }`. Always creates a **student**; unknown fields (e.g. `role`) give 422. Emails a 6-digit code. The same answer is returned for an existing email (no enumeration). |
| POST | `/login` | public | `{ email, password }`. The error is always "Email or password is incorrect". A student with an unverified email gets 403 `EMAIL_NOT_VERIFIED` (only after a correct password) and a fresh code. Locks for 15 min after 10 failures. Rate limited. |
| POST | `/verify-otp` | public | `{ email, code }` (6 digits). Verifies the email and signs the student in (`{ user, signedIn }`). Codes last 10 min, work once, stop after 5 wrong guesses; one answer (400 `INVALID_CODE`) for wrong, used, expired codes and unknown emails. Rate limited per IP and per email. |
| POST | `/logout` | any | Ends this session |
| POST | `/logout-all` | signed in | Ends every session of the user |
| GET | `/me` | signed in | The signed-in user |
| POST | `/verify-email` | public | `{ token }`, single use, 24 h (links in emails sent before codes were introduced) |
| GET | `/email-delivery` | public | `{ available }`: whether codes can be emailed at all (same answer for everyone). Register and resend answers also carry `emailDelivery`; when false, the message says no code was sent. |
| POST | `/resend-verification` | public | `{ email }`, emails a new code; at most once a minute and 5 an hour; generic answer, rate limited |
| POST | `/forgot-password` | public | `{ email }`, generic answer, rate limited |
| POST | `/reset-password` | public | `{ token, password }`, single use, 30 min; signs out all devices |
| POST | `/set-password` | public | `{ token, password }`, admin invitation link, 72 h |
| POST | `/change-password` | signed in | `{ currentPassword, newPassword }`; signs out other devices |

## Students (`/api/students`)
| Method | Path | Access |
|---|---|---|
| GET | `/me` | student (own account) |
| PATCH | `/me` | student: `{ name?, mobile? }` only. Email and role cannot be changed. |
| GET / PUT | `/me/profile` | student: personal and academic profile (strict schema; the percentage is derived on the server) |
| GET | `/:id` | the student themself, or an admin with `students.read`. Anyone else gets 404. |

## Admin (`/api/admin`, admins only, plus the listed permission)
| Method | Path | Permission |
|---|---|---|
| GET | `/dashboard/summary` | `students.read` |
| GET | `/students?q=&verified=yes\|no&sort=newest\|oldest\|name&page=&limit=` | `students.read` |
| GET | `/admins` | `admins.manage` |
| POST | `/admins` | `admins.manage`. Body `{ name, email, permissions[] }` sends an invitation. You can only grant permissions you hold. |
| PATCH | `/admins/:id/permissions` | `admins.manage`. Not allowed on your own account; that admin's sessions end. |
| GET | `/email/status` | `email.view`. Provider, missing settings, last SMTP login check. |
| GET | `/email/deliveries?status=&template=&page=` | `email.view`. Delivery log, never bodies or links. |
| GET | `/audit-logs?action=&page=` | `audit.read` |

## Catalogue (public, read-only)
Only active locations and courses, and **published** colleges and fees, are ever returned. Money is integer paise (`…Minor`). Every fee total is calculated by the server (`backend/src/services/feeCalculator.ts`).

| Method | Path | Notes |
|---|---|---|
| GET | `/locations` | Regions, states and cities with their `parents` (districts are listed per state below) |
| GET | `/courses` | The course catalogue |
| GET | `/colleges?q=&course=&location=&state=&district=&type=&ownership=&category=&approval=&scholarship=yes&hostel=yes&intake=&feeBasis=total|annual&minBudget=&maxBudget=&maxHostel=&maxOverall=&includeUnverified=yes&percentage=&sort=&page=&limit=` | `q` matches name, alias, AISHE code, city, district, state or course. `location`, `state`, `district` are location slugs. Budgets are paise on the chosen `feeBasis` (`total` = whole course, `annual` = per year); only verified published fees match, unless `includeUnverified=yes` also adds colleges with no comparable fee. A missing fee is never treated as zero. `minBudget` > `maxBudget` is 422. `sort`: `featured`, `name`, `fee_low`, `fee_high`, `recently_verified`, `recently_updated`. Each card has `listingLevel` (`basic`/`detailed`), `source`, `stale` and `fee` `{ basis, amountMinor, status: verified|not_verified|not_comparable }`. `meta` has `hasSamples`, `feeBasis` and `coverage`. |
| GET | `/colleges/filters` | States (with slugs and counts), ownership and category counts, approval bodies, and `coverage` (`total`, `statesCovered`/`statesTotal`, `withVerifiedFees`, `sources`, `lastImportAt`, `partial`). |
| GET | `/colleges/search?q=` | Third-party name search via CollegeDB (2–80 characters, at most 5 results, cached; 30 per IP per 10 minutes). Results: `{ id, name, city, state, local }`. `local` links a matching published college in our directory. 503 `COLLEGEDB_NOT_CONFIGURED` / `COLLEGEDB_QUOTA_EXHAUSTED` / `COLLEGEDB_UNAVAILABLE`, 502 on provider errors. |
| GET | `/colleges/external/:id` | One CollegeDB record (UUID): `aliases`, `type`, `typeLabel`, `providerUpdatedAt`. |
| GET | `/colleges/districts?state=` | Districts of a state with published institutions (404 for an unknown state). |
| GET | `/colleges/compare?colleges=a,b[,c,d]&course=` | 2–4 slugs. Unpublished ones are left out and listed in `missing`; fewer than two left gives 404. |
| GET | `/colleges/:slug` | Profile, active offerings, and the current published fee per academic year and intake, each with a breakdown: `lines`, `officialTotalMinor`, `discountMinor`, `consultancyServiceChargeMinor` (separate), `estimatedTotalMinor`, `optionalTotalMinor` (hostel/transport, not in the estimate). Drafts and archived colleges answer 404. |

Public fees also return `annualOfficialMinor` and `hostelAnnualMinor` (null when not comparable per year). See `docs/college-directory.md` for data sources and coverage.

## Recommendations (`/api/students`, students only)
| Method | Path | Notes |
|---|---|---|
| GET | `/me/recommendations` | `{ basis, items, deadlines }`: published colleges matching the latest enquiry and profile preferences (course, location, budget), else featured colleges; `basis` says which preferences matched. `deadlines`: shortlisted colleges whose admission deadline is in the next 60 days. |

## Student shortlist and comparisons (`/api/students`, students only)
| Method | Path | Notes |
|---|---|---|
| GET / POST | `/me/shortlist` | `{ collegeId, note? }`; published colleges only; up to 50 |
| DELETE | `/me/shortlist/:collegeId` | |
| GET / POST | `/me/comparisons` | `{ name, colleges: [2–4 ids], course? }`; up to 20 |
| DELETE | `/me/comparisons/:id` | Another student's comparison answers 404 |

## Catalogue administration (`/api/admin`)
| Method | Path | Permission |
|---|---|---|
| GET / POST | `/locations` | `catalog.manage` |
| PATCH / DELETE | `/locations/:id` | `catalog.manage` (delete only when unused; otherwise deactivate) |
| GET / POST | `/courses` | `catalog.manage` |
| PATCH / DELETE | `/courses/:id` | `catalog.manage` (delete only when no college offers it) |
| GET / POST | `/colleges?q=&status=&sample=&page=` | `catalog.manage`. New colleges are always drafts; `isSample` and derived fields are refused. |
| GET | `/colleges/:id` | `catalog.manage` or `pricing.manage` |
| PATCH | `/colleges/:id` | `catalog.manage` |
| POST | `/colleges/:id/publish` · `/archive` · `/restore` | `catalog.manage`. Publishing needs a city, a type and `lastVerifiedAt` (422 `NOT_READY`). |
| POST | `/colleges/:id/offerings` | `catalog.manage` |
| PATCH / DELETE | `/offerings/:id` | `catalog.manage` (delete only without fee history) |
| GET / POST | `/offerings/:id/fees` | `pricing.manage`. Every version (history); POST creates a draft. |
| PUT | `/fees/:id` | `pricing.manage`. Drafts only; published versions answer 409 `FEE_LOCKED`. |
| POST | `/fees/:id/publish` | `pricing.manage`. Needs `sourceRef` and `lastVerifiedAt`. The previous published version for the same offering, year and intake becomes `superseded`. |
| POST | `/fees/:id/archive` | `pricing.manage` |
| POST | `/fees/preview` | `pricing.manage`. Runs the calculator without saving. |

## College photos and featured order (`/api/admin`, `catalog.manage`)
| Method | Path | Notes |
|---|---|---|
| POST | `/colleges/:id/images` | multipart `file` (JPEG/PNG/WebP by content, 5 MB) and `alt`; at most 12 per college; the first becomes primary |
| PATCH | `/colleges/:id/images` | `{ order?: [imageId…], primary?: imageId, alts?: { imageId: text } }`; the order must list every photo once |
| PUT | `/colleges/:id/images/:imageId` | multipart `file`: replaces the picture, keeping position, caption and primary flag |
| DELETE | `/colleges/:id/images/:imageId` | removes the photo and its file |
| GET / PUT | `/colleges/featured` | the featured colleges in order / `{ ids: [...] }` replaces the list (archived colleges refused) |

Public: `GET /api/colleges/images/:fileId` serves only files stored as college photos (`nosniff`, sandboxed, cached). Cards carry `imageUrl` (primary photo, else the cover URL), `featuredRank`, `academicSession`, `admissionDeadline`, `applicationUrl`; the detail adds `gallery`, `eligibility`, `entranceExams`, `facilities`, `highlights`. `sort=featured` follows the admins' order.

## College data administration (`/api/admin`, `catalog.manage`)
| Method | Path | Notes |
|---|---|---|
| GET | `/college-importers` | Available authorised sources, how to obtain each file, licence |
| POST | `/college-imports` | multipart: `file` (.xlsx/.csv, ≤60 MB), `importer`, `sourceDataDate?`, `fullSnapshot=yes|no`. Columns are checked before queueing (415 `UNSUPPORTED_FILE`, 422 `MISSING_COLUMNS`). 202 with the queued job. |
| GET | `/college-imports?page=` · `/college-imports/:id` | Status, progress, counts, the first 200 row errors |
| POST | `/college-imports/:id/retry` | Failed or interrupted jobs continue from their checkpoint (409 `NOT_RETRYABLE` otherwise) |
| GET | `/directory/reviews?kind=&status=open|resolved` | Possible duplicates and field conflicts from imports |
| POST | `/directory/reviews/:id/resolve` | `{ action, note? }`: `not_duplicate`, `archive_new`, `archive_existing` (duplicates); `keep_current`, `accept_incoming` (conflicts). Nothing is deleted. |
| GET | `/directory/stale?reason=not_in_source|verification_due` | Records missing from the latest complete import, or verified over a year ago |
| GET | `/directory/coverage` | Overall coverage and counts by state |

Admin edits to imported fields lock them against later imports (`lockedFields`); differing source values become review items. A duplicate AISHE code on a college answers 409 `AISHE_CODE_IN_USE`.

Every catalogue and pricing change is written to the audit log (`catalog.*`, `pricing.*`). The dashboard summary (`/dashboard/summary`) also returns catalogue counts.

## Enquiries, applications and appointments: students
These are signed-in students' own records only; anything else answers 404. Writes also need a verified email (403 `EMAIL_NOT_VERIFIED`).

| Method | Path | Notes |
|---|---|---|
| POST | `/enquiries` | Body: `{ idempotencyKey, courses[1–3], specialization?, locations[≤5]?, colleges[≤5]?, institutionTypes?, budgetMinor?, hostel?, scholarship?, admissionYear, intake?, entranceExamNotes?, counsellingRequest? }` (strict). <br>• **201:** returns the reference `ENQ-YYYY-NNNNNN`, status `NEW`, and fee estimates snapshotted from published fees. <br>• **Retry with the same key:** 200 with `duplicate: true`. <br>• **Duplicate:** a second open enquiry with the same main course gives 409 `DUPLICATE_ENQUIRY`; `details[0].message` is the existing reference. |
| GET | `/enquiries` · `/enquiries/:reference` | Student view: status label, student message, documents, student-visible timeline, applications, appointments. It never includes internal notes, contact attempts, status reasons or outcome notes. |
| POST | `/enquiries/:reference/messages` | `{ body }`; emails the counsellor |
| POST | `/enquiries/:reference/withdraw` | `{ reason }` |
| GET | `/admissions` | My college applications |
| GET | `/appointments` | My counselling sessions |
| POST | `/appointments/:id/confirm` · `/reschedule` · `/cancel` | `{ note }` (required to reschedule or cancel; emails the counsellor) |
| GET | `/students/me/updates?page=` | Notifications feed (student-visible events) |

## Enquiry CRM additions
- Statuses also include `CONTACT_PENDING`, `INTERESTED` (pipeline) and `NOT_INTERESTED` (finished; needs a reason). `ADMITTED` (shown as "Admission confirmed") is still reached only by confirming an application with evidence.
- `POST /api/enquiries` also accepts `source` (lead source: `college_search`, `live_search`, `featured_college`, `top_colleges`, `college_page`, `compare`, `shortlist`, `recommended`, `home`, `campaign`, `direct`), `campaign` and `callbackTime` (`any`, `morning`, `afternoon`, `evening`).
- `POST /api/enquiries/:reference/callback-request` (student, verified): `{ kind: callback|counselling, preferredDate?, slot, mode, note }`. Recorded on the timeline, emailed to the counsellor (or the team) and shown until a contact attempt or a booked session settles it.
- `GET /api/admin/enquiries` also takes `quick=new|today|overdue|callback|admitted` (today/overdue use IST days) and `source`; rows include `studentMobile`, `colleges`, `source`, `callbackTime`, `callbackRequested`, `lastContactAt`.
- `GET /api/admin/enquiries/export` (needs `enquiries.manage` and `reports.export`): the same filters as CSV (max 5,000 rows, formulas neutralised, audited as `enquiry.exported`).
- `GET /api/admin/dashboard/summary` adds `enquiries.pending|interested|followingUp|followUpsToday|followUpsOverdue|callbackRequests`, `conversionRate` and `charts` (`enquiriesByDay` for 30 days, `byStatus`, `topColleges`, `bySource`).

## Enquiries, applications and appointments: admin (`/api/admin`, `enquiries.manage`)
| Method | Path | Notes |
|---|---|---|
| GET | `/enquiries` | Query parameters: <br>• `q`: reference, name, email or mobile <br>• `status` <br>• `open=yes` <br>• `assigned=me\|unassigned\|<id>` <br>• `course`, `college`, `state` <br>• `from`, `to` <br>• `followUpDue=yes` <br>• `sort=newest\|oldest\|activity\|follow_up` <br>• `page` |
| GET | `/enquiries/:id` | Full record with every event (internal and student-visible) and `allowedTransitions` |
| GET | `/counsellors` | Active admins with `enquiries.manage` |
| PATCH | `/enquiries/:id` | `{ assignedTo?, followUpAt? }`; assignment emails the counsellor |
| POST | `/enquiries/:id/status` | `{ fromStatus, toStatus, reason?, studentMessage? }`. Possible errors: <br>• 409 `STATUS_CHANGED` when `fromStatus` is stale <br>• 422 `INVALID_TRANSITION` <br>• 422 when a required `reason` is missing <br>• 422 `NEEDS_APPLICATION` (`SUBMITTED` and `OFFER_RECEIVED` need a matching application) <br>• 422 `USE_CONFIRM_ADMISSION` for `ADMITTED` |
| POST | `/enquiries/:id/notes` · `/contact-attempts` · `/messages` | Internal note; contact attempt `{ channel, outcome, note }` (`reached` moves NEW → CONTACTED); message to the student (emailed) |
| POST / PATCH | `/enquiries/:id/documents` · `/enquiries/:id/documents/:docId` | Request documents `{ names[], note }` (emails the student; moves an early enquiry to DOCUMENTS_PENDING) and update one (`requested`/`received`/`waived`) |
| POST | `/enquiries/:id/documents/remind` | Reminder email (once per day) |
| POST | `/enquiries/:id/applications` | `{ college, course, applicationNumber?, status: planned\|submitted }`. Gives reference `APP-YYYY-NNNNNN`. |
| PATCH | `/applications/:id` | Any status except `admitted`; a confirmed admission is locked (409) |
| POST | `/applications/:id/confirm-admission` | **Also needs `admissions.confirm`.** Body `{ evidenceType, evidenceReference, studentMessage? }`; the application must be `offer_received`. Sets the application to `admitted` (with the verifier) and the enquiry to `ADMITTED`. |
| GET | `/applications?status=&page=` | All applications |
| POST | `/enquiries/:id/appointments` | `{ startsAt (ISO with offset), durationMinutes, mode, meetingDetails?, agenda?, counsellor? }`. Must be in the future; 409 `COUNSELLOR_BUSY` on an overlap. |
| PATCH | `/appointments/:id` | Change time or details. A new time needs the student's confirmation again and resets the reminder. |
| POST | `/appointments/:id/cancel` · `/complete` · `/no-show` | `{ note }` |
| GET | `/appointments?from=&to=&counsellor=me\|<id>&status=&page=` | |

## Scholarships
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/scholarships?q=&provider=college\|consultancy\|government&college=&course=&state=&open=yes&page=` | public | Published only; sorted by deadline |
| GET | `/scholarships/:slug` | public | Benefit, criteria, documents, deadline, official page, `isSample` |
| GET | `/scholarships/eligibility?familyIncomeMinor=&category=&gender=&course=` | student | Preliminary check against every published scholarship. Marks and state come from the profile; courses come from the declared course or the student's open enquiries. Declared values are not stored. Each result is `likely_eligible`, `not_eligible` or `needs_review`, with reasons. |
| GET | `/scholarships/:slug/eligibility?…` | student | The same check for one scholarship |
| GET / POST | `/scholarship-applications` | student (POST needs a verified email) | Body `{ scholarship, enquiry?, statement?, familyIncomeMinor?, category?, gender?, course? }`. <br>• Returns reference `SCH-YYYY-NNNNNN`. <br>• 422 `NOT_ELIGIBLE` with reasons when the preliminary check fails. <br>• 409 `ALREADY_APPLIED` or `SCHOLARSHIP_CLOSED`. <br>The student view never includes internal notes. |
| POST | `/scholarship-applications/:reference/withdraw` | student (own) | |
| GET / POST | `/admin/scholarships` | `scholarships.manage` | New scholarships are drafts; `isSample` is refused |
| GET / PATCH | `/admin/scholarships/:id` | `scholarships.manage` | |
| POST | `/admin/scholarships/:id/publish` · `/archive` · `/restore` | `scholarships.manage` | Publishing needs `lastVerifiedAt`, plus: <br>• `officialUrl` for government schemes <br>• a college for college scholarships <br>• a benefit value unless the type is `other` |
| GET | `/admin/scholarship-applications?q=&status=&scholarship=&page=` · `/:id` | `scholarships.manage` | |
| POST | `/admin/scholarship-applications/:id/review` | `scholarships.manage` | `{ status: under_review\|documents_pending, note, internalNote? }` |
| POST | `/admin/scholarship-applications/:id/decision` | **`scholarships.approve`** | `{ decision: approved\|rejected, note, awardMinor? }` |

The college directory also accepts `scholarship=yes` (colleges with a published college scholarship).

## Two-step sign-in, site content, announcements, payments (Stage 7)
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/auth/login` | public | Normally returns `{ user }`. For admins with two-step sign-in it returns `{ mfaRequired: true, challenge }` and no session. |
| POST | `/auth/mfa/verify` | public (rate limited) | `{ challenge, code }`. `code` is a 6-digit authenticator code or a recovery code. Codes cannot be replayed; the challenge lasts 5 minutes. |
| POST | `/auth/mfa/setup` · `/enable` · `/disable` | admin | Setup returns the secret and `otpauth://` link. Enable returns 8 recovery codes, shown once. Disable needs the password and a code. |
| GET | `/site` | public | Organisation contact details, active website banners, whether online payment is on |
| GET | `/pages/:slug` | public | `about`, `faq`, `privacy`, `terms`, `admission-process` or `contact`; 404 until edited (the site then shows its built-in text) |
| GET | `/students/me/announcements` | student | Active announcements for this student |
| GET | `/payments` · `/payments/:reference` | student (own) | Payment requests and receipts |
| POST | `/payments/:reference/order` | student (own, verified) | Creates the Razorpay order. 503 `PAYMENTS_DISABLED` until keys are set. |
| POST | `/payments/:reference/verify` | student (own) | `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`. The signature is checked on the server before the payment is marked paid. |
| POST | `/payments/webhook` | Razorpay | Signature (`X-Razorpay-Signature`, webhook secret) checked on the raw body; handled once only |
| GET / PUT | `/admin/settings/site` | `settings.manage` | Organisation details |
| GET / PUT | `/admin/email-templates` · `/:template` | `settings.manage` | Subject and introduction per template (placeholders `{{name}}`, `{{reference}}`, `{{app}}`); empty values restore the default |
| GET / PUT / DELETE | `/admin/pages` · `/:slug` | `content.manage` | Safe Markdown subset. 20 earlier versions are kept; DELETE goes back to the built-in text. |
| POST | `/admin/pages/:slug/restore/:revisionId` | `content.manage` | |
| GET / POST | `/admin/announcements` | `content.manage` | `{ title, body, audience: public\|students_all\|students_verified\|students_open_enquiry, sendEmail, expiresAt }`. At most 5,000 email recipients. |
| POST | `/admin/announcements/:id/withdraw` | `content.manage` | |
| POST | `/admin/enquiries/:id/payments` | `payments.manage` | `{ amountMinor, description }`: a request for the consultancy service charge (never college fees) |
| GET | `/admin/payments` · `/admin/payments/status` | `payments.manage` | |
| POST | `/admin/payments/:id/cancel` | `payments.manage` | Unpaid requests only |
| GET | `/admin/dashboard/summary?from=&to=&course=&college=&state=&status=&scholarshipStatus=` | `students.read` | Dashboard figures narrowed by the filters |

## Uploads, feedback, personal data, reports (Stage 5)
Full, always up-to-date details are in the generated documentation at **`/api/docs`** (OpenAPI JSON at `/api/docs.json`). It is on by default outside production.

| Method | Path | Access | Notes |
|---|---|---|---|
| PUT / DELETE | `/students/me/photo` | student | Multipart field `file`: JPG, PNG or WebP up to 2 MB. The type is checked from the file's content. |
| POST | `/enquiries/:reference/documents/:docId/files` | student (own, verified email) | PDF, JPG or PNG up to 5 MB, at most 5 per document, only while the document is requested |
| GET | `/files/:id` | owner, or an admin with `students.read` (photos) or `enquiries.manage` (documents) | Private, `no-store`, sandboxed. Anyone else gets 404. |
| GET / POST | `/feedback` | student | `{ rating 1–5, category, message, publishConsent }` |
| POST | `/feedback/:id/messages` | student (own) | Follow-up message |
| PATCH | `/feedback/:id/consent` | student (own) | Withdrawing consent unpublishes the testimonial at once |
| GET | `/testimonials` | public | Consented **and** admin-approved feedback only, shown as first name and city |
| GET / POST | `/students/me/data-requests` | student | `{ type: correction\|deletion, details }`; one pending request of each type |
| POST | `/students/me/data-requests/:reference/cancel` | student (own) | |
| GET | `/admin/feedback?status=&category=&rating=&testimonial=candidates` | `feedback.manage` | |
| POST | `/admin/feedback/:id/respond` · `/resolve` · `/testimonial` | `feedback.manage` | A testimonial needs the student's consent (409 `NO_CONSENT`) |
| GET | `/admin/data-requests?status=` | `privacy.manage` | |
| POST | `/admin/data-requests/:id/resolve` | `privacy.manage` | `{ action: complete\|reject, note }`. Completing a deletion anonymises the student. |
| PATCH | `/admin/students/:id` | `students.write` | `{ name?, mobile? }` (for correction requests) |
| GET | `/admin/reports/summary?from=&to=` | `reports.export` | Each metric comes with its definition |
| GET | `/admin/reports/export/:dataset?from=&to=&fields=` | `reports.export` | CSV export of `students`, `enquiries`, `applications` or `scholarship-applications`. <br>• Only whitelisted fields; personal fields only when listed explicitly. <br>• At most 5,000 rows. <br>• Spreadsheet formulas neutralised. <br>• Every export is audited. |

**Emails:** new enquiry (to enquiry admins and `ADMIN_NOTIFY_EMAILS`), acknowledgement, assignment, important status changes, messages, document requests, appointment booked/changed/cancelled, change requests to the counsellor, and a reminder 24 h before each session. They carry references and never internal notes.


## Error codes
| Status | Code | When |
|---|---|---|
| 400 | `BAD_REQUEST`, `INVALID_TOKEN` | Malformed input; an invalid, used or expired link |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS` | Not signed in; wrong email or password |
| 403 | `FORBIDDEN`, `CSRF_REJECTED`, `EMAIL_NOT_VERIFIED`, `OWN_PERMISSIONS`, `PERMISSION_NOT_HELD` | Not allowed |
| 404 | `NOT_FOUND` | Unknown route, or a record you may not see |
| 409 | `CONFLICT`, `EMAIL_IN_USE`, `ADMIN_EXISTS`, `SLUG_IN_USE`, `AISHE_CODE_IN_USE`, `NOT_RETRYABLE`, `IN_USE`, `FEE_LOCKED`, `LIMIT_REACHED` | Duplicates, records in use, published fees, list limits |
| 422 | `VALIDATION_ERROR`, `WRONG_PASSWORD`, `NOT_READY` | Invalid input; publishing without the required details (see `details`) |
| 429 | `RATE_LIMITED`, `ACCOUNT_LOCKED` | Too many attempts |
| 500 | `INTERNAL_ERROR` | Unexpected error (details only in server logs) |
| 502 / 503 | `COLLEGEDB_UNAVAILABLE`, `COLLEGEDB_QUOTA_EXHAUSTED`, `COLLEGEDB_NOT_CONFIGURED` | The third-party college search is down, out of quota or not configured |
| 503 | `SERVICE_UNAVAILABLE` | Database temporarily unreachable |

## Staff sign-up, invitation codes and the counsellor area
- `POST /api/auth/register` also takes `accountType` (`student` default, `counsellor`, `admin`) and `inviteCode`. Staff accounts need a valid single-use code (403 `INVITE_REQUIRED` / `INVITE_INVALID`); the role and permissions come from the code, never the request (`role` in the body is still 422). Staff verify their email with the emailed code, then sign in with their password.
- Admin (`admins.manage`): `GET /api/admin/invite-codes`, `POST /api/admin/invite-codes` `{ role, permissions?, email?, note?, days? }` (returns the plain `code` once; admin codes never carry permissions the creator lacks), `DELETE /api/admin/invite-codes/:id` (revoke an unused code).
- Counsellor (role `counsellor`): `GET /api/counsellor/summary` counts for the enquiries assigned to them only. Counsellors get 403 on every `/api/admin` route.
- CLI (server access): `npm run invite:create -- --role counsellor|admin [--email x] [--days 1-30]` prints a code once.

## College media, social links and deletion (admin, catalog.manage)
- College fields: `social { instagram, facebook, youtube, linkedin, x }` (https only; the address must belong to that network), `admissionInfo`. Statuses keep their values; the UI shows **Active** = published, **Draft** = draft, **Inactive** = archived. Students only ever see published colleges and active courses.
- `POST|DELETE /api/admin/colleges/:id/logo` (JPEG/PNG/WebP by content, 5 MB; sets `logoUrl`), `POST|DELETE /api/admin/colleges/:id/brochure` (PDF by content, 10 MB).
- `DELETE /api/admin/colleges/:id`: only unpublished colleges that no enquiry, application, shortlist, comparison or scholarship refers to (409 `COLLEGE_ACTIVE` / `IN_USE`); removes its courses, fees and files.
- Public: `GET /api/colleges/brochures/:fileId` serves only brochure files (PDF, nosniff, sandboxed). College detail adds `social`, `admissionInfo`, `brochureUrl`.

## Courses at colleges
- Offering fields: `description`, `mode` (`offline`|`online`|`hybrid`), `minQualification` (class_10, class_12, diploma, undergraduate, postgraduate, other), plus `imageUrl`/`brochureUrl`. Uploads: `POST|DELETE /api/admin/offerings/:id/image` and `/brochure`.
- `GET /api/courses/offerings`: active courses of published colleges. Filters `q`, `level`, `course`, `state`, `city`, `maxFee` (rupees per year, or total when a course has no yearly fee), `qualification` (shows courses whose stated minimum you meet, and those with none stated), `mode`, `sort=name|fee|deadline`, `page`, `limit`.

## Counsellors, eligibility, reports and social links
- Counsellor area (`/api/counsellor`, role counsellor; only enquiries assigned to them, anything else 404): `GET /summary`, `GET /enquiries` (same filters as the admin list), `GET /enquiries/:id` (adds `academics` with Class 10/12/graduation marks and `eligibility` for the chosen colleges and courses), `PATCH /enquiries/:id` `{ followUpAt }`, `POST /enquiries/:id/status|notes|contact-attempts|messages`, `POST /enquiries/:id/recommendations` `{ offerings: [id], note }` (student-visible, with eligibility), `POST /enquiries/:id/eligibility` `{ offerings }`. Counsellors cannot reassign, confirm admissions or reach `/api/admin`.
- Admin (`admins.manage`): `GET /api/admin/team/counsellors?from&to` (accounts with assigned/contacted/pending/converted/closed/overdue and conversion %), `POST` `{ name, email, mobile? }` (emails a set-password link), `PATCH /:id`, `POST /:id/deactivate|activate` (deactivation ends their sessions; enquiries stay for reassignment). Enquiries can be assigned to active counsellors and to admins with `enquiries.manage`. Admin (`enquiries.manage`) can also use `POST /api/admin/enquiries/:id/recommendations|eligibility`.
- Eligibility: `eligible`, `potentially_eligible` (data missing, entrance exam needed, or within 5 points below the cut-off) or `not_eligible`, always with reasons; never a promise of admission. UG courses use Class 12 marks, diplomas Class 10, PG and above graduation.
- New statuses `ELIGIBILITY_CHECK` and `COUNSELLING_COMPLETED` (pipeline, after INTERESTED and COUNSELLING_SCHEDULED). Profile: optional `marks { class10, class12, graduation }`; enquiries snapshot the percentages.
- `GET /api/admin/reports/enquiries` (`reports.export`): totals plus by counsellor, college and course; filters `from`, `to`, `college`, `course`, `counsellor` (id or `unassigned`), `status`. The CSV export takes the same filters (`assigned` for the counsellor). The dashboard summary adds `totals`.
- Site settings: `organisation.instagram`, `organisation.facebook` (https pages of that network), `crm.autoAssign` (new enquiries go to the active counsellor with the fewest open enquiries; not shown publicly). Counsellors get a daily follow-up email after 09:00 IST when they have follow-ups due or overdue.
