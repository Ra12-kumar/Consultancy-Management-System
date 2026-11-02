// Mirrors the backend catalogue responses (backend/src/services/{catalog,collegeSearch,fee,shortlist}.service.ts).
// Money is always integer paise ("Minor"); totals are computed by the server.

export type CourseRef = { id: string; name: string; slug: string; level: string };
export type Course = CourseRef & { category: string; typicalDurationMonths: number | null; isActive: boolean; sortOrder: number };
export type LocationKind = "region" | "state" | "district" | "city";
export type Location = { id: string; name: string; slug: string; kind: LocationKind; parents: string[]; isActive: boolean; sortOrder: number };

export type CollegeCard = {
  id: string;
  name: string;
  slug: string;
  type: string;
  city: string;
  state: string;
  logoUrl: string | null;
  featured: boolean;
  isSample: boolean;
  lastVerifiedAt: string | null;
  accreditations: Array<{ body: string; grade: string }>;
  courses: CourseRef[];
  feeFromMinor: number | null;
  feeToMinor: number | null;
  // Directory fields (absent on older saved records).
  ownership?: Ownership | null;
  category?: InstitutionCategory | null;
  subtype?: string;
  aisheCode?: string | null;
  district?: string;
  website?: string | null;
  // A photo of this college added by an admin (https), or null: the card then shows a neutral placeholder.
  coverUrl?: string | null;
  // The primary photo from the admin gallery (our own /api/colleges/images/… URL), else the cover photo.
  imageUrl?: string | null;
  featuredRank?: number | null;
  academicSession?: string;
  admissionDeadline?: string | null;
  applicationUrl?: string | null;
  listingLevel?: "basic" | "detailed";
  source?: { name: string; lastSyncedAt: string | null } | null;
  stale?: boolean;
  approvals?: string[];
  annualFeeFromMinor?: number | null;
  // The fee for the searched course and basis: verified, not verified (none published) or not comparable on this basis.
  fee?: CardFee | null;
};
export type Ownership = "government" | "government_aided" | "private" | "other";
export type InstitutionCategory = "university" | "college" | "standalone";
export type FeeBasis = "annual" | "total";
export type CardFee = { basis: FeeBasis; amountMinor: number | null; status: "verified" | "not_verified" | "not_comparable"; academicYear: string | null; lastVerifiedAt: string | null };

export type DirectoryCoverage = {
  total: number;
  byCategory: Record<string, number>;
  sources: Array<{ name: string; records: number; lastSyncedAt: string | null }>;
  statesCovered: number;
  statesTotal: number;
  withVerifiedFees: number;
  lastImportAt: string | null;
  partial: boolean;
};
export type DirectoryFilters = {
  states: Array<{ name: string; slug: string; count: number }>;
  ownership: Record<string, number>;
  categories: Record<string, number>;
  approvals: string[];
  coverage: DirectoryCoverage;
  externalSearch?: ExternalSearchStatus;
};
export type District = { name: string; slug: string; count: number };
export type DirectoryMeta = { page: number; limit: number; total: number; totalPages: number; hasSamples: boolean; feeBasis?: FeeBasis; coverage?: DirectoryCoverage };

export type FeeFrequency = "one_time" | "per_year" | "per_semester" | "total_course";
export type FeeKey = "tuition" | "registration" | "admission" | "examination" | "laboratory" | "other_mandatory" | "hostel" | "transport";
export type FeeLine = { key: FeeKey; label: string; group: "official" | "optional"; frequency: FeeFrequency; amountMinor: number; occurrences: number; courseTotalMinor: number };
export type FeeBreakdown = {
  currency: "INR";
  durationMonths: number;
  lines: FeeLine[];
  officialTotalMinor: number;
  discountMinor: number;
  discountNote: string;
  officialAfterDiscountMinor: number;
  optionalTotalMinor: number;
  consultancyServiceChargeMinor: number;
  estimatedTotalMinor: number;
};
export type PublicFee = {
  id: string;
  academicYear: string;
  intake: string;
  version: number;
  paymentSchedule: string;
  notes: string;
  effectiveFrom: string | null;
  lastVerifiedAt: string | null;
  sourceRef: string;
  publishedAt: string | null;
  // Null when the fee has no yearly or per-semester component (not comparable per year).
  annualOfficialMinor?: number | null;
  hostelAnnualMinor?: number | null;
  breakdown: FeeBreakdown;
};
export type PublicOffering = {
  id: string;
  college: string;
  course: CourseRef | null;
  specialization: string;
  durationMonths: number;
  seats: number | null;
  eligibilityText: string;
  minPercentage: number | null;
  entranceExams: string[];
  applicationDeadline: string | null;
  admissionProcess: string;
  fees: PublicFee[];
  description?: string;
  mode?: CourseMode;
  minQualification?: string | null;
  imageUrl?: string | null;
  brochureUrl?: string | null;
};
export type CourseMode = "offline" | "online" | "hybrid";
export type SocialLinks = { instagram: string; facebook: string; youtube: string; linkedin: string; x: string };
export type Accreditation = { body: string; grade: string; validUntil: string | null; sourceUrl: string };
export type GalleryImage = { id: string; url: string; alt: string; primary: boolean };
export type FeaturedCollege = { id: string; name: string; slug: string; status: string; city: string; state: string; rank: number | null; imageUrl: string | null };
export type CollegeDetail = Omit<CollegeCard, "accreditations"> & {
  address: string;
  website: string | null;
  coverUrl: string | null;
  about: string;
  accreditations: Accreditation[];
  approvals: string[];
  admissionProcess: string;
  campusInfo: string;
  placementInfo: string;
  contact: { phone: string; email: string };
  verificationSource: string;
  offerings: PublicOffering[];
  gallery?: GalleryImage[];
  eligibility?: string;
  entranceExams?: string[];
  facilities?: string[];
  highlights?: string[];
  source?: { name: string; url: string | null; lastSyncedAt: string | null; lastSeenAt: string | null } | null;
  yearEstablished?: number | null;
  areaType?: string;
  postalCode?: string;
  affiliatedUniversity?: { name: string; type: string } | null;
  social?: Partial<SocialLinks>;
  admissionInfo?: string;
  brochureUrl?: string | null;
};
export type CompareResult = {
  course: CourseRef | null;
  missing: string[];
  colleges: Array<CollegeCard & { approvals: string[]; offerings: PublicOffering[]; offering: PublicOffering | null }>;
};

