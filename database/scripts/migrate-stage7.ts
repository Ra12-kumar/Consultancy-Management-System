// One-off Stage 7 migration (`npm run migrate:stage7`). Explicit only; safe to run more than once.
// - Grants the new `content.manage` and `payments.manage` permissions to owner admins (those with admins.manage).
// - Creates the indexes of the new collections (site settings, email templates, pages, announcements, payments).
import { connectDatabase, disconnectDatabase } from '../../backend/src/config/database.js';
import { env } from '../../backend/src/config/env.js';
import { AnnouncementModel, ContentPageModel, EmailTemplateOverrideModel, PaymentModel } from '../../backend/src/models/Content.js';
import { UserModel } from '../../backend/src/models/User.js';

async function main() {
  await connectDatabase(env.MONGODB_URI, { attempts: 1 });
  const granted = await UserModel.updateMany({ role: 'admin', permissions: 'admins.manage' }, { $addToSet: { permissions: { $each: ['content.manage', 'payments.manage'] } } });
  for (const m of [EmailTemplateOverrideModel, ContentPageModel, AnnouncementModel, PaymentModel]) await m.createIndexes();
  console.error(`Stage 7 migration: new permissions granted to ${granted.modifiedCount} owner admin(s); indexes created.`);
}

main()
  .catch((err: Error) => {
    console.error(`Migration failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
