import { execFileSync } from "node:child_process";
import path from "node:path";
import argon2 from "argon2";
import { ADMIN, withDb } from "./db";
import { E2E } from "./playwright.config";

const PERMISSIONS = [
  "students.read",
  "students.write",
  "admins.manage",
  "email.view",
  "audit.read",
  "catalog.manage",
  "pricing.manage",
  "enquiries.manage",
  "admissions.confirm",
  "scholarships.manage",
  "scholarships.approve",
  "reports.export",
  "feedback.manage",
  "privacy.manage",
  "content.manage",
  "payments.manage",
  "settings.manage",
];

// Fresh e2e data for every run: empty the dedicated database, add the catalogue (with its labelled sample colleges)
// and one administrator with every permission.
export default async function globalSetup() {
  await withDb(async (db) => {
    for (const c of await db.collections()) await c.deleteMany({});
  });
  const root = path.resolve(__dirname, "..");
  execFileSync("npx tsx database/seeds/seed-catalog.ts", {
    cwd: root,
    env: { ...process.env, NODE_ENV: "test", MONGODB_URI: E2E.mongo, LOG_LEVEL: "warn", SESSION_SECRET: "e2e-session-secret-that-is-long-enough-0123456789" },
    stdio: "inherit",
    shell: true,
  });
  // Same Argon2id settings as backend/src/utils/password.ts.
  const passwordHash = await argon2.hash(ADMIN.password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const now = new Date();
  await withDb((db) =>
    db.collection("users").insertOne({ name: ADMIN.name, email: ADMIN.email, role: "admin", permissions: PERMISSIONS, passwordHash, status: "active", emailVerifiedAt: now, failedLogins: 0, mfa: { enabled: false }, createdAt: now, updatedAt: now }),
  );
}