export type SavedCollege = (CollegeCard & { available: true }) | { id: string; name: string; available: false };
export type ShortlistItem = { collegeId: string; note: string; addedAt: string; college: SavedCollege };
export type SavedComparison = { id: string; name: string; createdAt: string; course: { id: string; name: string; slug: string } | null; colleges: SavedCollege[] };

// Admin shapes
export type AdminOffering = Omit<PublicOffering, "course" | "fees"> & { course: string; status: "active" | "inactive" };
export type AdminCollege = {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: "draft" | "published" | "archived" | "needs_review";
  location: string | null;
  aisheCode: string | null;
  ownership: Ownership | null;
  category: InstitutionCategory | null;
  subtype: string;
  district: string;
  postalCode: string;
  yearEstablished: number | null;
  affiliatedUniversity: { name: string; type: string };
  aliases: string[];
  hostelAvailable: boolean | null;
  listingLevel?: "basic" | "detailed";
  source?: { name?: string; url?: string; importer?: string; lastSyncedAt?: string | null; lastSeenAt?: string | null } | null;
  lockedFields?: string[];
  city: string;
  state: string;
  address: string;
  website: string;
  logoUrl: string;
  coverUrl: string;
  about: string;
  accreditations: Accreditation[];
  approvals: string[];
  admissionProcess: string;
  campusInfo: string;
  placementInfo: string;
  placementVerified: boolean;
  contact: { phone: string; email: string };
  featured: boolean;
  lastVerifiedAt: string | null;
  verificationSource: string;
  isSample: boolean;
  images?: GalleryImage[];
  applicationUrl?: string;
  eligibility?: string;
  entranceExams?: string[];
  facilities?: string[];
  highlights?: string[];
  academicSession?: string;
  admissionDeadline?: string | null;
  feeSummary?: { minTotalMinor: number | null; maxTotalMinor: number | null };
  updatedAt?: string;
  offerings?: AdminOffering[];
  social?: Partial<SocialLinks>;
  admissionInfo?: string;
  logoFile?: string | null;
  brochureUrl?: string | null;
};
// One course at one college, as listed by the course browser.
export type BrowseOffering = {
  id: string;
  course: { name: string; slug: string; level: string; category: string };
  college: { name: string; slug: string; city: string; state: string; logoUrl: string | null; isSample: boolean };
  specialization: string;
  description: string;
  durationMonths: number;
  mode: CourseMode;
  seats: number | null;
  minQualification: string | null;
  minPercentage: number | null;
  entranceExams: string[];
  eligibilityText: string;
  applicationDeadline: string | null;
  imageUrl: string | null;
  brochureUrl: string | null;
  fee: { academicYear: string; yearlyMinor: number | null; totalMinor: number } | null;
};
export type FeeComponentInput = { key: FeeKey; amountMinor: number; frequency: FeeFrequency };
export type FeeDiscountInput = { type: "percent"; value: number; maxMinor: number | null; note: string } | { type: "fixed"; value: number; maxMinor: null; note: string } | null;
export type AdminFee = {
  id: string;
  offering: string;
  academicYear: string;
  intake: string;
  components: FeeComponentInput[];
  consultancyServiceChargeMinor: number;
  discount: FeeDiscountInput;
  paymentSchedule: string;
  notes: string;
  effectiveFrom: string | null;
  lastVerifiedAt: string | null;
  sourceRef: string;
  status: "draft" | "published" | "superseded" | "archived";
  version: number;
  publishedAt: string | null;
  updatedAt: string | null;
  breakdown: FeeBreakdown;
};

// Third-party name search (CollegeDB), proxied by our backend. Never fee, course or approval data.
export type ExternalCollege = {
  id: string;
  name: string;
  city: string;
  state: string;
  // The matching published college in our own directory, if any (fees come only from there).
  local: { slug: string; listingLevel: string; isSample: boolean; hasVerifiedFees: boolean; website?: string | null } | null;
  // The official website: verified by us, or from Wikidata (exact name match); null when unknown.
  website?: { url: string; source: "our directory" | "wikidata"; reference: string | null } | null;
};
export type ExternalSearch = { query: string; results: ExternalCollege[]; source: { name: string; url: string; fetchedAt: string; cached: boolean }; quotaRemaining: number | null };
export type ExternalSearchStatus = { configured: boolean; quotaExhausted: boolean; quotaRemaining: number | null };
export type ExternalCollegeDetail = ExternalCollege & { aliases: string[]; type: string; typeLabel: string; providerUpdatedAt: string | null; source: { name: string; url: string; fetchedAt: string; cached: boolean } };
