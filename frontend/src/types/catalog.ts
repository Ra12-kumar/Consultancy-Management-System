// Mirrors the backend catalogue responses (backend/src/services/{catalog,collegeSearch,fee,shortlist}.service.ts).
// Money is always integer paise ("Minor"); totals are computed by the server.

export type CourseRef = { id: string; name: string; slug: string; level: string };
export type Course = CourseRef & { category: string; typicalDurationMonths: number | null; isActive: boolean; sortOrder: number };
export type LocationKind = "region" | "state" | "city";
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
};

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
};
export type Accreditation = { body: string; grade: string; validUntil: string | null; sourceUrl: string };
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
  status: "draft" | "published" | "archived";
  location: string | null;
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
  feeSummary?: { minTotalMinor: number | null; maxTotalMinor: number | null };
  updatedAt?: string;
  offerings?: AdminOffering[];
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
