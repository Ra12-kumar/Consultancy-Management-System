# Setup

## Requirements
- Node.js 20.19 or newer (developed with Node 24) and npm 10+.
- MongoDB 6+ reachable from this machine (local `mongod` on 127.0.0.1:27017, or MongoDB Atlas).

## 1. Install
```bash
npm install
```
This installs the root tools plus both workspaces (`backend`, `frontend`) into one `node_modules`.

## 2. Configure
The project uses one settings file, `.env`, in the project root. Both apps read it: the backend through `backend/src/config/env.ts`, and the frontend through `frontend/next.config.ts`, where only `NEXT_PUBLIC_*` values reach the browser.

```bash
cp .env.example .env    # only when .env does not exist; never overwrite a working one
```
Set `SESSION_SECRET` to a random value:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

| Variable | Used by | Notes |
|---|---|---|
| `MONGODB_URI` | backend | This project's own database, e.g. `mongodb://127.0.0.1:27017/education_consultancy` |
| `SESSION_SECRET` | backend | 32+ random characters |
| `BACKEND_PORT` | backend | 5100 |
| `FRONTEND_URL` | backend | Allowed CORS origin (http://localhost:3000) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | backend | Optional in development (emails are logged); required in production |
| `NEXT_PUBLIC_API_BASE_URL` | frontend (browser) | http://localhost:5100/api. Never put secrets in `NEXT_PUBLIC_` values |

| `UPLOAD_DIR` | backend | Private upload folder (default `storage/uploads`, git-ignored). Never a public folder. |
| `API_DOCS` | backend | Swagger UI at `/api/docs`; on by default outside production |

The backend refuses to start with missing or invalid settings and lists the variable names (never their values).

## 3. Run
```bash
npm run dev            # both
npm run dev:backend    # API only   -> http://localhost:5100/api/health
npm run dev:frontend   # web only   -> http://localhost:3000
```

## 4. Database
```bash
npm run db:check   # shows the database name and collections (read-only)
npm run seed:catalog         # locations, courses and labelled FICTIONAL sample colleges (adds only what is missing)
npm run seed:remove-samples  # removes every sample college and its fees, e.g. before going live
npm run migrate:stage2       # once, when upgrading a Stage 1 database (run after seed:catalog)
```
Tests use the separate `education_consultancy_test` database and refuse to run against any other.

## 5. Checks and builds
```bash
npm run lint && npm run typecheck && npm test && npm run build
```

## 6. Email through Brevo
Emails (verification, password reset, admin invitations, notices) go out through Brevo's SMTP relay.

1. In Brevo, open **Settings → SMTP & API → SMTP**. Copy the **SMTP login** (looks like `xxxx@smtp-brevo.com`) and an **SMTP key** (`xsmtpsib-…`).
2. In Brevo, open **Senders, domains & dedicated IPs** and verify the address you send from.
3. In the root `.env`, set:
   ```
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=<your SMTP login>
   SMTP_PASS=<your SMTP key>
   EMAIL_FROM=<your verified sender>
   EMAIL_FROM_NAME=EduPath Consultancy
   ```
4. Restart the backend. The log says `SMTP login accepted`, or explains why not. Admin → Email notifications shows the same.

Until all of these are set, emails are recorded as **Not sent (email not set up)**, never as sent. In development the action link (verification, reset, invitation) is printed in the backend log, so the flows can still be tested.

**How delivery works:**
- Emails are stored in MongoDB (`emailDeliveryLogs`) and sent by a background worker straight away.
- On provider errors the worker retries after 1 min, 5 min, 15 min, 1 h and 6 h, then marks the email failed.
- The queue survives restarts. It is not BullMQ or Redis; see `docs/security.md`.
- Links containing tokens are stored encrypted.

## 7. First administrator
Public registration only ever creates students. Create the first administrator once, from a terminal on the server:
```bash
npm run admin:bootstrap -- --email you@example.com --name "Your Name"
```
- The admin gets a single-use set-password link by email. The link is also printed once in the terminal and is valid for 72 hours.
- No password is ever created, shown or stored in code.
- The command refuses to run again once an admin exists.
- Further admins are invited from **Admin → Administrators**, with only the permissions they need.
