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
| POST | `/register` | public | `{ name, email, mobile, password }`. Always creates a **student**; unknown fields (e.g. `role`) give 422. The same answer is returned for an existing email (no enumeration). |
| POST | `/login` | public | `{ email, password }`. The error is always "Email or password is incorrect". Locks for 15 min after 10 failures. Rate limited. |
| POST | `/logout` | any | Ends this session |
| POST | `/logout-all` | signed in | Ends every session of the user |
| GET | `/me` | signed in | The signed-in user |
| POST | `/verify-email` | public | `{ token }`, single use, 24 h |
| POST | `/resend-verification` | public | `{ email }`, generic answer, rate limited |
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
| GET | `/locations` | Regions, states and cities with their `parents` |
| GET | `/courses` | The course catalogue |
| GET | `/colleges?q=&course=&location=&type=&maxBudget=&percentage=&sort=&page=&limit=` | `q` matches college name, city, state or course name. `course` and `location` are slugs; a region or state finds every city under it. `maxBudget` (paise) compares published official course totals. `percentage` keeps colleges with an offering whose minimum is at or below it (or has none). `sort`: `featured`, `name`, `fee_low`, `fee_high`, `recently_verified`. `meta.hasSamples` is true while sample colleges are published. |
| GET | `/colleges/compare?colleges=a,b[,c,d]&course=` | 2–4 slugs. Unpublished ones are left out and listed in `missing`; fewer than two left gives 404. |
| GET | `/colleges/:slug` | Profile, active offerings, and the current published fee per academic year and intake, each with a breakdown: `lines`, `officialTotalMinor`, `discountMinor`, `consultancyServiceChargeMinor` (separate), `estimatedTotalMinor`, `optionalTotalMinor` (hostel/transport, not in the estimate). Drafts and archived colleges answer 404. |

The "has scholarships" filter arrives with scholarships in Stage 4.

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
| 409 | `CONFLICT`, `EMAIL_IN_USE`, `ADMIN_EXISTS`, `SLUG_IN_USE`, `IN_USE`, `FEE_LOCKED`, `LIMIT_REACHED` | Duplicates, records in use, published fees, list limits |
| 422 | `VALIDATION_ERROR`, `WRONG_PASSWORD`, `NOT_READY` | Invalid input; publishing without the required details (see `details`) |
| 429 | `RATE_LIMITED`, `ACCOUNT_LOCKED` | Too many attempts |
| 500 | `INTERNAL_ERROR` | Unexpected error (details only in server logs) |
| 503 | `SERVICE_UNAVAILABLE` | Database temporarily unreachable |
