// Recomputes every college's derived fields (location ancestry, offered courses, fee range) from the source
// records (`npm run catalog:rebuild`). Safe to run any time; it only rewrites derived fields.
import { connectDatabase, disconnectDatabase } from '../../backend/src/config/database.js';
import { env } from '../../backend/src/config/env.js';
import { rebuildAllSummaries } from '../../backend/src/services/catalog.service.js';

async function main() {
  await connectDatabase(env.MONGODB_URI, { attempts: 1 });
  console.error(`Rebuilt the summaries of ${await rebuildAllSummaries()} college(s).`);
}

main()
  .catch((err: Error) => {
    console.error(`Rebuild failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
