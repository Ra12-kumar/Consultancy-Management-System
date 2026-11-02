import mongoose, { type InferSchemaType } from 'mongoose';

// Pipeline statuses in order, then side statuses.
export const PIPELINE = ['NEW', 'CONTACT_PENDING', 'CONTACTED', 'INTERESTED', 'ELIGIBILITY_CHECK', 'COUNSELLING_SCHEDULED', 'COUNSELLING_COMPLETED', 'DOCUMENTS_PENDING', 'APPLICATION_IN_PROGRESS', 'SUBMITTED', 'OFFER_RECEIVED', 'ADMITTED'] as const;
export const SIDE_STATUSES = ['ON_HOLD', 'NOT_INTERESTED', 'REJECTED', 'WITHDRAWN', 'CLOSED'] as const;
export const ENQUIRY_STATUSES = [...PIPELINE, ...SIDE_STATUSES] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];
// Closed-off statuses (an enquiry in one of these is not "open").
export const FINISHED_STATUSES: EnquiryStatus[] = ['ADMITTED', 'NOT_INTERESTED', 'REJECTED', 'WITHDRAWN', 'CLOSED'];
// Where an enquiry came from (sent by the page that opened the enquiry form).
export const LEAD_SOURCES = ['college_search', 'live_search', 'featured_college', 'top_colleges', 'college_page', 'compare', 'shortlist', 'recommended', 'home', 'campaign', 'direct'] as const;
export const CALLBACK_TIMES = ['any', 'morning', 'afternoon', 'evening'] as const;
export const CALLBACK_KINDS = ['callback', 'counselling'] as const;
export const INSTITUTION_TYPES = ['government', 'private', 'deemed', 'autonomous', 'other'] as const;
export const DOCUMENT_STATUSES = ['requested', 'received', 'waived'] as const;

// Atomic sequence numbers for human-friendly references (ENQ-2026-000123).
const counterSchema = new mongoose.Schema({ _id: { type: String, required: true }, seq: { type: Number, default: 0 } }, { versionKey: false });
export const CounterModel = mongoose.model('Counter', counterSchema, 'counters');

const feeEstimateSchema = new mongoose.Schema(
  {
    college: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true },
    collegeName: { type: String, required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    courseName: { type: String, required: true },
    fee: { type: mongoose.Schema.Types.ObjectId, ref: 'CollegeFee', required: true },
    version: { type: Number, required: true },
    academicYear: { type: String, required: true },
    intake: { type: String, default: '' },
    officialTotalMinor: { type: Number, required: true },
    consultancyServiceChargeMinor: { type: Number, required: true },
    estimatedTotalMinor: { type: Number, required: true },
    isSample: { type: Boolean, default: false },
  },
  { _id: false },
);

const documentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  status: { type: String, enum: DOCUMENT_STATUSES, default: 'requested' },
  // Shown to the student.
  note: { type: String, trim: true, maxlength: 300, default: '' },
  requestedAt: { type: Date, default: () => new Date() },
  receivedAt: { type: Date, default: null },
  // Files the student uploaded for this document (StoredFile ids, private).
  files: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StoredFile' }], default: [], validate: (v: unknown[]) => v.length <= 5 },
});

