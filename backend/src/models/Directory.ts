import mongoose, { type InferSchemaType } from 'mongoose';

// ---- Import jobs ----

export const JOB_STATUSES = ['queued', 'running', 'completed', 'completed_with_errors', 'failed', 'interrupted'] as const;

// One run of an importer over one uploaded file. The file is kept privately so a failed or interrupted job can be
// retried from its last checkpoint; imports only ever create or update records, never delete them.
const importJobSchema = new mongoose.Schema(
  {
    importer: { type: String, required: true, maxlength: 60 },
    sourceName: { type: String, required: true, maxlength: 120 },
    sourceUrl: { type: String, maxlength: 500, default: '' },
    fileName: { type: String, maxlength: 200, required: true },
    fileKey: { type: String, required: true, match: /^imports\/[a-f0-9]{32}\.(xlsx|csv)$/ },
    fileSha256: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    // The date the source data refers to (e.g. the AISHE snapshot date), entered by the admin.
    sourceDataDate: { type: Date, default: null },
    // A full snapshot marks records not present in it as "not seen in latest source" (never deletes them).
    fullSnapshot: { type: Boolean, default: true },
    status: { type: String, enum: JOB_STATUSES, default: 'queued', required: true },
    // Set while running, so two imports can never run at once (unique partial index).
    lock: { type: String, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    // Next data row to process (checkpoint; header excluded).
    checkpoint: { type: Number, default: 0 },
    totalRows: { type: Number, default: 0 },
    counts: {
      processed: { type: Number, default: 0 },
      created: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      unchanged: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      rejected: { type: Number, default: 0 },
      duplicates: { type: Number, default: 0 },
      conflicts: { type: Number, default: 0 },
    },
    // First 200 row-level problems; the rest are counted.
    rowErrors: { type: [{ _id: false, row: Number, code: String, message: String }], default: [], validate: (v: unknown[]) => v.length <= 200 },
    failure: { type: String, maxlength: 500, default: '' },
    startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
importJobSchema.index({ createdAt: -1 }, { name: 'import_recent' });
importJobSchema.index({ lock: 1 }, { unique: true, partialFilterExpression: { lock: { $type: 'string' } }, name: 'import_single_runner' });

export type CollegeImportJob = InferSchemaType<typeof importJobSchema>;
export const CollegeImportJobModel = mongoose.model('CollegeImportJob', importJobSchema, 'collegeImportJobs');

// ---- Review queue ----

export const REVIEW_KINDS = ['possible_duplicate', 'field_conflict'] as const;

// Things an admin must decide: two records that may be the same institution, or an imported value that differs from
// one an admin verified (the verified value is kept until someone decides).
const reviewItemSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: REVIEW_KINDS, required: true },
    college: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true },
    otherCollege: { type: mongoose.Schema.Types.ObjectId, ref: 'College', default: null },
    field: { type: String, maxlength: 60, default: '' },
    currentValue: { type: mongoose.Schema.Types.Mixed, default: null },
    incomingValue: { type: mongoose.Schema.Types.Mixed, default: null },
    reason: { type: String, maxlength: 300, default: '' },
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'CollegeImportJob', default: null },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    resolution: { type: String, maxlength: 60, default: '' },
    note: { type: String, maxlength: 500, default: '' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
reviewItemSchema.index({ status: 1, kind: 1, createdAt: -1 }, { name: 'review_queue' });
// One open item per college, kind and field (re-imports do not pile up identical items).
reviewItemSchema.index({ college: 1, kind: 1, field: 1, otherCollege: 1 }, { unique: true, partialFilterExpression: { status: 'open' }, name: 'review_one_open' });

export type DirectoryReviewItem = InferSchemaType<typeof reviewItemSchema>;
export const DirectoryReviewItemModel = mongoose.model('DirectoryReviewItem', reviewItemSchema, 'directoryReviewItems');
