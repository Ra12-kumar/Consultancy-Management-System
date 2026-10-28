// Creates the FIRST administrator (run once, by someone with server access):
//   npm run admin:bootstrap -- --email admin@example.com --name "Full Name"
// - Refuses if any administrator already exists (further admins are invited from the admin dashboard).
// - No password is created or printed: the admin receives a single-use "set your password" link by email,
//   and the same link is printed here once (valid 72 hours) in case email is not configured yet.
import { connectDatabase, disconnectDatabase } from '../../backend/src/config/database.js';
import { verifyMailTransport } from '../../backend/src/config/mail.js';
import { bootstrapFirstAdmin } from '../../backend/src/services/admin.service.js';
import { processEmailQueue } from '../../backend/src/services/emailWorker.js';
import { emailSchema, nameSchema } from '../../backend/src/validators/common.js';

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = emailSchema.safeParse(arg('email') ?? '');
  const name = nameSchema.safeParse(arg('name') ?? '');
  if (!email.success || !name.success) {
    console.error('Usage: npm run admin:bootstrap -- --email admin@example.com --name "Full Name"');
    process.exitCode = 1;
    return;
  }
  await connectDatabase(undefined, { attempts: 1 });
  const { user, setLink } = await bootstrapFirstAdmin({ email: email.data, name: name.data });
  await verifyMailTransport();
  await processEmailQueue();
  console.error(`Administrator created: ${user.email} (all permissions).`);
  console.error('Set-password link (single use, valid 72 hours; keep it private):');
  console.error(setLink);
}

main()
  .catch((err: Error & { code?: string }) => {
    console.error(`Bootstrap refused: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
