// One-off Stage 5 migration (`npm run migrate:stage5`). Explicit only; safe to run more than once.
// - Grants the new `feedback.manage` and `privacy.manage` permissions to owner admins (those with admins.manage).
// - Creates the indexes of the new collections (stored files, feedback, personal data requests).
import { connectDatabase, disconnectDatabase } from '../../backend/src/config/database.js';
import { env } from '../../backend/src/config/env.js';
import { DataRequestModel, FeedbackModel, StoredFileModel } from '../../backend/src/models/Support.js';
import { UserModel } from '../../backend/src/models/User.js';

async function main() {
  await connectDatabase(env.MONGODB_URI, { attempts: 1 });
  const granted = await UserModel.updateMany({ role: 'admin', permissions: 'admins.manage' }, { $addToSet: { permissions: { $each: ['feedback.manage', 'privacy.manage'] } } });
  for (const m of [StoredFileModel, FeedbackModel, DataRequestModel]) await m.createIndexes();
  console.error(`Stage 5 migration: new permissions granted to ${granted.modifiedCount} owner admin(s); indexes created.`);
}

main()
  .catch((err: Error) => {
    console.error(`Migration failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
