import mongoose, { type InferSchemaType } from 'mongoose';

// ---- Stored files (private uploads) ----

export const FILE_KINDS = ['photo', 'document'] as const;

// Metadata for a file kept in the private upload folder (env.uploadDir). The file itself is never served
// statically: /api/files/:id checks who is asking first.
const storedFileSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: FILE_KINDS, required: true },
    enquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry', default: null },
    documentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Random storage key (never the user's file name).
    key: { type: String, required: true, match: /^[a-z]+\/[a-f0-9]{32}\.(jpg|png|webp|pdf)$/ },
    originalName: { type: String, trim: true, maxlength: 120, default: '' },
    mime: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], required: true },
    size: { type: Number, required: true, min: 1 },
    sha256: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
storedFileSchema.index({ owner: 1, kind: 1 }, { name: 'file_by_owner' });
storedFileSchema.index({ enquiry: 1 }, { name: 'file_by_enquiry' });
storedFileSchema.index({ key: 1 }, { unique: true, name: 'file_key_unique' });

export type StoredFile = InferSchemaType<typeof storedFileSchema>;
export const StoredFileModel = mongoose.model('StoredFile', storedFileSchema, 'storedFiles');

// ---- Feedback and testimonials ----

export const FEEDBACK_CATEGORIES = ['counselling', 'service', 'website', 'college_information', 'admission_process', 'other'] as const;
export const FEEDBACK_STATUSES = ['open', 'responded', 'resolved'] as const;

const feedbackSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    enquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry', default: null },
    rating: { type: Number, required: true, min: 1, max: 5 },
    category: { type: String, enum: FEEDBACK_CATEGORIES, required: true },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: FEEDBACK_STATUSES, default: 'open', required: true },
    // The conversation (bounded): replies from the team and follow-ups from the student.
    thread: {
      type: [{ _id: false, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, role: String, name: String, body: { type: String, maxlength: 2000 }, at: { type: Date, default: () => new Date() } }],
      default: [],
      validate: (v: unknown[]) => v.length <= 30,
    },
    // Testimonials: only with the student's consent AND an admin's approval. Shown as first name + city.
    publishConsent: { type: Boolean, default: false },
    testimonial: {
      status: { type: String, enum: ['none', 'approved', 'rejected'], default: 'none' },
      displayName: { type: String, default: '' },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      reviewedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);
feedbackSchema.index({ student: 1, createdAt: -1 }, { name: 'feedback_by_student' });
feedbackSchema.index({ status: 1, createdAt: -1 }, { name: 'feedback_by_status' });
feedbackSchema.index({ 'testimonial.status': 1, publishConsent: 1, updatedAt: -1 }, { name: 'feedback_testimonials' });

export type Feedback = InferSchemaType<typeof feedbackSchema>;
export const FeedbackModel = mongoose.model('Feedback', feedbackSchema, 'feedback');

// ---- Personal data requests (correction or deletion) ----

export const DATA_REQUEST_TYPES = ['correction', 'deletion'] as const;
export const DATA_REQUEST_STATUSES = ['pending', 'completed', 'rejected', 'cancelled'] as const;

const dataRequestSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, match: /^DRQ-\d{4}-\d{6}$/ },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: DATA_REQUEST_TYPES, required: true },
    details: { type: String, trim: true, maxlength: 2000, default: '' },
    status: { type: String, enum: DATA_REQUEST_STATUSES, default: 'pending', required: true },
    // Shown to the student.
    resolutionNote: { type: String, trim: true, maxlength: 1000, default: '' },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    handledAt: { type: Date, default: null },
  },
  { timestamps: true },
);
dataRequestSchema.index({ reference: 1 }, { unique: true, name: 'data_request_reference_unique' });
dataRequestSchema.index({ student: 1, createdAt: -1 }, { name: 'data_request_by_student' });
dataRequestSchema.index({ status: 1, createdAt: 1 }, { name: 'data_request_queue' });
// One pending request of each type per student.
dataRequestSchema.index({ student: 1, type: 1 }, { unique: true, partialFilterExpression: { status: 'pending' }, name: 'data_request_one_pending' });

export type DataRequest = InferSchemaType<typeof dataRequestSchema>;
export const DataRequestModel = mongoose.model('DataRequest', dataRequestSchema, 'dataRequests');
