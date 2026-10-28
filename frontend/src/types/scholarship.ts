// Mirrors backend/src/services/scholarship.service.ts.
type Named = { id: string; name: string; slug: string };
export type Benefit = { type: "tuition_percent" | "fixed_amount" | "service_charge_percent" | "other"; value: number | null; maxMinor: number | null; description: string };
export type Scholarship = {
  id: string;
  name: string;
  slug: string;
  providerType: "college" | "consultancy" | "government";
  providerName: string;
  college: { name: string; slug: string | null } | null;
  description: string;
  benefit: Benefit;
  eligibility: { courses: Named[]; minPercentage: number | null; maxFamilyIncomeMinor: number | null; states: Named[]; categories: string[]; genders: string[]; notes: string };
  documentsRequired: string[];
  academicYear: string;
  applicationDeadline: string | null;
  open: boolean;
  officialUrl: string | null;
  sourceRef: string;
  lastVerifiedAt: string | null;
  isSample: boolean;
};
export type EligibilityResult = "likely_eligible" | "not_eligible" | "needs_review";
export type Reason = { rule: string; ok: boolean | null; message: string };
export type EligibilityReport = { preliminary: true; facts: { percentage: number | null; state: string | null; courses: string[] }; results: Array<{ scholarship: Scholarship; result: EligibilityResult; reasons: Reason[] }> };
export type ScholarshipApplication = {
  reference: string;
  scholarshipName: string;
  scholarship: string;
  status: "submitted" | "under_review" | "documents_pending" | "approved" | "rejected" | "withdrawn";
  statusLabel: string;
  preliminary: { result: EligibilityResult; reasons: Reason[] };
  declared: { familyIncomeMinor: number | null; category: string | null; gender: string | null };
  statement: string;
  decision: { awardMinor: number | null; note: string; at: string | null } | null;
  history: Array<{ status: string; statusLabel: string; note: string; at: string }>;
  createdAt: string;
};
export type AdminScholarship = Omit<Scholarship, "eligibility" | "college" | "open"> & {
  college: string | null;
  eligibility: { courses: string[]; minPercentage: number | null; maxFamilyIncomeMinor: number | null; states: string[]; categories: string[]; genders: string[]; notes: string };
  status: "draft" | "published" | "archived";
  applications?: number;
  updatedAt: string;
};
export type AdminScholarshipApplication = ScholarshipApplication & { id: string; student: { id: string; name: string; email: string; percentage: number | null; state: string }; enquiry: string | null; internalNote: string; decisionBy: string | null };
