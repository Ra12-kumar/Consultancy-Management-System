# Security

## In place now
- **Secrets:**
  - Only in the root `.env`, which is git-ignored together with all `.env.*` files except `.env.example`.
  - `SESSION_SECRET` was generated randomly; it is not in any source file.
  - The backend validates settings at startup and prints only variable names on error.
- **Frontend isolation:** the browser bundle only contains `NEXT_PUBLIC_*` values. This was checked after `next build`: no session secret and no database URI in `.next/static`.
- **Database:**
  - This project's own database (`education_consultancy`).
  - The backend refuses to start if `MONGODB_URI` points at the Gym application's database.
  - No code drops or resets data. Seeds only add missing records.
  - Tests are locked to `education_consultancy_test`.
- **HTTP hardening:**
  - helmet security headers; `x-powered-by` is disabled (backend and Next.js).
  - CORS only for the origins in `CORS_ORIGINS` (default `FRONTEND_URL`).
  - 100 kB body limit and an API rate limit (300 requests per 15 minutes per IP by default).
  - Strict input validation (Zod, unknown query fields refused).
- **Errors:** one central handler. Clients never see stack traces, database errors or internal paths; details stay in structured server logs, with authorization headers, cookies, passwords and tokens redacted.
- **Health checks:** report states only, never connection strings, hosts or database names.
- **Shutdown:** graceful on SIGTERM/SIGINT. Fatal errors are logged and the process exits for its supervisor to restart.

## Authentication and authorization (Stage 1, in place)
- **Sessions:**
  - Server-side sessions in MongoDB; the cookie holds only a random token, stored as its sha256 hash.
  - Cookie `ec_sid`: HttpOnly, SameSite=Lax, Secure in production.
  - 7-day sliding expiry with a 30-day absolute limit.
  - A new id on every sign-in. Logout and logout-all delete the sessions on the server.
  - There is no authentication state in localStorage.
- **CSRF:** cookie-authenticated writes must carry an allowed `Origin` (or `Referer`), together with SameSite=Lax.
- **Passwords:**
  - Argon2id (19 MiB, t=2). At least 10 characters, with a letter and a number, and not the email address.
  - Hashes are never returned by the API.
- **Accounts:**
  - Generic sign-in errors and a timing-equalised failure path.
  - Lockout for 15 minutes after 10 failures. Rate limits on sign-in, registration and emailed links.
  - Registration and the reset request answer the same way whether an account exists or not.
- **Email links:** verification (24 h), reset (30 min) and admin set-password (72 h) are random, stored hashed, single use (atomic), and invalidated when a newer link is issued. A reset or set-password ends every session.
- **Roles:**
  - Public registration always creates a student. Strict schemas refuse `role` and any unknown field (mass assignment).
  - Admins have fine-grained permissions, checked by middleware on every admin route.
  - Admins cannot change their own permissions or grant ones they lack. Changed admins are signed out.
- **Ownership:** student routes take the user id from the session, never from the request. Another student's record answers 404.
- **First admin:** CLI bootstrap only, refused once an admin exists. There is no default password anywhere.
- **Audit:**
  - Append-only `auditLogs`: the Mongoose update and delete hooks refuse changes.
  - Recorded events: registrations, verifications, password resets and changes, admin sign-ins, invitations, permission changes.
- **Email:**
  - Brevo SMTP with STARTTLS, and credentials only in `.env`.
  - Token links in the outbox are AES-256-GCM encrypted. The admin delivery log never shows bodies or links, and provider keys are redacted from error text.

## Catalogue and pricing (Stage 2, in place)
- **Separate permissions:** `catalog.manage` covers colleges, courses, locations and offerings; `pricing.manage` covers fees. The server refuses students and other admins.
- **Nothing unverified goes public:**
  - Colleges start as drafts and need a city, a type and a verification date before publishing.
  - Fees need an official source and a verification date.
  - Drafts and archived records answer 404 publicly.
  - Placement text is shown only when marked verified.
- **Fees cannot be tampered with:**
  - Totals are always recalculated on the server from integer paise.
  - Client totals and unknown fields are refused (strict schemas).
  - Published fee versions are immutable and kept as history.
  - Every change is audited.
- **Sample data:** flagged with `isSample` and labelled on every card, page and comparison. The API cannot create or toggle it, and one command removes it.
- **Images and links:** college images come only from admin-entered `https://` URLs (no uploads yet). External links open with `rel="noopener noreferrer nofollow"`.
- **Student lists:** the shortlist and comparisons always use the session user, and another student's records answer 404. The compare tray lives in sessionStorage and holds only public college slugs.

## Enquiries and admissions (Stage 3, in place)
- **Ownership:** student routes look records up by the session user plus the reference or id; other students' records answer 404. Enquiry writes need a verified email.
- **Internal information never reaches students:** internal notes, contact attempts, status reasons, application notes, evidence details and session outcome notes are excluded by whitelisted projections. Tests scan every student response and email for a marker string.
- **No false admissions:** "Admitted" cannot be set as a status. Confirming one needs the separate `admissions.confirm` permission, an offer already recorded on the application, and evidence (type and reference). The verifier and time are stored, and confirmed applications are locked. The dashboard counts only evidence-backed admissions.
- **Audit:** every admin action is recorded both in the enquiry's append-only history (actor, time, from, to, reason) and in the audit log.
- **Mass assignment:** strict schemas refuse status, reference, snapshots, estimates and student ids from clients; totals and estimates are computed by the server.

