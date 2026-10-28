import mongoose, { type InferSchemaType } from 'mongoose';

export const COLLEGE_TYPES = ['government', 'private', 'deemed', 'autonomous', 'other'] as const;
export const COLLEGE_STATUSES = ['draft', 'published', 'archived'] as const;

const accreditationSchema = new mongoose.Schema(
  {
    body: { type: String, required: true, trim: true, maxlength: 60 },
    grade: { type: String, trim: true, maxlength: 20, default: '' },
    validUntil: { type: Date, default: null },
    sourceUrl: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { _id: false },
);

// A college the consultancy works with. Only `published` colleges are public.
// `courseIds`, `locationIds` and `feeSummary` are derived by the server (catalog.service refreshCollegeSummary).
const collegeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, trim: true, lowercase: true, match: /^[a-z0-9-]{2,80}$/ },
    type: { type: String, enum: COLLEGE_TYPES, required: true },
    status: { type: String, enum: COLLEGE_STATUSES, default: 'draft', required: true },
    // The city (a Location). `city` / `state` are display copies kept in step with it.
    location: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null },
    city: { type: String, trim: true, maxlength: 80, default: '' },
    state: { type: String, trim: true, maxlength: 80, default: '' },
    address: { type: String, trim: true, maxlength: 300, default: '' },
    website: { type: String, trim: true, maxlength: 300, default: '' },
    logoUrl: { type: String, trim: true, maxlength: 500, default: '' },
    coverUrl: { type: String, trim: true, maxlength: 500, default: '' },
    about: { type: String, trim: true, maxlength: 4000, default: '' },
    accreditations: { type: [accreditationSchema], default: [] },
    approvals: { type: [{ type: String, trim: true, maxlength: 60 }], default: [] },
    admissionProcess: { type: String, trim: true, maxlength: 4000, default: '' },
    campusInfo: { type: String, trim: true, maxlength: 4000, default: '' },
    // Shown publicly only when the team has verified it.
    placementInfo: { type: String, trim: true, maxlength: 4000, default: '' },
    placementVerified: { type: Boolean, default: false },
    contact: {
      phone: { type: String, trim: true, maxlength: 30, default: '' },
      email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
    },
    featured: { type: Boolean, default: false },
    lastVerifiedAt: { type: Date, default: null },
    verificationSource: { type: String, trim: true, maxlength: 500, default: '' },
    // Fictional demonstration records (database/seeds/seed-catalog.ts); always labelled in the UI.
    isSample: { type: Boolean, default: false },
    // Derived (never accepted from requests).
    locationIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Location' }], default: [] },
    courseIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }], default: [] },
    feeSummary: {
      minTotalMinor: { type: Number, default: null },
      maxTotalMinor: { type: Number, default: null },
      currency: { type: String, default: 'INR' },
    },
  },
  { timestamps: true },
);
collegeSchema.index({ slug: 1 }, { unique: true, name: 'college_slug_unique' });
collegeSchema.index({ status: 1, featured: -1, name: 1 }, { name: 'college_public_listing' });
collegeSchema.index({ status: 1, locationIds: 1 }, { name: 'college_by_location' });
collegeSchema.index({ status: 1, courseIds: 1 }, { name: 'college_by_course' });
collegeSchema.index({ status: 1, 'feeSummary.minTotalMinor': 1 }, { name: 'college_by_fee' });
collegeSchema.index({ isSample: 1 }, { name: 'college_sample' });

export type College = InferSchemaType<typeof collegeSchema>;
export const CollegeModel = mongoose.model('College', collegeSchema);
