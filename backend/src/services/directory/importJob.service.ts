import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Request } from 'express';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { CollegeModel, IMPORTABLE_FIELDS, normalizeName } from '../../models/College.js';
import { CollegeImportJobModel, DirectoryReviewItemModel } from '../../models/Directory.js';
import { UserModel } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../utils/logger.js';
import { actorFrom, audit } from '../audit.service.js';
import { pageMeta } from '../catalog.service.js';
import { frontendLink, safeEmail } from '../enquiryShared.js';
import { LocationCache, slugify } from './geo.js';
import { importerById, mapHeaders, type ImporterDef, type Institution } from './importers.js';
import { invalidateDirectoryCache } from './cache.js';

type Lean = Record<string, any> & { _id: mongoose.Types.ObjectId }; // eslint-disable-line @typescript-eslint/no-explicit-any
const BATCH = 500;
const MAX_ROW_ERRORS = 200;
const LOCK = 'college-import';

// ---- Reading the uploaded file ----

function detectFormat(buf: Buffer): 'xlsx' | 'csv' | null {
  if (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'xlsx';
  // Text: no NUL bytes in the first 4 KB.
  if (!buf.subarray(0, 4096).includes(0)) return 'csv';
  return null;
}

const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if ('text' in v && v.text != null) return String(v.text);
    if ('result' in v && v.result != null) return String(v.result);
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return '';
  }
  return String(v);
};

// All rows of the first worksheet as text, starting at the header row (the first row naming the required columns).
export async function readRows(file: string, format: 'xlsx' | 'csv', def: ImporterDef) {
  const wb = new ExcelJS.Workbook();
  const ws = format === 'xlsx' ? (await wb.xlsx.readFile(file), wb.worksheets[0]) : await wb.csv.readFile(file);
  if (!ws) throw new ApiError(422, 'EMPTY_FILE', 'The file has no worksheet');
  const all: string[][] = [];
  const numbers: number[] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as ExcelJS.CellValue[];
    all.push(values.slice(1).map((v) => cellText(v).trim()));
    numbers.push(row.number);
  });
  for (let h = 0; h < Math.min(all.length, 15); h++) {
    const { index, missing } = mapHeaders(def, all[h]!);
    if (!missing.length) {
      const rows = all.slice(h + 1).map((cells) => Object.fromEntries(Object.entries(index).map(([field, i]) => [field, cells[i] ?? ''])));
      // Spreadsheet row numbers, so error reports point at the right line even when blank rows are skipped.
      return { rows, rowNumbers: numbers.slice(h + 1), headerRow: numbers[h]! };
    }
  }
  const { missing } = mapHeaders(def, all[0] ?? []);
  throw new ApiError(422, 'MISSING_COLUMNS', `This file does not have the expected columns for "${def.label}": ${missing.join(', ')}`, missing.map((m) => ({ field: 'file', message: `Missing column: ${m}` })));
}

// ---- Creating and listing jobs ----

const toJob = (j: Lean) => ({
  id: String(j._id),
  importer: j.importer,
  sourceName: j.sourceName,
  fileName: j.fileName,
  sourceDataDate: j.sourceDataDate ?? null,
  fullSnapshot: j.fullSnapshot,
  status: j.status,
  attempts: j.attempts,
  totalRows: j.totalRows,
  checkpoint: j.checkpoint,
  progress: j.totalRows ? Math.min(100, Math.round((j.checkpoint / j.totalRows) * 100)) : 0,
  counts: j.counts,
  rowErrors: j.rowErrors ?? [],
  failure: j.failure,
  startedAt: j.startedAt ?? null,
  finishedAt: j.finishedAt ?? null,
  createdAt: j.createdAt,
});

