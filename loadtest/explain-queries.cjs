// Read-only: runs explain("executionStats") for the API's most frequent query shapes against a database and prints
// the winning plan (index or collection scan), documents examined vs returned and time. Usage: node loadtest/explain-queries.cjs <mongodb-uri>  (use a staging copy, never needed on production)

const { MongoClient, ObjectId } = require('mongodb');

const anyId = new ObjectId();
const Q = [
  ['users', 'sign-in by email', { email: 'someone@example.com' }, null, 1],
  ['sessions', 'session lookup by token hash', { tokenHash: 'x'.repeat(64) }, null, 1],
  ['colleges', 'public list (featured first)', { status: 'published' }, { featured: -1, name: 1 }, 24],
  ['colleges', 'public list by state', { status: 'published', state: 'Karnataka' }, { featured: -1, name: 1 }, 24],
  ['colleges', 'public list by course', { status: 'published', courseIds: anyId }, null, 24],
  ['colleges', 'public list by fee', { status: 'published', 'feeSummary.minTotalMinor': { $lte: 50000000 } }, { 'feeSummary.minTotalMinor': 1 }, 24],
  ['colleges', 'college page by slug', { slug: 'sample-college' }, null, 1],
  ['colleges', 'admin list (recently updated)', {}, { updatedAt: -1 }, 20],
  ['collegecourses', 'offerings of a college', { college: anyId }, { createdAt: 1 }, 50],
  ['collegecourses', 'active offerings (course browser)', { status: 'active' }, null, 5000],
  ['collegefees', 'published fee of an offering', { collegeCourse: { $in: [anyId] }, status: 'published' }, { academicYear: -1, officialTotalMinor: 1 }, 1],
  ['enquiries', 'student: my enquiries', { student: anyId }, { createdAt: -1 }, 100],
  ['enquiries', 'admin: open enquiries, newest', { status: { $in: ['NEW', 'CONTACT_PENDING', 'CONTACTED'] } }, { createdAt: -1, _id: 1 }, 20],
  ['enquiries', 'admin: by status, newest', { status: 'NEW' }, { createdAt: -1, _id: 1 }, 20],
  ['enquiries', 'counsellor: my open enquiries', { assignedTo: anyId, status: { $in: ['NEW', 'CONTACTED'] } }, null, 20],
  ['enquiries', 'follow-ups due', { followUpAt: { $lte: new Date() } }, { followUpAt: 1 }, 50],
  ['enquiries', 'by college', { 'preferences.colleges': anyId }, null, 50],
  ['enquiryEvents', 'history of an enquiry', { enquiry: anyId }, { createdAt: 1 }, 200],
  ['scholarships', 'public scholarships', { status: 'published' }, null, 20],
  ['callbackleads', 'callback requests by status', { status: 'new' }, { createdAt: -1 }, 10],
  ['callbackleads', 'callback requests of a counsellor', { assignedTo: anyId, status: 'new' }, { createdAt: -1 }, 10],
  ['emailDeliveryLogs', 'email queue: due messages', { status: { $in: ['queued', 'retrying'] }, nextAttemptAt: { $lte: new Date() } }, { nextAttemptAt: 1 }, 20],
];

function stageNames(plan) {
  const out = [];
  (function walk(p) {
    if (!p) return;
    out.push(p.stage + (p.indexName ? `(${p.indexName})` : ''));
    walk(p.inputStage);
    (p.inputStages || []).forEach(walk);
  })(plan);
  return out.join(' < ');
}

(async () => {
  const c = await MongoClient.connect(process.argv[2]);
  const db = c.db();
  const rows = [];
  for (const [coll, label, filter, sort, limit] of Q) {
    let cur = db.collection(coll).find(filter).limit(limit);
    if (sort) cur = cur.sort(sort);
    const e = await cur.explain('executionStats');
    const s = e.executionStats;
    const plan = stageNames(e.queryPlanner.winningPlan);
    rows.push({ query: `${coll}: ${label}`, plan, docs: (await db.collection(coll).estimatedDocumentCount()), examined: s.totalDocsExamined, keys: s.totalKeysExamined, returned: s.nReturned, ms: s.executionTimeMillis, collscan: /COLLSCAN/.test(plan) ? 'YES' : '', sortInMemory: /(^| )SORT/.test(plan) ? 'YES' : '' });
  }
  console.log(JSON.stringify(rows, null, 1));
  await c.close();
})();
