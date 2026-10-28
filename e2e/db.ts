import { MongoClient } from "mongodb";
import { E2E } from "./playwright.config";

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

export const markVerified = (email: string) => withDb((db) => db.collection("users").updateOne({ email }, { $set: { emailVerifiedAt: new Date() } }));
