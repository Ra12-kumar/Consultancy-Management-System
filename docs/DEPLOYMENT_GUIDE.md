# Deployment guide

Three supported ways to run the consultancy system in production. All share the same images (`backend/Dockerfile`, `frontend/Dockerfile`) and settings (`.env.example` lists every variable).

| Option | When | Guide |
|---|---|---|
| Docker Compose, one machine | Small installations | `docs/deployment.md` (`docker-compose.yml`) |
| Docker Compose + Nginx + 2 API instances + Redis | More traffic on one large machine | `docs/LOAD_BALANCING.md` (`docker-compose.scale.yml`) |
| Kubernetes | High availability across several machines, autoscaling | `docs/KUBERNETES.md` (`deploy/k8s`) |

## Environments

Keep **development, testing, staging and production** separate. Each needs its own database, its own `SESSION_SECRET` and its own `REDIS_PREFIX`:

| Environment | Database | Notes |
|---|---|---|
| Development | local `education_consultancy` | `npm run dev` |
| Testing | `education_consultancy_test`, `_e2e` | Created and emptied by the test runners only |
| Load testing | `education_consultancy_loadtest` | `loadtest/seed-loadtest.ts` refuses any other database |
| Staging | separate Atlas database | `deploy/k8s/overlays/staging`. Run the e2e tests here before production |
| Production | Atlas (replica set) | `deploy/k8s/overlays/production` or Compose |

## Release steps

1. CI is green on the commit: lint, typecheck, tests with coverage, build, dependency audit and browser e2e (`.github/workflows/ci.yml`).
2. Build and tag images with the version. Deploy to **staging** and smoke-test the main journeys.
3. Back up production MongoDB (see below).
4. Deploy to production: a rolling update with zero unavailable pods (Kubernetes) or `docker compose up -d --build`.
5. If the release adds indexes, run `npm run migrate:indexes` once against production. It only adds indexes.
6. Check `GET /api/health/ready`, sign in as an admin, open the dashboard and submit a test enquiry on staging.

## Backups and recovery

- **MongoDB:** Atlas continuous backup with point-in-time restore. For self-hosted MongoDB, use the `mongodump` schedule in `docs/deployment.md`. Test a restore every quarter.
- **Uploads volume:** back it up together with the database; files are referenced by database records.
- **Redis:** no backup needed. It only holds the cache and counters, which rebuild by themselves.
- **Rollback:**
  - Kubernetes: `kubectl rollout undo`.
  - Compose: redeploy the previous image tags.
  - Database changes in this release are additive (new indexes and optional fields), so a code rollback doesn't need a data rollback.
- **Disaster recovery order:** restore MongoDB and uploads → deploy the last good images → check readiness → re-point DNS.

## Never

- Commit `.env` or secrets. Use the platform's secret store.
- Run the test or load-test seed scripts against production.
- Run `syncIndexes` in production (it drops indexes). Use `migrate:indexes`.