export async function createImportJob(req: Request, input: { importer: string; sourceDataDate: Date | null; fullSnapshot: boolean }) {
  const def = importerById(input.importer);
  if (!def) throw new ApiError(422, 'VALIDATION_ERROR', 'Unknown importer', [{ field: 'importer', message: 'Choose a data source' }]);
  const file = req.file;
  if (!file?.buffer?.length) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a file to import', [{ field: 'file', message: 'Choose a file' }]);
  const format = detectFormat(file.buffer);
  if (!format || !def.formats.includes(format)) throw new ApiError(415, 'UNSUPPORTED_FILE', `Upload the ${def.formats.join(' or ').toUpperCase()} file from the source`);
  const key = `imports/${randomBytes(16).toString('hex')}.${format}`;
  const full = path.join(env.uploadDir, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, file.buffer, { flag: 'wx', mode: 0o600 });
  // Check the columns now, so an admin learns about a wrong file immediately rather than from a failed job.
  try {
    await readRows(full, format, def);
  } catch (err) {
    await fs.rm(full, { force: true });
    throw err;
  }
  const job = await CollegeImportJobModel.create({
    importer: def.id,
    sourceName: def.sourceName,
    sourceUrl: def.sourceUrl,
    fileName: path.basename(file.originalname).replace(/[^\w.\- ()]/g, '_').slice(-200) || 'upload',
    fileKey: key,
    fileSha256: createHash('sha256').update(file.buffer).digest('hex'),
    sourceDataDate: input.sourceDataDate,
    fullSnapshot: input.fullSnapshot,
    startedBy: req.user!.id,
  });
  await audit(actorFrom(req), 'directory.import_queued', { type: 'college_import', id: String(job._id) }, req, { importer: def.id, file: job.fileName });
  kickImports();
  return toJob(job.toObject() as Lean);
}

export async function listImportJobs({ page, limit }: { page: number; limit: number }) {
  const [items, total] = await Promise.all([CollegeImportJobModel.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), CollegeImportJobModel.countDocuments()]);
  return { items: (items as Lean[]).map(toJob), meta: pageMeta(page, limit, total) };
}

export async function importJob(id: string) {
  const j = await CollegeImportJobModel.findById(id).lean();
  if (!j) throw ApiError.notFound('Import not found');
  return toJob(j as Lean);
}

// Failed or interrupted jobs continue from their last checkpoint.
export async function retryImportJob(id: string, req: Request) {
  const j = await CollegeImportJobModel.findOneAndUpdate({ _id: id, status: { $in: ['failed', 'interrupted'] } }, { $set: { status: 'queued', failure: '' } }, { new: true }).lean();
  if (!j) throw new ApiError(409, 'NOT_RETRYABLE', 'Only a failed or interrupted import can be retried');
  await audit(actorFrom(req), 'directory.import_retried', { type: 'college_import', id }, req, { from: j.checkpoint });
  kickImports();
  return toJob(j as Lean);
}

// ---- Running ----

const pickInstitutionFields = (v: Institution) => ({
  name: v.name,
  type: v.type,
  ownership: v.ownership,
  category: v.category,
  subtype: v.subtype,
  state: v.state,
  district: v.district,
  areaType: v.areaType,
  yearEstablished: v.yearEstablished,
  affiliatedUniversity: v.affiliatedUniversity,
});
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const slugFor = (v: Institution) => `${slugify(v.name).slice(0, 60).replace(/-+$/, '')}-${(v.aisheCode ?? createHash('sha1').update(normalizeName(v.name) + v.state).digest('hex').slice(0, 8)).toLowerCase()}`;

type Counts = { processed: number; created: number; updated: number; unchanged: number; skipped: number; rejected: number; duplicates: number; conflicts: number };

