// Checks every college-finder website now (`npm run websites:check`), instead of waiting for the backend's
// automatic 14-day check. Read-only for the database; writes storage/cache/website-health.json. Galgotias colleges
// are excluded (see backend/src/services/websiteHealth.service.ts).
import { explorerColleges } from '../../backend/src/services/collegeExplorer.service.js';
import { checkWebsites } from '../../backend/src/services/websiteHealth.service.js';

async function main() {
  const colleges = await explorerColleges();
  if (!colleges.length) throw new Error('The college list is not available yet (it is downloaded from Wikidata on first use)');
  const concurrency = Number(process.argv[2] ?? 16);
  const summary = await checkWebsites(colleges, { concurrency, onProgress: (done, total) => console.error(`Checked ${done} of ${total} websites`) });
  console.error(`Done: ${summary.checked} checked, ${summary.working} working, ${summary.broken} broken or unreachable.`);
}

main().catch((err: Error) => {
  console.error(`Website check failed: ${err.message}`);
  process.exitCode = 1;
});
