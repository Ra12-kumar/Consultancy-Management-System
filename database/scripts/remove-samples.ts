// Deletes every sample college (isSample: true) with its offerings, fees, shortlist entries and saved comparisons
// (`npm run seed:remove-samples`). Real colleges, locations and courses are never touched.
import { connectDatabase, disconnectDatabase } from '../../backend/src/config/database.js';
import { env } from '../../backend/src/config/env.js';
import { removeSampleColleges } from '../../backend/src/services/catalog.service.js';

async function main() {
  await connectDatabase(env.MONGODB_URI, { attempts: 1 });
  const removed = await removeSampleColleges();
  console.error(`Sample data removed: ${Object.entries(removed).map(([k, n]) => `${n} ${k}`).join(', ')}.`);
}

main()
  .catch((err: Error) => {
    console.error(`Removing samples failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