async function processBatch(job: Lean, rows: Array<{ row: number; value: Institution }>, places: LocationCache, now: Date, counts: Counts) {
  const codes = rows.map((r) => r.value.aisheCode).filter(Boolean) as string[];
  const existing = new Map(((await CollegeModel.find({ aisheCode: { $in: codes } }).select('aisheCode name type ownership category subtype state district areaType yearEstablished affiliatedUniversity lockedFields status source').lean()) as Lean[]).map((c) => [c.aisheCode as string, c]));
  // Possible duplicates for new institutions: same name and state, but no AISHE code (e.g. added by hand).
  const fresh = rows.filter((r) => !existing.has(r.value.aisheCode!));
  const lookalikes = fresh.length
    ? ((await CollegeModel.find({ normalizedName: { $in: fresh.map((r) => normalizeName(r.value.name)) }, aisheCode: null }).select('normalizedName state').lean()) as Lean[])
    : [];
  const ops: mongoose.AnyBulkWriteOperation[] = [];
  const reviews: Array<Record<string, unknown>> = [];
  for (const { value } of rows) {
    const locationIds = await places.place(value.state, value.district);
    const current = existing.get(value.aisheCode!);
    const sourceSet = { 'source.name': job.sourceName, 'source.url': job.sourceUrl, 'source.importer': job.importer, 'source.lastSeenAt': now, 'source.job': job._id };
    if (!current) {
      const twin = lookalikes.find((l) => l.normalizedName === normalizeName(value.name) && l.state === value.state);
      const _id = new mongoose.Types.ObjectId();
      ops.push({
        insertOne: {
          document: {
            _id,
            ...pickInstitutionFields(value),
            aisheCode: value.aisheCode,
            slug: slugFor(value),
            normalizedName: normalizeName(value.name),
            // Basic listings are public at once, unless they may duplicate an existing record.
            status: twin ? 'needs_review' : 'published',
            listingLevel: 'basic',
            locationIds,
            source: { name: job.sourceName, url: job.sourceUrl, importer: job.importer, firstImportedAt: now, lastSyncedAt: now, lastSeenAt: now, job: job._id },
          },
        },
      });
      counts.created += 1;
      if (twin) {
        counts.duplicates += 1;
        reviews.push({ kind: 'possible_duplicate', college: _id, otherCollege: twin._id, reason: 'Same name and state as an existing record without an AISHE code', job: job._id });
      }
      continue;
    }
    const incoming = pickInstitutionFields(value);
    const set: Record<string, unknown> = {};
    for (const field of IMPORTABLE_FIELDS) {
      const next = incoming[field];
      if (same(current[field], next)) continue;
      if ((current.lockedFields ?? []).includes(field)) {
        // An admin verified this field: keep it and ask for a decision.
        counts.conflicts += 1;
        reviews.push({ kind: 'field_conflict', college: current._id, field, currentValue: current[field] ?? null, incomingValue: next ?? null, reason: `${job.sourceName} has a different value`, job: job._id });
      } else set[field] = next;
    }
    if (Object.keys(set).length) {
      if (set.name) set.normalizedName = normalizeName(String(set.name));
      if (set.state || set.district) set.locationIds = locationIds;
      ops.push({ updateOne: { filter: { _id: current._id }, update: { $set: { ...set, ...sourceSet, 'source.lastSyncedAt': now } } } });
      counts.updated += 1;
    } else {
      ops.push({ updateOne: { filter: { _id: current._id }, update: { $set: sourceSet } } });
      counts.unchanged += 1;
    }
  }
  if (ops.length) await CollegeModel.bulkWrite(ops, { ordered: false });
  for (const r of reviews) {
    // One open item per college/kind/field; a repeat import refreshes it instead of adding another.
    await DirectoryReviewItemModel.updateOne({ college: r.college, kind: r.kind, field: r.field ?? '', otherCollege: r.otherCollege ?? null, status: 'open' }, { $set: r }, { upsert: true });
  }
}

