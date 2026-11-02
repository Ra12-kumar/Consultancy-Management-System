// Creates load-test accounts in a DISPOSABLE database: one admin (all permissions) and N verified students with
// a profile, all with the password in LOADTEST_PASSWORD. Refuses to run unless the database name ends in
// "_loadtest" or the URI points at the local test stack (127.0.0.1:27027). Run from backend/:
//   MONGODB_URI=mongodb://127.0.0.1:27027/education_consultancy LOADTEST_PASSWORD=… npx tsx ../loadtest/seed-loadtest.ts 200
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../backend/src/config/database.js';
import { env } from '../backend/src/config/env.js';
import { StudentProfileModel } from '../backend/src/models/StudentProfile.js';
import { PERMISSIONS, UserModel } from '../backend/src/models/User.js';
import { hashPassword } from '../backend/src/utils/password.js';

async function main() {
  const uri = env.MONGODB_URI;
  if (!/_loadtest(\?|$)/.test(uri) && !/127\.0\.0\.1:27027\//.test(uri)) throw new Error('Refusing: MONGODB_URI is not a load-test database');
  const password = process.env.LOADTEST_PASSWORD ?? '';
  if (password.length < 12) throw new Error('Set LOADTEST_PASSWORD (12+ characters)');
  const count = Math.min(1000, Number(process.argv[2] ?? 200));
  await connectDatabase(uri, { attempts: 1 });
  const passwordHash = await hashPassword(password);
  const now = new Date();
  await UserModel.updateOne(
    { email: 'loadtest-admin@example.com' },
    { $set: { name: 'Load Test Admin', role: 'admin', permissions: [...PERMISSIONS], passwordHash, emailVerifiedAt: now, status: 'active' } },
    { upsert: true },
  );
  for (let i = 0; i < count; i += 1) {
    const email = `loadtest-student-${i}@example.com`;
    const u = await UserModel.findOneAndUpdate(
      { email },
      { $set: { name: 'Load Test Student', role: 'student', passwordHash, emailVerifiedAt: now, status: 'active' } },
      { upsert: true, new: true },
    );
    await StudentProfileModel.updateOne(
      { user: u._id },
      { $set: { personal: { city: 'Chennai', state: 'Tamil Nadu', preferredContact: 'email' }, academic: { highestQualification: 'class_12', passingYear: 2025, score: { type: 'percentage', value: 82, max: 100 }, percentage: 82 } } },
      { upsert: true },
    );
  }
  console.error(`Load-test accounts ready: 1 admin, ${count} students (database ${mongoose.connection.name}).`);
}

main()
  .catch((err: Error) => {
    console.error(`Seeding failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
