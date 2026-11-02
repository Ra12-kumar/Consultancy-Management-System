# Load balancing and horizontal scaling

## Why the API can run as several instances

| Concern | Status |
|---|---|
| Sessions | Server-side, stored in MongoDB (`sessions`). Any instance can serve any request, so **no sticky sessions are needed**. |
| Rate limits | Shared through Redis when `REDIS_URL` is set (see REDIS_CACHING.md). Without Redis, each instance counts separately. |
| Cache | Redis, shared. Invalidation is global (a version counter in Redis). |
| Uploads | Stored on a shared volume (`ec_uploads`). On several machines, use a shared filesystem or move to object storage. |
| Background work | The email queue uses atomic claims in MongoDB, so several instances can run the worker at once without sending twice. Appointment reminders are deduplicated by their email `dedupeKey`. |
| WebSockets / Socket.IO | Not used, so no Redis adapter is needed. |

## What is provided

- `deploy/nginx/nginx.conf`:
  - `/api/` goes to two API instances (`least_conn`);
  - everything else goes to the Next.js server;
  - passive health checks (`max_fails=3 fail_timeout=10s`), keep-alive to the backends, gzip, and timeouts (connect 5 s, read and send 30 s);
  - upload limit 12 MB;
  - a retry on another instance only when the first one couldn't be reached;
  - `/nginx-health` for an outer load balancer.
- `X-Forwarded-For` **is overwritten** with the client address at this proxy, and the API trusts exactly one hop (`TRUST_PROXY=1`), so a client can't fake its IP to get around the limits. The request id is passed on as `X-Request-Id`.
- `docker-compose.scale.yml`: adds Redis (256 MB, LRU, no persistence), a second API instance `api2` and Nginx on `127.0.0.1:8088`. Run it with:

  ```
  docker compose -f docker-compose.yml -f docker-compose.scale.yml up -d --build
  ```

  More instances: copy the `api2` block (`api3`, …) and add each one to the `upstream api` block in nginx.conf.
- `deploy/compose.lbtest.yml`: **local testing only**. It runs the scaled stack without `.env.production`, using placeholder email settings and a separate Compose project.

## Health checks

| Endpoint | Use |
|---|---|
| `GET /api/health` | Liveness: the process is up. It never checks dependencies, so a database outage doesn't cause restart loops. |
| `GET /api/health/ready` | Readiness: 200 when MongoDB is connected, 503 otherwise. Reports states only (`database`, `mail`, `cache`), never hosts or credentials. |
| `GET /nginx-health` | The proxy itself |

## Behind a managed cloud load balancer

(AWS ALB, GCP or Azure load balancers, and similar.)

1. **TLS:** terminate HTTPS at the cloud load balancer and forward HTTP to Nginx, or straight to the instances.
2. **Trusted hops:** set `TRUST_PROXY` to the number of proxies in front of the API. For example, cloud LB then Nginx then API means `TRUST_PROXY=2`; cloud LB straight to the API means `TRUST_PROXY=1`. Never set it higher than the real number of hops, or clients can choose their own IP.
3. **Health checks:** point the target-group health check at `/api/health/ready` (API) or `/nginx-health` (proxy).
4. **Draining:** use connection draining of at least 10 s. On SIGTERM the API stops taking new requests, finishes in-flight ones (up to 8 s), then closes Redis and MongoDB.
5. **Shared services:** run MongoDB as a replica set (Atlas) and use a managed Redis. All instances must share the same `SESSION_SECRET`, `MONGODB_URI`, `REDIS_URL` and upload storage.

## Limits: adding Nginx is not high availability on its own

- The provided Compose stack runs on **one machine**. If that machine fails, everything stops. Real high availability needs instances on several machines or zones, a managed or replicated MongoDB (Atlas) and a managed Redis.
- The Next.js server runs as one instance in the Compose file. It's stateless and can be scaled the same way.
- Uploaded files live on a local volume. Several machines need shared storage.

## Verification

Results of running the scaled stack locally are in PERFORMANCE_REPORT.md: requests spread across both API instances, and requests keep being served when one instance is stopped.