async function withRetry<T>(fn: () => Promise<T>, label: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const transient = /Mongo(Network|ServerSelection|NotConnected)|timed out/i.test(`${(err as Error).name} ${(err as Error).message}`);
      if (!transient || attempt >= 3) throw err;
      logger.warn({ label, attempt }, 'Import step failed temporarily; retrying');
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

export async function runImportJob(jobId: mongoose.Types.ObjectId) {
  const job = (await CollegeImportJobModel.findById(jobId).lean()) as Lean;
  const def = importerById(job.importer)!;
  const now = new Date();
  const counts: Counts = { processed: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, rejected: 0, duplicates: 0, conflicts: 0, ...(job.counts ?? {}) };
  const rowErrors: Array<{ row: number; code: string; message: string }> = [...(job.rowErrors ?? [])];
  const format = job.fileKey.endsWith('.xlsx') ? 'xlsx' : 'csv';
  const { rows, rowNumbers } = await readRows(path.join(env.uploadDir, job.fileKey), format, def);
  await CollegeImportJobModel.updateOne({ _id: job._id }, { $set: { totalRows: rows.length } });
  const places = new LocationCache();
  const seen = new Set<string>();
  for (let start = job.checkpoint; start < rows.length; start += BATCH) {
    const batch: Array<{ row: number; value: Institution }> = [];
    rows.slice(start, start + BATCH).forEach((raw, i) => {
      const rowNumber = rowNumbers[start + i]!;
      counts.processed += 1;
      if (Object.values(raw).every((v) => !String(v).trim())) {
        counts.skipped += 1;
        return;
      }
      const parsed = def.parse(raw);
      if (!parsed.ok) {
        counts.rejected += 1;
        if (rowErrors.length < MAX_ROW_ERRORS) rowErrors.push({ row: rowNumber, code: parsed.code, message: parsed.message });
        return;
      }
      // The same code twice in one file: keep the first, report the rest.
      if (parsed.value.aisheCode && seen.has(parsed.value.aisheCode)) {
        counts.skipped += 1;
        if (rowErrors.length < MAX_ROW_ERRORS) rowErrors.push({ row: rowNumber, code: 'DUPLICATE_IN_FILE', message: `${parsed.value.aisheCode} appears more than once` });
        return;
      }
      if (parsed.value.aisheCode) seen.add(parsed.value.aisheCode);
      batch.push({ row: rowNumber, value: parsed.value });
    });
    await withRetry(() => processBatch(job, batch, places, now, counts), 'batch');
    // Checkpoint: a restart continues from here.
    await CollegeImportJobModel.updateOne({ _id: job._id }, { $set: { checkpoint: Math.min(start + BATCH, rows.length), counts, rowErrors } });
  }
  // Records of this source missing from a full snapshot are reported (never deleted).
  const missing = job.fullSnapshot ? await CollegeModel.countDocuments({ 'source.importer': def.id, 'source.lastSeenAt': { $lt: job.createdAt } }) : 0;
  return { counts, rowErrors, missing };
}

let running = false;
let again = false;

// Runs queued imports one at a time (also guarded across servers by the unique "lock" index).
export async function processImportQueue() {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      for (;;) {
        let job: Lean | null = null;
        try {
          job = (await CollegeImportJobModel.findOneAndUpdate({ status: 'queued' }, { $set: { status: 'running', lock: LOCK, startedAt: new Date() }, $inc: { attempts: 1 } }, { sort: { createdAt: 1 }, new: true }).lean()) as Lean | null;
        } catch (err) {
          if ((err as { code?: number }).code === 11000) break; // another import is running
          throw err;
        }
        if (!job) break;
        try {
          const { counts, rowErrors, missing } = await runImportJob(job._id);
          const status = counts.rejected > 0 ? 'completed_with_errors' : 'completed';
          await CollegeImportJobModel.updateOne({ _id: job._id }, { $set: { status, lock: null, finishedAt: new Date(), counts, rowErrors, failure: missing ? `${missing} earlier record(s) from this source were not in this file (kept, marked as not seen).` : '' } });
          await notifyAdmins(job, status, counts);
        } catch (err) {
          logger.error({ err: { name: (err as Error).name, message: (err as Error).message }, job: String(job._id) }, 'College import failed');
          await CollegeImportJobModel.updateOne({ _id: job._id }, { $set: { status: 'failed', lock: null, finishedAt: new Date(), failure: err instanceof ApiError ? err.message : 'The import stopped because of an unexpected error. Already imported batches are kept; retry to continue.' } });
          await notifyAdmins(job, 'failed');
        }
        invalidateDirectoryCache();
      }
    } while (again);
  } finally {
    running = false;
  }
}

export function kickImports() {
  if (env.isTest) return;
  setImmediate(() => void processImportQueue().catch((err: Error) => logger.error({ err: { message: err.message } }, 'Import queue error')));
}

// After a restart, a job left "running" was interrupted: release it so it can be retried from its checkpoint.
export async function recoverInterruptedImports() {
  const r = await CollegeImportJobModel.updateMany({ status: 'running' }, { $set: { status: 'interrupted', lock: null, failure: 'The server restarted during this import. Retry to continue from the last checkpoint.' } });
  if (r.modifiedCount) logger.warn({ count: r.modifiedCount }, 'Marked interrupted college imports');
}

// Emails catalogue admins when an import fails, or when it changes many records (a material source change).
async function notifyAdmins(job: Lean, status: string, counts?: Counts) {
  const material = counts && counts.processed > 0 && (counts.updated + counts.created) / counts.processed > 0.05;
  if (status === 'completed' && !material) return;
  const admins = await UserModel.find({ role: 'admin', status: 'active', permissions: 'catalog.manage' }).select('email name').lean();
  const summary = status === 'failed' ? 'failed' : counts ? `${counts.created} new, ${counts.updated} updated, ${counts.rejected} rejected, ${counts.conflicts} conflicts, ${counts.duplicates} possible duplicates` : status;
  for (const a of admins) {
    await safeEmail({ to: a.email, template: 'import_report', params: { name: a.name, source: job.sourceName, file: job.fileName, status, summary, link: frontendLink('/admin/college-data') }, dedupeKey: `import:${String(job._id)}:${status}:${a.email}` });
  }
}
