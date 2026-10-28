// Adds locations, the course catalogue and clearly labelled FICTIONAL sample colleges (`npm run seed:catalog`).
// Run explicitly only (never at startup). Non-destructive: inserts what is missing, never updates or deletes.
import { connectDatabase, disconnectDatabase } from '../../backend/src/config/database.js';
import { env } from '../../backend/src/config/env.js';
import { seedCatalog } from './catalog-data.js';

async function main() {
  if (env.isProduction) throw new Error('Refusing to seed sample data into a production database');
  await connectDatabase(env.MONGODB_URI, { attempts: 1 });
  const added = await seedCatalog();
  console.error(`Catalogue seed complete. Added: ${Object.entries(added).map(([k, n]) => `${n} ${k}`).join(', ')}.`);
  console.error('Sample colleges are fictional and labelled "Sample data – not a real institution". Remove them with: npm run seed:remove-samples');
}

main()
  .catch((err: Error) => {
    console.error(`Seed failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
