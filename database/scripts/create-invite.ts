// Creates a single-use staff invitation code (run by someone with server access, e.g. for testing):
//   npm run invite:create -- --role counsellor
//   npm run invite:create -- --role admin --email person@example.com --days 3
// - The code is printed ONCE; only a keyed hash is stored. It works for one sign-up within the expiry.
// - Admin codes carry every permission (like the first-admin bootstrap); admins can also create codes with
//   chosen permissions from Admin > Administrators.
import { connectDatabase, disconnectDatabase } from '../../backend/src/config/database.js';
import { INVITE_ROLES, type InviteRole } from '../../backend/src/models/InviteCode.js';
import { createInviteFromCli } from '../../backend/src/services/inviteCode.service.js';
import { emailSchema } from '../../backend/src/validators/common.js';

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const role = arg('role') as InviteRole | undefined;
  const emailArg = arg('email');
  const email = emailArg ? emailSchema.safeParse(emailArg) : null;
  const days = Number(arg('days') ?? 7);
  if (!role || !INVITE_ROLES.includes(role) || (email && !email.success) || !Number.isInteger(days) || days < 1 || days > 30) {
    console.error('Usage: npm run invite:create -- --role counsellor|admin [--email person@example.com] [--days 1-30]');
    process.exitCode = 1;
    return;
  }
  await connectDatabase(undefined, { attempts: 1 });
  const { code, invite } = await createInviteFromCli({ role, email: email?.success ? email.data : null, days });
  console.error(`Invitation code for a new ${role}${invite.email ? ` (${invite.email} only)` : ''}, single use, valid until ${invite.expiresAt.toISOString()}:`);
  console.error(code);
  console.error('Keep it private. Sign up at /register, choose the role and enter this code.');
}

main()
  .catch((err: Error) => {
    console.error(`Could not create the code: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
