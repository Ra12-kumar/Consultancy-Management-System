# Education Consultancy Management System

A web application for an Indian education consultancy.

- **Students** explore colleges, courses and scholarships; compare published fees; submit admission enquiries with a reference number; and track enquiries, applications and counselling sessions.
- **Students also** check their preliminary scholarship eligibility, upload requested documents, give feedback, and ask for their data to be corrected or deleted.
- **Admins** manage the catalogue and fees, enquiries, admissions, appointments, scholarships, feedback and testimonials, and personal data requests. They can also see reports, export data and read the audit log, each with least-privilege permissions.

> This project is fully separate from any other application on this machine. It has its own code, dependencies, `.env`, MongoDB database (`education_consultancy`), ports (frontend 3000, backend 5100) and Docker project name (`education-consultancy`).

| Part | Stack | Port |
|---|---|---|
| `frontend/` | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 | 3000 |
| `backend/` | Node.js, Express 5, TypeScript, Mongoose 8, Zod | 5100 |
| Database | MongoDB, database `education_consultancy` (tests: `education_consultancy_test`) | 27017 |

## Quick start

```bash
npm install                   # installs root, backend and frontend (npm workspaces)
cp .env.example .env          # only if .env does not exist yet; then set SESSION_SECRET
npm run dev                   # backend on :5100 and frontend on :3000
npm run seed:catalog          # optional: locations, courses, and clearly labelled SAMPLE colleges and scholarships
npm run admin:bootstrap -- --email you@example.com --name "Your Name"   # first administrator (once)
```

Open http://localhost:3000. API documentation (generated from the code) is at http://localhost:3000/api/docs.

## Commands (run from this folder)

| Task | Command |
|---|---|
| Run both apps | `npm run dev` |
| Tests (backend, then frontend) | `npm test` |
| Browser end-to-end tests (own ports 3199/5199 and database `education_consultancy_e2e`) | `npm run e2e` (first time: `npx playwright install chromium`) |
| Lint / type checks / production builds | `npm run lint` / `npm run typecheck` / `npm run build` |
| Database connection check | `npm run db:check` |
| Sample data: add / remove | `npm run seed:catalog` / `npm run seed:remove-samples` |
| Upgrade an older database (explicit, once each, in order) | `npm run migrate:stage2`, `migrate:stage3`, `migrate:stage5`, `migrate:stage7` |
| Rebuild derived college data | `npm run catalog:rebuild` |

No command drops or resets a database. Each migration runs only when you call it. The e2e tests empty only their own `education_consultancy_e2e` database, and refuse to run against any other.

Continuous integration (`.github/workflows/ci.yml`) runs lint, type checks, all tests, the production builds and the browser tests on every push and pull request.

## Documentation
- `docs/setup.md`: local setup, Brevo email, first admin.
- `docs/deployment.md`: Docker, HTTPS, production settings, backups.
- `docs/architecture.md`, `docs/api.md`, `docs/security.md`, `database/README.md`.
- `docs/acceptance.md`: the spec's acceptance criteria and how each was verified.
