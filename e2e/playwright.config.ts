import { defineConfig, devices } from "@playwright/test";

// Browser end-to-end tests. They start their own API (:5199) and production web build (:3199) against a dedicated
// database (education_consultancy_e2e), so they never touch the development servers or data.
export const E2E = {
  api: "http://localhost:5199",
  web: "http://localhost:3199",
  mongo: process.env.E2E_MONGODB_URI ?? "mongodb://127.0.0.1:27017/education_consultancy_e2e",
};

const backendEnv = {
  NODE_ENV: "test",
  LOG_LEVEL: "warn",
  BACKEND_PORT: "5199",
  MONGODB_URI: E2E.mongo,
  FRONTEND_URL: E2E.web,
  CORS_ORIGINS: E2E.web,
  SESSION_SECRET: "e2e-session-secret-that-is-long-enough-0123456789",
  SMTP_HOST: "",
  SMTP_USER: "",
  SMTP_PASS: "",
  EMAIL_FROM: "",
  ADMIN_NOTIFY_EMAILS: "",
  UPLOAD_DIR: "storage/e2e-uploads",
  LOGIN_RATE_LIMIT: "1000",
  AUTH_RATE_LIMIT: "1000",
  API_RATE_LIMIT: "100000",
  RAZORPAY_KEY_ID: "",
  RAZORPAY_KEY_SECRET: "",
  RAZORPAY_WEBHOOK_SECRET: "",
};

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "../playwright-report" }]] : "list",
  outputDir: "../test-results",
  globalSetup: "./global-setup.ts",
  use: { baseURL: E2E.web, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    // Full Chromium in its new headless mode (no separate headless-shell download needed).
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chromium" }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: "chromium" }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    {
      command: "npx tsx backend/src/server.ts",
      cwd: "..",
      url: `${E2E.api}/api/health`,
      env: backendEnv,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // A production build in its own folder (.next-e2e), proxying /api to the e2e API.
      command: "npm --workspace education-consultancy-frontend run e2e:web",
      cwd: "..",
      url: E2E.web,
      env: { NEXT_DIST_DIR: ".next-e2e", API_INTERNAL_URL: E2E.api, NEXT_TELEMETRY_DISABLED: "1" },
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
