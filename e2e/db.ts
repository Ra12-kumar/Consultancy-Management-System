import crypto from "node:crypto";
import { MongoClient } from "mongodb";
import { E2E, E2E_SESSION_SECRET } from "./playwright.config";

// Direct access to the dedicated e2e database (used for setup and for steps a browser cannot do, such as clicking
// the emailed verification link, since emails are only logged in tests).
export async function withDb<T>(fn: (db: ReturnType<MongoClient["db"]>) => Promise<T>) {
  const client = new MongoClient(E2E.mongo);
  await client.connect();
  try {
    const db = client.db();
    if (!db.databaseName.endsWith("_e2e")) throw new Error(`Refusing to use database "${db.databaseName}" for e2e tests`);
    return await fn(db);
  } finally {
    await client.close();
  }
}

export const ADMIN = { email: "e2e-admin@example.com", password: "E2e-admin-pass-2026", name: "Esha Admin" };
export const STUDENT_PASSWORD = "E2e-student-pass-2026";

// The 6-digit code in the latest verification email to `email`. Emails are only logged in tests; their secret
// parts are stored encrypted (see backend/src/utils/crypto.ts), so the test decrypts them with the e2e secret.
export async function emailedCode(email: string) {
  const mail = await withDb((db) => db.collection("emailDeliveryLogs").find({ to: email, template: { $in: ["welcome_verify", "verify_email"] } }).sort({ createdAt: -1 }).limit(1).next());
  if (!mail?.secretParams) throw new Error(`No verification email to ${email}`);
  const [iv, tag, data] = String(mail.secretParams).split(".").map((p) => Buffer.from(p, "base64url"));
  const key = crypto.createHash("sha256").update(`email-outbox:${E2E_SESSION_SECRET}`).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv!);
  decipher.setAuthTag(tag!);
  return (JSON.parse(Buffer.concat([decipher.update(data!), decipher.final()]).toString("utf8")) as { code: string }).code;
}

