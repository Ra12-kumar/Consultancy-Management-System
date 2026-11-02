import mongoose, { type InferSchemaType } from 'mongoose';

export const COLLEGE_TYPES = ['government', 'private', 'deemed', 'autonomous', 'other'] as const;
export const COLLEGE_STATUSES = ['draft', 'published', 'needs_review', 'archived'] as const;
export const OWNERSHIP = ['government', 'government_aided', 'private', 'other'] as const;
export const CATEGORIES = ['university', 'college', 'standalone'] as const;
// Fields an import may fill. Once an admin edits one of them it is 'locked' and imports never overwrite it.
export const MAX_COLLEGE_IMAGES = 12;
export const IMPORTABLE_FIELDS = ['name', 'type', 'ownership', 'category', 'subtype', 'state', 'district', 'areaType', 'yearEstablished', 'affiliatedUniversity'] as const;

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
    // Uploaded logo (a public college_image file; logoUrl then points at it) and brochure (a public PDF).
    logoFile: { type: mongoose.Schema.Types.ObjectId, ref: 'StoredFile', default: null },
    brochureFile: { type: mongoose.Schema.Types.ObjectId, ref: 'StoredFile', default: null },
    // Official social media pages (https only; the host must match the network).
    social: {
      instagram: { type: String, trim: true, maxlength: 300, default: '' },
      facebook: { type: String, trim: true, maxlength: 300, default: '' },
      youtube: { type: String, trim: true, maxlength: 300, default: '' },
      linkedin: { type: String, trim: true, maxlength: 300, default: '' },
      x: { type: String, trim: true, maxlength: 300, default: '' },
    },
    // Admission-related information for students (dates, documents, counselling rounds).
    admissionInfo: { type: String, trim: true, maxlength: 4000, default: '' },
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
    // Display order of featured colleges (1 = first); null when not featured.
    featuredRank: { type: Number, min: 1, default: null },
    // Photo gallery uploaded by admins (StoredFile ids, served publicly by /api/colleges/images/:fileId), in display order.
    images: {
      type: [new mongoose.Schema({ file: { type: mongoose.Schema.Types.ObjectId, ref: 'StoredFile', required: true }, alt: { type: String, trim: true, maxlength: 160, default: '' } })],
      default: [],
      validate: (v: unknown[]) => v.length <= MAX_COLLEGE_IMAGES,
    },
    // The gallery image shown on cards (an images[]._id).
    primaryImage: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Admission details, entered from verified sources.
    applicationUrl: { type: String, trim: true, maxlength: 300, default: '' },
    eligibility: { type: String, trim: true, maxlength: 2000, default: '' },
    entranceExams: { type: [{ type: String, trim: true, maxlength: 60 }], default: [] },
    facilities: { type: [{ type: String, trim: true, maxlength: 60 }], default: [] },
    highlights: { type: [{ type: String, trim: true, maxlength: 160 }], default: [] },
    academicSession: { type: String, trim: true, maxlength: 20, default: '' },
    admissionDeadline: { type: Date, default: null },
    lastVerifiedAt: { type: Date, default: null },
    verificationSource: { type: String, trim: true, maxlength: 500, default: '' },
    // Fictional demonstration records (database/seeds/seed-catalog.ts); always labelled in the UI.
    isSample: { type: Boolean, default: false },
    // ---- Directory identity (AISHE and other authorised sources) ----
    aisheCode: { type: String, trim: true, uppercase: true, maxlength: 20, default: null },
    category: { type: String, enum: [...CATEGORIES, null], default: null },
    ownership: { type: String, enum: [...OWNERSHIP, null], default: null },
    // The source's own wording, e.g. 'Affiliated College', 'State Private University'.
    subtype: { type: String, trim: true, maxlength: 120, default: '' },
    district: { type: String, trim: true, maxlength: 80, default: '' },
    postalCode: { type: String, trim: true, match: /^(\d{6})?$/, default: '' },
    areaType: { type: String, enum: ['rural', 'urban', null], default: null },
    yearEstablished: { type: Number, min: 1800, max: 2100, default: null },
    affiliatedUniversity: { name: { type: String, trim: true, maxlength: 200, default: '' }, type: { type: String, trim: true, maxlength: 120, default: '' } },
    geo: { lat: { type: Number, min: -90, max: 90, default: null }, lng: { type: Number, min: -180, max: 180, default: null } },
    aliases: { type: [{ type: String, trim: true, maxlength: 200 }], default: [] },
    regulator: { type: String, trim: true, maxlength: 120, default: '' },
    hostelAvailable: { type: Boolean, default: null },
    // 'basic': identity and location only (e.g. from AISHE); 'detailed': courses and fees entered and verified.
    listingLevel: { type: String, enum: ['basic', 'detailed'], default: 'detailed' },
    source: {
      name: { type: String, trim: true, maxlength: 80, default: '' },
      url: { type: String, trim: true, maxlength: 500, default: '' },
      importer: { type: String, maxlength: 60, default: '' },
      firstImportedAt: { type: Date, default: null },
      lastSyncedAt: { type: Date, default: null },
      // When the record last appeared in a full import of its source (missing from newer files = stale).
      lastSeenAt: { type: Date, default: null },
      job: { type: mongoose.Schema.Types.ObjectId, ref: 'CollegeImportJob', default: null },
    },
    // Importable fields an admin has verified or corrected; imports never overwrite these.
    lockedFields: { type: [{ type: String, enum: IMPORTABLE_FIELDS }], default: [] },
    verificationNotes: { type: String, trim: true, maxlength: 2000, default: '' },
    // Lower-case name without punctuation, for search and duplicate detection (kept by a pre-validate hook).
    normalizedName: { type: String, default: '' },
    // Derived (never accepted from requests).
    locationIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Location' }], default: [] },
    courseIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }], default: [] },
    feeSummary: {
      minTotalMinor: { type: Number, default: null },
      maxTotalMinor: { type: Number, default: null },
      minAnnualMinor: { type: Number, default: null },
      maxAnnualMinor: { type: Number, default: null },
      currency: { type: String, default: 'INR' },
    },
  },
  { timestamps: true },
);
collegeSchema.index({ slug: 1 }, { unique: true, name: 'college_slug_unique' });
collegeSchema.index({ status: 1, featured: -1, name: 1 }, { name: 'college_public_listing' });
collegeSchema.index({ featured: 1, featuredRank: 1 }, { name: 'college_featured_order' });
collegeSchema.index({ status: 1, locationIds: 1 }, { name: 'college_by_location' });
collegeSchema.index({ status: 1, courseIds: 1 }, { name: 'college_by_course' });
collegeSchema.index({ status: 1, 'feeSummary.minTotalMinor': 1 }, { name: 'college_by_fee' });
collegeSchema.index({ isSample: 1 }, { name: 'college_sample' });
collegeSchema.index({ aisheCode: 1 }, { unique: true, partialFilterExpression: { aisheCode: { $type: 'string' } }, name: 'college_aishe_unique' });
collegeSchema.index({ status: 1, normalizedName: 1 }, { name: 'college_by_name' });
collegeSchema.index({ status: 1, state: 1, district: 1 }, { name: 'college_by_place' });
collegeSchema.index({ status: 1, ownership: 1, category: 1 }, { name: 'college_by_kind' });
collegeSchema.index({ normalizedName: 1, state: 1 }, { name: 'college_duplicate_check' });
collegeSchema.index({ 'source.importer': 1, 'source.lastSeenAt': 1 }, { name: 'college_source_freshness' });
// Admin college list (newest change first); the directory can hold thousands of imported colleges.
collegeSchema.index({ updatedAt: -1 }, { name: 'college_admin_recent' });

export const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
collegeSchema.pre('validate', function () {
  this.normalizedName = normalizeName(this.name ?? '');
});

export type College = InferSchemaType<typeof collegeSchema>;
export const CollegeModel = mongoose.model('College', collegeSchema);