// A student's admission enquiry. Its history lives in `enquiryEvents` (not embedded, so it can grow).
const enquirySchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, match: /^ENQ-\d{4}-\d{6}$/ },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ENQUIRY_STATUSES, default: 'NEW', required: true },
    // Taken on the server at submission time.
    studentSnapshot: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      mobile: { type: String, default: null },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      qualification: { type: String, default: null },
      percentage: { type: Number, default: null },
      passingYear: { type: Number, default: null },
      entranceExams: { type: [{ _id: false, name: String, score: String, year: Number }], default: [] },
      // Class 10, Class 12 and graduation percentages from the profile at submission (null when not given).
      marks: {
        class10: { type: Number, default: null },
        class12: { type: Number, default: null },
        graduation: { type: Number, default: null },
      },
    },
    preferences: {
      courses: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }], validate: (v: unknown[]) => v.length >= 1 && v.length <= 3 },
      specialization: { type: String, trim: true, maxlength: 120, default: '' },
      locations: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Location' }], default: [] },
      colleges: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'College' }], default: [] },
      institutionTypes: { type: [{ type: String, enum: INSTITUTION_TYPES }], default: [] },
      budgetMinor: { type: Number, min: 0, default: null },
      hostel: { type: Boolean, default: false },
      scholarship: { type: Boolean, default: false },
      admissionYear: { type: Number, min: 2020, max: 2100, required: true },
      intake: { type: String, trim: true, maxlength: 40, default: '' },
      entranceExamNotes: { type: String, trim: true, maxlength: 500, default: '' },
      counsellingRequest: { type: String, trim: true, maxlength: 2000, default: '' },
    },
    // Fee estimates as published when the enquiry was made; never recalculated.
    feeEstimates: { type: [feeEstimateSchema], default: [] },
    documents: { type: [documentSchema], default: [], validate: (v: unknown[]) => v.length <= 20 },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    followUpAt: { type: Date, default: null },
    // Student-facing explanation of the current status.
    studentMessage: { type: String, trim: true, maxlength: 1000, default: '' },
    lastActivityAt: { type: Date, default: () => new Date() },
    idempotencyKey: { type: String, required: true, maxlength: 64 },
    // Lead source tracking.
    source: { type: String, enum: LEAD_SOURCES, default: 'direct' },
    campaign: { type: String, trim: true, maxlength: 60, default: '' },
    // When the student prefers to be called.
    callbackTime: { type: String, enum: CALLBACK_TIMES, default: 'any' },
    // The student's latest request for a call or counselling session (cleared when the team acts on it).
    callbackRequest: {
      type: new mongoose.Schema(
        {
          kind: { type: String, enum: CALLBACK_KINDS, required: true },
          preferredDate: { type: Date, default: null },
          slot: { type: String, enum: CALLBACK_TIMES, default: 'any' },
          mode: { type: String, enum: ['phone', 'video', 'office'], default: 'phone' },
          note: { type: String, trim: true, maxlength: 500, default: '' },
          requestedAt: { type: Date, required: true },
          handledAt: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    // When the team last tried to reach the student (calls, emails, messages).
    lastContactAt: { type: Date, default: null },
  },
  { timestamps: true },
);
enquirySchema.index({ source: 1, createdAt: -1 }, { name: 'enquiry_by_source' });
enquirySchema.index({ 'callbackRequest.handledAt': 1, 'callbackRequest.requestedAt': 1 }, { name: 'enquiry_callback_requests', partialFilterExpression: { 'callbackRequest.requestedAt': { $type: 'date' } } });
enquirySchema.index({ reference: 1 }, { unique: true, name: 'enquiry_reference_unique' });
enquirySchema.index({ student: 1, idempotencyKey: 1 }, { unique: true, name: 'enquiry_idempotency' });
enquirySchema.index({ student: 1, createdAt: -1 }, { name: 'enquiry_by_student' });
enquirySchema.index({ status: 1, createdAt: -1 }, { name: 'enquiry_by_status' });
enquirySchema.index({ assignedTo: 1, status: 1 }, { name: 'enquiry_by_counsellor' });
enquirySchema.index({ assignedTo: 1, followUpAt: 1 }, { name: 'enquiry_counsellor_follow_ups', partialFilterExpression: { followUpAt: { $type: 'date' } } });
enquirySchema.index({ followUpAt: 1 }, { name: 'enquiry_follow_up', partialFilterExpression: { followUpAt: { $type: 'date' } } });
enquirySchema.index({ 'preferences.courses': 1 }, { name: 'enquiry_by_course' });
enquirySchema.index({ 'preferences.colleges': 1 }, { name: 'enquiry_by_college' });
enquirySchema.index({ 'studentSnapshot.state': 1, 'studentSnapshot.city': 1 }, { name: 'enquiry_by_place' });

export type Enquiry = InferSchemaType<typeof enquirySchema>;
export const EnquiryModel = mongoose.model('Enquiry', enquirySchema, 'enquiries');

export const EVENT_TYPES = ['created', 'status_change', 'note', 'contact_attempt', 'assignment', 'follow_up', 'document', 'application', 'appointment', 'message', 'callback_request', 'recommendation'] as const;

// The enquiry's history and conversation: append-only. Students only ever see `visibility: 'student'` events.
const enquiryEventSchema = new mongoose.Schema(
  {
    enquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry', required: true },
    type: { type: String, enum: EVENT_TYPES, required: true },
    visibility: { type: String, enum: ['internal', 'student'], required: true },
    actor: {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      role: { type: String, maxlength: 20, default: 'system' },
      name: { type: String, maxlength: 80, default: 'System' },
    },
    fromStatus: { type: String, enum: [...ENQUIRY_STATUSES, null], default: null },
    toStatus: { type: String, enum: [...ENQUIRY_STATUSES, null], default: null },
    reason: { type: String, maxlength: 1000, default: '' },
    body: { type: String, maxlength: 2000, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
enquiryEventSchema.index({ enquiry: 1, createdAt: 1 }, { name: 'event_by_enquiry' });
enquiryEventSchema.index({ visibility: 1, createdAt: -1 }, { name: 'event_feed' });
const refuse = () => {
  throw new Error('Enquiry history is append-only');
};
enquiryEventSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'], refuse);

export const EnquiryEventModel = mongoose.model('EnquiryEvent', enquiryEventSchema, 'enquiryEvents');
