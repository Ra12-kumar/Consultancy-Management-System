import mongoose, { type InferSchemaType } from 'mongoose';

export const FEE_FREQUENCIES = ['one_time', 'per_year', 'per_semester', 'total_course'] as const;
// Official (mandatory) college fees, then optional ones shown separately "if opted".
export const OFFICIAL_FEE_KEYS = ['tuition', 'registration', 'admission', 'examination', 'laboratory', 'other_mandatory'] as const;
export const OPTIONAL_FEE_KEYS = ['hostel', 'transport'] as const;
export const FEE_KEYS = [...OFFICIAL_FEE_KEYS, ...OPTIONAL_FEE_KEYS] as const;
export const FEE_STATUSES = ['draft', 'published', 'superseded', 'archived'] as const;

const componentSchema = new mongoose.Schema(
  {
    key: { type: String, enum: FEE_KEYS, required: true },
    // Integer paise.
    amountMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    frequency: { type: String, enum: FEE_FREQUENCIES, required: true },
  },
  { _id: false },
);

const discountSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['percent', 'fixed'], required: true },
    // percent: 0-100; fixed: paise.
    value: { type: Number, required: true, min: 0 },
    maxMinor: { type: Number, min: 0, default: null },
    note: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { _id: false },
);

// One version of the fees for an offering, academic year and intake. Published versions are never edited:
// a new version is published and the previous one becomes `superseded`, so earlier estimates stay explainable.
const collegeFeeSchema = new mongoose.Schema(
  {
    collegeCourse: { type: mongoose.Schema.Types.ObjectId, ref: 'CollegeCourse', required: true },
    college: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    academicYear: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    intake: { type: String, trim: true, maxlength: 40, default: '' },
    currency: { type: String, enum: ['INR'], default: 'INR' },
    components: { type: [componentSchema], default: [] },
    // The consultancy's own charge: always separate from the college's official fees.
    consultancyServiceChargeMinor: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
    discount: { type: discountSchema, default: null },
    paymentSchedule: { type: String, trim: true, maxlength: 1000, default: '' },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    effectiveFrom: { type: Date, default: null },
    lastVerifiedAt: { type: Date, default: null },
    // Official URL or document reference; required before publishing.
    sourceRef: { type: String, trim: true, maxlength: 500, default: '' },
    status: { type: String, enum: FEE_STATUSES, default: 'draft', required: true },
    version: { type: Number, required: true, min: 1 },
    // Derived by the server (services/feeCalculator.ts) on every save; used for budget search.
    durationMonths: { type: Number, required: true, min: 1, max: 120 },
    officialTotalMinor: { type: Number, required: true, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
collegeFeeSchema.index({ collegeCourse: 1, academicYear: 1, intake: 1 }, { unique: true, partialFilterExpression: { status: 'published' }, name: 'fee_one_published' });
collegeFeeSchema.index({ collegeCourse: 1, academicYear: -1, version: -1 }, { name: 'fee_history' });
collegeFeeSchema.index({ status: 1, course: 1, officialTotalMinor: 1 }, { name: 'fee_budget_search' });
collegeFeeSchema.index({ college: 1, status: 1 }, { name: 'fee_by_college' });

export type CollegeFee = InferSchemaType<typeof collegeFeeSchema>;
export const CollegeFeeModel = mongoose.model('CollegeFee', collegeFeeSchema);
