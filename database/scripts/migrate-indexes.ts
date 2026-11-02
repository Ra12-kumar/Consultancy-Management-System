// Index migration (`npm run migrate:indexes`). Explicit only; safe to run more than once.
// Production starts with autoIndex off, so new indexes declared in the models are created here. It only ADDS
// missing indexes (createIndexes); it never drops one. Indexes are listed in docs/DATABASE_INDEXES.md.
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../backend/src/config/database.js';
import { env } from '../../backend/src/config/env.js';

// Importing the model files registers every schema with Mongoose.
const MODEL_FILES = ['Admission', 'Appointment', 'AuditLog', 'AuthToken', 'CallbackLead', 'College', 'CollegeCourse', 'CollegeFee', 'Content', 'Course', 'Directory', 'EmailDelivery', 'EmailOtp', 'Enquiry', 'InviteCode', 'Location', 'Scholarship', 'Session', 'Shortlist', 'StudentProfile', 'Support', 'User'];

async function main() {
  for (const f of MODEL_FILES) await import(`../../backend/src/models/${f}.js`);
  await connectDatabase(env.MONGODB_URI, { attempts: 1 });
  for (const model of Object.values(mongoose.models)) {
    const before = (await model.collection.indexes().catch(() => [])).length;
    await model.createIndexes();
    const after = (await model.collection.indexes()).length;
    console.error(`${model.collection.collectionName}: ${after} indexes${after > before ? ` (${after - before} created)` : ''}`);
  }
}

main()
  .catch((err: Error) => {
    console.error(`Index migration failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
