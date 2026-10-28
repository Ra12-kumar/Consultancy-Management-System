import mongoose, { type InferSchemaType } from 'mongoose';

export const PROVIDER_TYPES = ['college', 'consultancy', 'government'] as const;
export const BENEFIT_TYPES = ['tuition_percent', 'fixed_amount', 'service_charge_percent', 'other'] as const;
export const CATEGORIES = ['general', 'obc', 'sc', 'st', 'ews'] as const;
export const GENDERS = ['female', 'male', 'other'] as const;
export const SCHOLARSHIP_STATUSES = ['draft', 'published', 'archived'] as const;

// A scholarship students can check and apply for. Eligibility rules drive a *preliminary* check only; awards are
// decided by an admin with scholarships.approve.
const scholarshipSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, trim: true, lowercase: true, match: /^[a-z0-9-]{2,80}$/ },
    providerType: { type: String, enum: PROVIDER_TYPES, required: true },
    providerName: { type: String, trim: true, maxlength: 160, default: '' },
    // For college scholarships.
    college: { type: mongoose.Schema.Types.ObjectId, ref: 'College', default: null },
    description: { type: String, trim: true, maxlength: 4000, default: '' },
    benefit: {
      type: { type: String, enum: BENEFIT_TYPES, required: true },
      // Percent (0-100) or paise for fixed_amount.
      value: { type: Number, min: 0, default: null },
      maxMinor: { type: Number, min: 0, default: null },
      description: { type: String, trim: true, maxlength: 300, default: '' },
    },
    // Empty lists and nulls mean "no restriction".
    eligibility: {
      courses: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }], default: [] },
      minPercentage: { type: Number, min: 0, max: 100, default: null },
      maxFamilyIncomeMinor: { type: Number, min: 0, default: null },
      states: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Location' }], default: [] },
      categories: { type: [{ type: String, enum: CATEGORIES }], default: [] },
      genders: { type: [{ type: String, enum: GENDERS }], default: [] },
      notes: { type: String, trim: true, maxlength: 1000, default: '' },
    },
    documentsRequired: { type: [{ type: String, trim: true, maxlength: 120 }], default: [] },
    academicYear: { type: String, trim: true, match: /^(\d{4}-\d{2})?$/, default: '' },
    applicationDeadline: { type: Date, default: null },
    // Required for government schemes: the official page where students also apply.
    officialUrl: { type: String, trim: true, maxlength: 500, default: '' },
    sourceRef: { type: String, trim: true, maxlength: 500, default: '' },
    lastVerifiedAt: { type: Date, default: null },
    status: { type: String, enum: SCHOLARSHIP_STATUSES, default: 'draft', required: true },
    isSample: { type: Boolean, default: false },
  },
  { timestamps: true },
);
scholarshipSchema.index({ slug: 1 }, { unique: true, name: 'scholarship_slug_unique' });
scholarshipSchema.index({ status: 1, applicationDeadline: 1 }, { name: 'scholarship_listing' });
scholarshipSchema.index({ status: 1, college: 1 }, { name: 'scholarship_by_college' });
scholarshipSchema.index({ status: 1, 'eligibility.courses': 1 }, { name: 'scholarship_by_course' });
scholarshipSchema.index({ isSample: 1 }, { name: 'scholarship_sample' });

export type Scholarship = InferSchemaType<typeof scholarshipSchema>;
export const ScholarshipModel = mongoose.model('Scholarship', scholarshipSchema, 'scholarships');

export const SCHOLARSHIP_APP_STATUSES = ['submitted', 'under_review', 'documents_pending', 'approved', 'rejected', 'withdrawn'] as const;
export const FINISHED_SCHOLARSHIP_APPS = ['approved', 'rejected', 'withdrawn'];

const historySchema = new mongoose.Schema(
  {
    from: { type: String, default: null },
    to: { type: String, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    byName: { type: String, default: '' },
    // Shown to the student.
    note: { type: String, maxlength: 1000, default: '' },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

// A student's application. Declared facts and the preliminary check are stored as given at submission time.
const scholarshipApplicationSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, match: /^SCH-\d{4}-\d{6}$/ },
    scholarship: { type: mongoose.Schema.Types.ObjectId, ref: 'Scholarship', required: true },
    scholarshipName: { type: String, required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    enquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry', default: null },
    studentSnapshot: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      percentage: { type: Number, default: null },
      state: { type: String, default: '' },
    },
    // Declared by the student for this application (not stored on the profile).
    declared: {
      familyIncomeMinor: { type: Number, min: 0, default: null },
      category: { type: String, enum: [...CATEGORIES, null], default: null },
      gender: { type: String, enum: [...GENDERS, null], default: null },
      course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
    },
    statement: { type: String, trim: true, maxlength: 2000, default: '' },
    preliminary: {
      result: { type: String, enum: ['likely_eligible', 'not_eligible', 'needs_review'], required: true },
      reasons: { type: [{ _id: false, rule: String, ok: { type: Boolean, default: null }, message: String }], default: [] },
    },
    status: { type: String, enum: SCHOLARSHIP_APP_STATUSES, default: 'submitted', required: true },
    // Student-visible outcome message; award in paise when approved with an amount.
    decision: {
      awardMinor: { type: Number, min: 0, default: null },
      note: { type: String, maxlength: 1000, default: '' },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      at: { type: Date, default: null },
    },
    internalNote: { type: String, trim: true, maxlength: 2000, default: '' },
    history: { type: [historySchema], default: [], validate: (v: unknown[]) => v.length <= 50 },
  },
  { timestamps: true },
);
scholarshipApplicationSchema.index({ reference: 1 }, { unique: true, name: 'scholarship_app_reference_unique' });
// One active application per student and scholarship.
scholarshipApplicationSchema.index(
  { student: 1, scholarship: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['submitted', 'under_review', 'documents_pending', 'approved'] } }, name: 'scholarship_app_one_active' },
);
scholarshipApplicationSchema.index({ status: 1, createdAt: -1 }, { name: 'scholarship_app_by_status' });
scholarshipApplicationSchema.index({ scholarship: 1, status: 1 }, { name: 'scholarship_app_by_scholarship' });

export type ScholarshipApplication = InferSchemaType<typeof scholarshipApplicationSchema>;
export const ScholarshipApplicationModel = mongoose.model('ScholarshipApplication', scholarshipApplicationSchema, 'scholarshipApplications');
