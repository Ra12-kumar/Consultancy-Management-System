// One-off Stage 2 migration (`npm run migrate:stage2`). Explicit only; safe to run more than once.
// - Colleges from Stage 1 (with `isActive`) get a `status`. Nothing becomes public automatically: active records
//   become drafts (they still need a city and a verification date before publishing), inactive ones are archived.
// - The three fictional Stage 1 dev-seed colleges are marked as sample data.
// - College indexes are brought in line with the model (the obsolete `college_city_listing` index is replaced).
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../backend/src/config/database.js';
import { env } from '../../backend/src/config/env.js';
import { CollegeModel } from '../../backend/src/models/College.js';
import { LocationModel } from '../../backend/src/models/Location.js';
import { rebuildAllSummaries } from '../../backend/src/services/catalog.service.js';

const STAGE1_SAMPLES = ['anna-institute-of-technology', 'western-ghats-college-of-engineering', 'deccan-school-of-management'];

async function main() {
  await connectDatabase(env.MONGODB_URI, { attempts: 1 });
  const raw = mongoose.connection.db!.collection('colleges');
  const drafts = await raw.updateMany({ isActive: true, status: { $exists: false } }, { $set: { status: 'draft' }, $unset: { isActive: '' } });
  const archived = await raw.updateMany({ isActive: false, status: { $exists: false } }, { $set: { status: 'archived' }, $unset: { isActive: '' } });
  const samples = await raw.updateMany({ slug: { $in: STAGE1_SAMPLES } }, { $set: { isSample: true } });
  // Link Stage 1 colleges to a city Location by name where one exists (run `npm run seed:catalog` first).
  let linked = 0;
  for (const c of await raw.find({ location: { $in: [null, undefined] }, city: { $type: 'string', $ne: '' } }).toArray()) {
    const city = await LocationModel.findOne({ kind: 'city', name: new RegExp(`^${String(c.city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean();
    if (city) linked += (await raw.updateOne({ _id: c._id }, { $set: { location: city._id } })).modifiedCount;
  }
  await CollegeModel.syncIndexes();
  const rebuilt = await rebuildAllSummaries();
  console.error(`Stage 2 migration: ${drafts.modifiedCount} to draft, ${archived.modifiedCount} archived, ${samples.modifiedCount} marked as sample, ${linked} linked to a city, ${rebuilt} summaries rebuilt.`);
}

main()
  .catch((err: Error) => {
    console.error(`Migration failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
