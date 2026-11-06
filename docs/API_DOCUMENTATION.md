# API documentation

The reference is **generated from the live route table and validators**, so it can't drift from the code:

- **Swagger UI:** `GET /api/docs` (on by default outside production; set `API_DOCS=true` to enable it in production).
- **OpenAPI 3.0 JSON:** `GET /api/docs.json`. Each operation lists its access rule (`x-access`: session, roles, permissions, verified email), parameters and request body schema.
- **Endpoint guide by area:** `docs/api.md`, written by hand with explanations.

## Conventions

| Item | Rule |
|---|---|
| Success | `{ "success": true, "data": …, "meta"?: { page, limit, total, totalPages } }` |
| Error | `{ "success": false, "error": { "code", "message", "details"?: [{ field, message }] }, "requestId" }` |
| Correlation | Every response has an `X-Request-Id` header. Errors repeat it as `requestId`, matching the server log line |
| Validation | 422 `VALIDATION_ERROR` with field details. Unknown fields are refused (strict schemas) |
| Auth | Session cookie `ec_sid` (HttpOnly). 401 when signed out, 403 for the wrong role or a missing permission |
| CSRF | Cookie-authenticated writes must send an allowed `Origin` |
| Rate limits | 429 `RATE_LIMITED` with `Retry-After` (seconds) and `RateLimit` / `RateLimit-Policy` headers |
| Unavailable | 503 `SERVICE_UNAVAILABLE` with `Retry-After: 5` while MongoDB is unreachable |
| Money | Integer paise |
| Cache | Public catalogue, site and scholarship answers carry `X-Cache: HIT`, `MISS` or `BYPASS` (REDIS_CACHING.md) |

The error format was kept as `{ error: { code, message } }` rather than the flat `{ message, code }` suggested in the brief, because every screen in the frontend reads the existing format. `requestId` was added.

## Endpoints added in this release

| Method and path | Access | Purpose |
|---|---|---|
| `POST /api/leads/callback` | Public (rate limited, consent required) | "Request a callback" from the landing page |
| `GET /api/admin/callback-leads` | Admin with `enquiries.manage` | List website callback requests (`status`, `page`, `limit`) |
| `PATCH /api/admin/callback-leads/:id` | Admin with `enquiries.manage` | Assign (`assignedTo`), set `status` (new, contacted, closed), `note` |
| `GET /api/counsellor/callback-leads` | Counsellor | Requests assigned to me |
| `PATCH /api/counsellor/callback-leads/:id` | Counsellor | `status` and `note` of my own requests (others answer 404) |
| `GET /api/colleges/explore?order=name` | Public | New optional A–Z sort for the college finder |
| `GET /api/counsellor/trend?days=7` | Counsellor | New enquiries assigned to me per India-time day (1–31 days), for the dashboard chart |
| `GET /api/admin/enquiries?followUpFrom=&followUpTo=` (and the counsellor list) | As the list | Optional follow-up date range (used by the counsellor calendar) |
| `GET /api/health/ready` | Public | Now also reports `cache: disabled \| connected \| unavailable` |
