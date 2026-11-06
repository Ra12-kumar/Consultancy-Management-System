// Adds or refreshes the universities of Admin > Online UG & PG in the college catalogue:
//   npm run online:import                 checks every website and logo, writes nothing
//   npm run online:import -- --apply      also creates/updates the records and publishes them
//   npm run online:import -- --apply --admin admin@example.com   (the audit log names this admin)
// Data: database/data/online-universities.json (official websites and the UGC-DEB online programme list).
// Safe to run again: records are matched by slug or name and updated, never duplicated.
import fs from 'node:fs';
import path from 'node:path';
import type { Request } from 'express';
import { connectDatabase, disconnectDatabase } from '../../backend/src/config/database.js';
import { env } from '../../backend/src/config/env.js';
import { UserModel } from '../../backend/src/models/User.js';
import { importOnlineUniversities, type OnlineUniversitiesFile } from './online-universities.lib.js';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

async function main() {
  const apply = process.argv.includes('--apply');
  // npm runs the script from backend/.
  const file = JSON.parse(fs.readFileSync(path.resolve('../database/data/online-universities.json'), 'utf8')) as OnlineUniversitiesFile;
  await connectDatabase(env.MONGODB_URI, { attempts: 1 });
  const email = arg('admin');
  const admin = (await UserModel.findOne({ role: 'admin', permissions: 'catalog.manage', ...(email && { email: email.toLowerCase() }) }).sort({ createdAt: 1 }).lean()) as { _id: unknown; name: string; email: string } | null;
  if (!admin) throw new Error(email ? 'No admin with catalog permission has that email' : 'No admin with catalog permission exists');
  const req = { user: { id: String(admin._id), role: 'admin', name: admin.name, email: admin.email }, ip: '', id: 'online-universities-import' } as unknown as Request;

  const reports = await importOnlineUniversities(file, { req, apply });
  for (const r of reports) {
    console.error(
      `${r.action.padEnd(8)} ${r.published ? 'published' : '         '} ${r.name}\n    website ${r.website.ok ? 'ok' : 'FAIL'} (${r.website.reason}) · logo ${r.logo.ok ? 'ok' : 'FAIL'} (${r.logo.reason}) · courses +${r.offerings.created} ~${r.offerings.updated}${r.offerings.unmapped.length ? ` · not mapped: ${r.offerings.unmapped.join('; ')}` : ''}${r.note ? `\n    ${r.note}` : ''}`,
    );
  }
  const n = (f: (r: (typeof reports)[number]) => boolean) => reports.filter(f).length;
  console.error(`\n${reports.length} universities · websites ok ${n((r) => r.website.ok)} · logos ok ${n((r) => r.logo.ok)} · published ${n((r) => r.published)}${apply ? '' : ' (dry run: add --apply to write)'}`);
}

main()
  .catch((err: Error) => {
    console.error(`Import failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
