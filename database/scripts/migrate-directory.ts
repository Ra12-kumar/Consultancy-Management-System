// One-off college directory migration (`npm run migrate:directory`). Explicit only; safe to run more than once.
// - Stores the derived annual, hostel and overall figures on every fee (used by the annual budget filter).
// - Sets the search name and listing level on existing colleges and refreshes their fee summaries.
// - Creates the indexes of the directory (colleges, fees, import jobs, review queue). Nothing is dropped or deleted.
import { connectDatabase, disconnectDatabase } from '../../backend/src/config/database.js';
import { env } from '../../backend/src/config/env.js';
import { CollegeModel, normalizeName } from '../../backend/src/models/College.js';
import { CollegeFeeModel } from '../../backend/src/models/CollegeFee.js';
import { CollegeImportJobModel, DirectoryReviewItemModel } from '../../backend/src/models/Directory.js';
import { LocationModel } from '../../backend/src/models/Location.js';
import { refreshCollegeSummary } from '../../backend/src/services/catalog.service.js';
import { calculateFee, storedTotals } from '../../backend/src/services/feeCalculator.js';

async function main() {
  await connectDatabase(env.MONGODB_URI, { attempts: 1 });
  for (const m of [CollegeModel, CollegeFeeModel, CollegeImportJobModel, DirectoryReviewItemModel, LocationModel]) await m.createIndexes();

  let fees = 0;
  for await (const f of CollegeFeeModel.find().lean().cursor()) {
    const b = calculateFee({ components: f.components as never, durationMonths: f.durationMonths, consultancyServiceChargeMinor: f.consultancyServiceChargeMinor ?? 0, discount: (f.discount as never) ?? null });
    // Raw update: published fee versions are otherwise immutable, and only the derived figures change here.
    await CollegeFeeModel.collection.updateOne({ _id: f._id }, { $set: storedTotals(b) });
    fees += 1;
  }

  let colleges = 0;
  for await (const c of CollegeModel.find().select('name listingLevel').lean().cursor()) {
    await CollegeModel.collection.updateOne({ _id: c._id }, { $set: { normalizedName: normalizeName(c.name), ...(c.listingLevel ? {} : { listingLevel: 'detailed' }) } });
    await refreshCollegeSummary(c._id);
    colleges += 1;
  }
  console.error(`Directory migration: ${fees} fee(s) and ${colleges} college(s) updated; indexes created.`);
}

main()
  .catch((err: Error) => {
    console.error(`Migration failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
