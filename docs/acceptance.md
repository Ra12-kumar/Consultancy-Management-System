# Acceptance criteria (master spec §22)

**Evidence key:**
- **Tests:** automated tests (`npm test`: 90 backend and 34 frontend tests).
- **E2E:** browser end-to-end tests (`npm run e2e`, Playwright with Chromium; desktop and phone viewports). They run against their own API, production web build and database, and in CI on every push.
- **Live:** a scripted run against the development servers through the web proxy (http://localhost:3000/api), using a throwaway student and the real admin account. The test records were deleted afterwards.

| Criterion | Status | Evidence |
|---|---|---|
| A student registers, verifies their email and logs in | Done | Tests: `auth.test.ts`. Live: each stage's run registered, verified (link from the log) and signed in. |
| A student completes their academic profile | Done | Tests: `access.test.ts`. Live: the profile was saved and the percentage derived on the server. |
| A student searches colleges and compares published fees | Done | Tests: `catalog.test.ts` (filters, sorting, compare) and frontend directory tests. Live: Stage 2 run. |
| A student submits an admission enquiry and receives a reference number | Done | Tests: `enquiries.test.ts` (reference, idempotency, duplicates). Live: an `ENQ-2026-…` reference was shown. |
| The enquiry is saved in MongoDB and appears in the Admin dashboard | Done | Tests: list and dashboard counts. Live: the admin list and dashboard showed it straight away. |
| The Admin receives the email notification when SMTP is configured | **Ready, not verified with real SMTP** | Tests: the emails are queued (stub transport). With no Brevo SMTP login and verified sender yet, emails are logged as "not sent (email not set up)". |
| The Admin updates the enquiry status and the student sees the permitted update | Done | Tests: `workflow.test.ts` (transitions, reasons, evidence gates, no internal notes leaked). Live: status changes and "Admission confirmed" seen by the student. |
| The Admin configures scholarship rules and students see correctly calculated preliminary eligibility | Done | Tests: `scholarships.test.ts` (eligibility engine and API). Live: a 78% student's results matched each rule. |
| A student cannot access another student's private records | Done | Tests cover enquiries, appointments, applications, shortlists, feedback, data requests and files (all answer 404). |
| A student cannot access or modify Admin resources | Done | Tests check every admin route with a student session. `docs.test.ts` checks that every admin route in the generated API document needs the admin role and a permission. |
| The Admin can manage colleges, courses, pricing, scholarships and feedback | Done | Tests: catalogue, fees, scholarships and support tests. Live: Stage 2, 4 and 5 runs. |
| The website works on mobile and desktop | **Partly verified** | Every layout is responsive: filter drawer, horizontally scrolling tables, mobile menu. The mobile menu is tested. Not checked on real devices: please check on a phone before launch. |
| Production builds and relevant automated tests pass | Done | `npm run lint && npm run typecheck && npm test && npm run build` all pass. The standalone production web server was started and answered with its security headers. |
| Setup, credentials, email configuration and deployment instructions are documented | Done | `README.md`, `docs/setup.md` (with Brevo), `docs/deployment.md`, `docs/security.md`, `docs/api.md` and Swagger at `/api/docs`. |

## Known gaps before going live
- **Email:** Brevo SMTP login and a verified sender are still needed (`.env`: `SMTP_USER`, `EMAIL_FROM`).
- **Docker:** the Dockerfiles and compose file were validated but not built or run here (the Docker engine was not running).
- **Content:** sample colleges and scholarships are fictional and labelled; remove them and enter verified data. The privacy policy and terms pages need the business's own text.
- **Scaling:** rate limits and the email/reminder workers run inside one API process. Several instances need a shared rate-limit store; see `docs/security.md`.
- **Real devices:** do a manual accessibility and mobile check (screen reader, keyboard, small screens).

This system has been tested as described above. That does not make it immune to every failure or attack; the known risks and their mitigations are listed in `docs/security.md`.
