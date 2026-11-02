# Kubernetes deployment

The Kubernetes files for the Udaan education consultancy system are in `deploy/k8s/`. They use Kustomize (built into `kubectl`). They deploy only this system, in its own namespace, and never touch other applications.

```
deploy/k8s/
  base/                  shared definition (don't deploy directly)
    namespace.yaml       namespace "education-consultancy" (restricted pod security)
    config.yaml          ConfigMaps (non-secret settings)
    storage.yaml         uploads volume (ReadWriteMany)
    redis.yaml           Redis cache and shared rate limits (optional; can be a managed Redis)
    api.yaml             API Deployment, Service, autoscaler (2–10 pods), disruption budget
    web.yaml             Next.js Deployment, Service, autoscaler (2–6 pods), disruption budget
    ingress.yaml         /api -> api, / -> web (ingress-nginx)
    network-policy.yaml  only the ingress reaches web and api; only api reaches redis
  overlays/staging/      1 pod each, namespace education-consultancy-staging, staging host
  overlays/production/   2+ pods, TLS through cert-manager, your storage class
  secret.example.yaml    TEMPLATE for the secrets (not applied; no real values)
```

## What runs where

| Part | In the cluster | Outside the cluster |
|---|---|---|
| API (Express) | Deployment `api`, at least 2 pods, autoscaled on CPU | – |
| Website (Next.js) | Deployment `web`, at least 2 pods, autoscaled on CPU | – |
| Redis | Deployment `redis` (cache only, no persistence) | or a managed Redis (set `REDIS_URL`) |
| MongoDB | **not included** | MongoDB Atlas or another managed replica set (recommended). A database in the cluster needs a StatefulSet or an operator, plus backups. |
| Uploaded files | PersistentVolumeClaim `uploads` (ReadWriteMany) | – |

The API is stateless, so any pod can serve any request without sticky sessions:
- sessions are stored in MongoDB;
- the cache and rate-limit counters are shared through Redis;
- the email queue claims each message atomically, so several pods never send the same email twice.

## Probes and shutdown

- **startupProbe and livenessProbe:** `GET /api/health`. It never checks dependencies, so a database outage doesn't cause restart loops.
- **readinessProbe:** `GET /api/health/ready`. It returns 503 while MongoDB is unreachable, so that pod gets no traffic.
- **Shutdown:** `preStop` waits 5 s so the ingress stops routing to the pod first. On SIGTERM the API finishes in-flight requests (up to 8 s), then closes Redis and MongoDB. `terminationGracePeriodSeconds` is 20.
- **Rolling updates** use `maxUnavailable: 0`, and the PodDisruptionBudgets keep at least one API and one web pod during node drains.

## Security settings

- Pods run as the image's non-root user (uid 1000), with a read-only root filesystem, no privilege escalation, all Linux capabilities dropped and the default seccomp profile. The namespace enforces the "restricted" Pod Security Standard.
- Writable folders are only the uploads volume, the college-finder cache (`/data/cache`), `/tmp` and the Next.js cache, all mounted explicitly.
- Secrets are never in these files. Create the `api-secrets` Secret in the cluster (see below) or use your secret manager (External Secrets, Sealed Secrets, a cloud KMS).
- The API trusts exactly one proxy (`TRUST_PROXY=1`, the ingress controller), so clients can't fake their IP to get around rate limits. If a cloud load balancer sits in front of ingress-nginx, configure the controller to pass on the real client address (`use-proxy-protocol` or `externalTrafficPolicy: Local`) rather than raising `TRUST_PROXY`.

## Deploying

1. **Build and push the images** (from the project root):
   ```
   docker build -f backend/Dockerfile  -t registry.example.com/udaan/api:1.0.0 .
   docker build -f frontend/Dockerfile -t registry.example.com/udaan/web:1.0.0 .
   docker push registry.example.com/udaan/api:1.0.0
   docker push registry.example.com/udaan/web:1.0.0
   ```
2. **Edit the overlay:**
   - registry and tags (`images:`);
   - host names (ingress, `FRONTEND_URL`, `CORS_ORIGINS`);
   - the ReadWriteMany storage class, for example `efs-sc`, `azurefile` or `filestore`.
3. **Check your kubectl context, then create the namespace and secret.** Make sure kubectl points at the cluster you mean before running anything:
   ```
   kubectl config current-context
   kubectl create namespace education-consultancy
   kubectl -n education-consultancy create secret generic api-secrets \
     --from-literal=SESSION_SECRET="$(openssl rand -hex 32)" \
     --from-literal=MONGODB_URI='mongodb+srv://…' \
     --from-literal=BREVO_API_KEY='xkeysib-…' --from-literal=EMAIL_FROM='noreply@your-domain.in'
   ```
4. **Deploy:** first `kubectl apply -k deploy/k8s/overlays/production --dry-run=server`, so the cluster checks everything without changing anything, then `kubectl apply -k deploy/k8s/overlays/production`.
5. **Database indexes:** production doesn't create indexes automatically. After a release that adds indexes, run `npm run migrate:indexes` once with `MONGODB_URI` pointing at the production database, from a CI job or a trusted workstation. It only adds missing indexes and never drops any.
6. **Check:**
   ```
   kubectl -n education-consultancy get pods
   kubectl -n education-consultancy rollout status deploy/api
   curl https://udaan.example.com/api/health/ready
   ```

**Prerequisites in the cluster:**
- ingress-nginx;
- cert-manager with a `letsencrypt` ClusterIssuer (production TLS);
- metrics-server (for the autoscalers);
- a ReadWriteMany storage class;
- a CNI that enforces NetworkPolicy.

## Rollback

`kubectl -n education-consultancy rollout undo deploy/api` (and `deploy/web`). Five revisions are kept.

Database changes are additive (new indexes and new optional fields), so rolling the app back doesn't need a database rollback.

## Verification done

- `kubectl kustomize` renders both overlays (18 resources each).
- kubeconform v0.6.7 with `-strict` against the Kubernetes 1.31 schemas: **36 of 36 resources valid, 0 errors**.
- **Not deployed to a live cluster in this environment.** The only cluster on this machine belongs to another application and was deliberately not used. Run the server-side dry run (step 3) and a staging deploy before production.
