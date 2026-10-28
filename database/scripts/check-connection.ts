// Checks that this project's MongoDB is reachable (`npm run db:check`). Prints the database name and the
// collections, never the connection string or credentials. Read-only.
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../backend/src/config/database.js';
import { env } from '../../backend/src/config/env.js';

async function main() {
  await connectDatabase(env.MONGODB_URI, { attempts: 1 });
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle');
  const collections = (await db.listCollections().toArray()).map((c) => c.name).sort();
  console.error(`Connected to database "${mongoose.connection.name}". Collections: ${collections.join(', ') || '(none yet)'}`);
}

main()
  .catch((err: Error) => {
    console.error(`Database check failed: ${err.name}: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
