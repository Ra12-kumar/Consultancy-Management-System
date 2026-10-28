# Deployment

## What you need
- A server (or container platform) for three services: MongoDB 6+, the API (Node 24) and the web app (Node 24).
- A domain with **HTTPS**, using a reverse proxy such as Caddy, nginx or a cloud load balancer in front of the web app.
- **Email:** a Brevo SMTP login, an SMTP key and a **verified sender address**. In production the API refuses to start without SMTP settings.

Only the web app is exposed. The browser talks to `https://your-domain/…`, and `/api/*` is forwarded by the web app to the API over the internal network. Session cookies therefore stay first-party, and CORS is not needed in normal use.

## Production settings
Create `.env.production` from `.env.example`. Never commit it: `.gitignore` already excludes it.

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` (set by docker-compose) |
| `FRONTEND_URL` | `https://your-domain` (https is required) |
| `CORS_ORIGINS` | `https://your-domain` |
| `SESSION_SECRET` | 48+ random characters. Generate a new one; never reuse the development value. |
| `MONGODB_URI` | Set by docker-compose to the internal `mongo` service. For managed MongoDB, use its connection string with TLS and a dedicated user. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_FROM_NAME` | Brevo SMTP relay, login, key and verified sender |
| `ADMIN_NOTIFY_EMAILS` | Shared team inbox(es) for new enquiries, feedback and data requests |
| `UPLOAD_DIR` | Set by docker-compose to `/data/uploads` (a private volume) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | This project's own Razorpay keys (live keys `rzp_live_…` in production). In the Razorpay dashboard, add the webhook `https://your-domain/api/payments/webhook` for `payment.captured`, `order.paid` and `payment.failed` with the same secret. Leave empty to keep online payment off. |
| `API_DOCS` | Leave unset (Swagger UI is off in production), or `true` only behind admin-only access |
| `TRUST_PROXY` | `1` when exactly one reverse proxy is in front (set by docker-compose) |

The web app sets these security headers on every page: CSP, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, plus HSTS in production. The API sets helmet's headers.

## With Docker (recommended)
```bash
cp .env.example .env.production      # then fill in the production values above
docker compose build
docker compose up -d
docker compose logs -f api           # look for "SMTP login accepted"
```
- **Isolation:** the compose project name is `education-consultancy`, with its own network and volumes (`ec_mongo_data`, `ec_uploads`). MongoDB is not published to the host.
- **Ports:** the web app listens on `127.0.0.1:3000` only. Point your HTTPS proxy at it, for example with Caddy: `your-domain { reverse_proxy 127.0.0.1:3000 }`.
- **One-off tasks** (first admin, migrations): the runtime image contains only the compiled API. Run the database scripts from a checkout of this project with `npm run admin:bootstrap -- …` or `npm run migrate:…`, with `MONGODB_URI` pointing at the production database through a secure tunnel. Seeding sample data refuses to run in production.
- **Status of these files:** the Dockerfiles and `docker-compose.yml` were validated (`docker compose config`). They were **not built or run** on the development machine, because its Docker engine was not running. Build and test them once on the target server before going live.

## Without Docker
```bash
npm ci
npm run build
NODE_ENV=production node backend/dist/server.js            # API on :5100 (keep it private)
cd frontend && API_INTERNAL_URL=http://127.0.0.1:5100 node .next/standalone/frontend/server.js   # web on :3000
```
For the standalone web server, copy `frontend/.next/static` to `.next/standalone/frontend/.next/static` and `frontend/public` to `.next/standalone/frontend/public`; the Dockerfile does this. Run both processes under a supervisor such as systemd or pm2.

## Upgrading an existing database
Run these in order, each once, after deploying the new code: `npm run migrate:stage2` (after `seed:catalog` if you use the catalogue seed), then `migrate:stage3`, then `migrate:stage5`. Each is safe to run again; none deletes data.

## Backups
- **Database:** take a nightly dump and keep at least 14 days off the server.
  ```bash
  docker compose exec -T mongo mongodump --db education_consultancy --archive --gzip > backup-$(date +%F).archive.gz
  # restore (to an empty database only):
  docker compose exec -T mongo mongorestore --archive --gzip --nsInclude 'education_consultancy.*' < backup-YYYY-MM-DD.archive.gz
  ```
- **Uploads:** back up the `ec_uploads` volume (photos and student documents) with the same retention. It contains personal data: encrypt the backups.
- **Restore test:** restore into a separate staging stack regularly to prove the backups work.

## Going live checklist
- [ ] HTTPS works and `http://` redirects to it.
- [ ] A new `SESSION_SECRET`.
- [ ] SMTP verified: the log says "SMTP login accepted", and a test registration email arrives.
- [ ] The first admin is created with `admin:bootstrap`, and further admins are invited with only the permissions they need.
- [ ] Sample data removed: `npm run seed:remove-samples`. The admin dashboard warns while samples exist.
- [ ] Real colleges, fees and scholarships entered **with sources and verification dates**.
- [ ] Two-step sign-in turned on for every admin (Admin → Account settings).
- [ ] If taking payments: live Razorpay keys and the webhook configured, and one real low-value payment and refund tested.
- [ ] Website content: About, FAQ, Privacy, Terms, Admission process and Contact edited under Admin → Website content, and contact details set under Admin → Site settings.
- [ ] Upgrading an older database: `npm run migrate:stage7` (after `migrate:stage5`).
- [ ] Privacy policy and terms pages reviewed by the business (the current text is a placeholder).
- [ ] Backups scheduled and one restore tested.
- [ ] Rate limits: these are per process. Running more than one API instance needs a shared store (for example Redis with `rate-limit-redis`), which is not included yet.
