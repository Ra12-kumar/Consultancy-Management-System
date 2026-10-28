# Configuration

- **Secrets and environment-specific values** (database URI, session secret, SMTP) belong in the root `.env`. It is git-ignored; see `../.env.example`.
- **Non-secret project settings** (branding, contact details, feature switches) are described in `project-config.example.json`. Copy it to `project-config.json` (git-ignored) when the backend starts reading it in a later stage.

| Environment | How it is configured |
|---|---|
| Development | Root `.env` with `NODE_ENV=development`. SMTP optional (emails are logged). |
| Test | `backend/vitest.config.ts` sets `NODE_ENV=test`, the test database and silent logs. |
| Production | Real environment variables from the hosting platform. `NODE_ENV=production` enforces an https `FRONTEND_URL`, real secrets and SMTP. |