## Scholarships (Stage 4, in place)
- **Preliminary only:**
  - Eligibility (`services/scholarshipEligibility.ts`) only ever says "likely eligible", "not eligible" or "needs more details", with reasons.
  - It is labelled preliminary everywhere and never approves anything.
  - Awards need `scholarships.approve`; reviewing needs `scholarships.manage`.
- **Sensitive facts:** income, category and gender are declared per check or application. They are never saved on the profile, and they are only stored on an application the student submits.
- **Publishing rules:** published scholarships need a verification date; government schemes also need their official https page.
- **Sample data:** sample scholarships are labelled and removed with the sample colleges.

## Uploads, privacy, exports and hardening (Stages 5–6, in place)
- **Uploads:**
  - Files are kept in a private folder (`UPLOAD_DIR`, git-ignored, never served statically) under random names, with permissions 0600.
  - The file type comes from the content (magic bytes), never from the name. There are size limits, and one file per request.
  - Files are served only through `/api/files/:id` after an owner or permission check, with `no-store`, `nosniff` and a sandboxing CSP. Documents are sent as attachments.
- **Personal data requests:**
  - Correction and deletion need `privacy.manage`.
  - Deletion anonymises the student: account details, profile, photo, documents, shortlist, comparisons, declared scholarship facts, feedback text and their own enquiry messages are removed or redacted. Enquiry and application records stay without identifying details.
  - Audit records are kept as the legal record of what happened.
- **Testimonials:** shown only with the student's consent **and** an admin's approval, as first name and city. Withdrawing consent hides a testimonial at once.
- **Exports:**
  - Need `reports.export`. Fields come from a whitelist, and personal data is excluded unless named explicitly.
  - At most 5,000 rows. Formula injection is neutralised.
  - Each export is audited with the fields and row count.
- **API surface check:** an automated test reads the generated OpenAPI document and fails if any admin route lacks the admin role and a specific permission, or any student write lacks a session.
- **Web headers:** CSP, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, plus HSTS in production (`frontend/next.config.ts`). API responses keep their own helmet headers.
- **Swagger UI:** off in production unless `API_DOCS=true`. It reveals no secrets, only the API's shape.

## Two-step sign-in, payments and editable content (Stage 7, in place)
- **Two-step sign-in (admins, optional):**
  - Standard authenticator codes (TOTP, RFC 6238, tested against the RFC vector).
  - The secret is encrypted with AES-256-GCM. The 8 recovery codes are stored hashed and work once each.
  - A password alone gives only a 5-minute single-use challenge, never a session.
  - Each 30-second code can be used once (atomic replay check). Failed codes count towards the account lockout.
  - Turning it off needs the password and a code. Changes are audited and emailed as security notices.
  - Recommended for every admin with `admins.manage`, `privacy.manage` or `payments.manage`.
- **Payments:**
  - Only the consultancy's own service charge is collected; college fees are never taken online.
  - The amount comes from the admin's request, never from the browser.
  - A payment counts as paid only after the Razorpay signature is verified on the server (HMAC-SHA256, constant-time comparison), from the checkout callback or the signed webhook.
  - Marking a payment paid is atomic and idempotent. Card and bank details never reach this system.
  - Keys must be this project's own; it never reuses another application's keys. Without keys, payments are off.
  - The page CSP allows only Razorpay's checkout script and frames.
- **Email templates:** admins can change only the subject and an introduction. Links, tokens and references are always generated by the system. Placeholders are limited to `{{name}}`, `{{reference}}` and `{{app}}`, and the text is HTML-escaped.
- **Editable pages:** a small Markdown subset is rendered as React elements, never HTML. Only `https://` and site-relative links are allowed, so stored text cannot inject scripts. Earlier versions are kept, and changes are audited.
- **Announcements:** emails go only to the chosen students (at most 5,000), each once (dedupe key). Website banners are never emailed.

## Known limitations
- **Documents:** the checklist tracks names only. Students are told not to email documents; secure uploads arrive in a later stage.
- **Reminders and queue:** appointment reminders and the email queue run inside the API process (no Redis). A long outage delays reminders until the next run.
- **Fee publishing** uses two ordered writes guarded by a unique index; there is no multi-document transaction, because the local MongoDB is standalone.
- **College images** are https URLs until uploads arrive; use only images you are licensed to use.
- **Rate limits** are in memory per server process. Use a shared store (e.g. Redis) when running several API instances.
- **The email queue** lives in MongoDB with an atomic claim and lock, so it survives restarts and works with several workers. It is not BullMQ or Redis, and delivery depends on the provider.
- **Admin MFA** (optional in the spec) is not implemented yet.
- **Photo and document uploads** come in a later stage, with signature checks and private storage.
- **Sensitive actions:** `requireVerifiedEmail` is ready for enquiries and applications in Stage 3.
