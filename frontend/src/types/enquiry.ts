// Mirrors backend/src/services/enquiryViews.ts. Student views never contain internal notes.

export type EnquiryStatus =
  | "NEW"
  | "CONTACT_PENDING"
  | "CONTACTED"
  | "INTERESTED"
  | "ELIGIBILITY_CHECK"
  | "COUNSELLING_SCHEDULED"
  | "COUNSELLING_COMPLETED"
  | "DOCUMENTS_PENDING"
  | "APPLICATION_IN_PROGRESS"
  | "SUBMITTED"
  | "OFFER_RECEIVED"
  | "ADMITTED"
  | "ON_HOLD"
  | "NOT_INTERESTED"
  | "REJECTED"
  | "WITHDRAWN"
  | "CLOSED";

type Named = { id: string; name: string; slug: string };
export type LeadSource = "college_search" | "live_search" | "featured_college" | "top_colleges" | "college_page" | "compare" | "shortlist" | "recommended" | "home" | "campaign" | "direct";
export type CallbackTime = "any" | "morning" | "afternoon" | "evening";
export type CallbackRequest = { kind: "callback" | "counselling"; preferredDate: string | null; slot: CallbackTime; mode: "phone" | "video" | "office"; note: string; requestedAt: string; handledAt: string | null };
export type FeeEstimate = {
  college: string;
  collegeName: string;
  course: string;
  courseName: string;
  version: number;
  academicYear: string;
  intake: string;
  officialTotalMinor: number;
  consultancyServiceChargeMinor: number;
  estimatedTotalMinor: number;
  isSample: boolean;
};
export type EnquiryDocument = { id: string; name: string; status: "requested" | "received" | "waived"; note: string; requestedAt: string; receivedAt: string | null; files: Array<{ id: string; url: string }> };
export type Preferences = {
  courses: Named[];
  colleges: Named[];
  locations: Named[];
  specialization: string;
  institutionTypes: string[];
  budgetMinor: number | null;
  hostel: boolean;
  scholarship: boolean;
  admissionYear: number;
  intake: string;
  entranceExamNotes: string;
  counsellingRequest: string;
};
export type Eligibility = "eligible" | "potentially_eligible" | "not_eligible";
// A course checked against the student's marks (eligibility is a guide, never a promise of admission).
export type EligibilityRow = { offeringId: string; courseName: string; courseSlug: string; specialization: string; collegeName: string; collegeSlug: string; place: string; eligibility: Eligibility; reasons: string[] };
export type StudentEvent = { id: string; type: string; toStatus: EnquiryStatus | null; statusLabel: string | null; body: string; by: string; createdAt: string; reference?: string; recommendations?: EligibilityRow[] };
export type StudentApplication = { reference: string; collegeName: string; courseName: string; applicationNumber: string; status: string; submittedAt: string | null; decisionAt: string | null; admissionConfirmed: boolean; enquiryReference?: string | null };
export type AppointmentStatus = "scheduled" | "confirmed" | "reschedule_requested" | "cancelled" | "completed" | "no_show";
export type StudentAppointment = { id: string; enquiryReference: string | null; startsAt: string; durationMinutes: number; mode: "phone" | "video" | "office"; meetingDetails: string; agenda: string; status: AppointmentStatus; studentNote: string; counsellor: string };

export type EnquirySummary = { reference: string; status: EnquiryStatus; statusLabel: string; courses: Named[]; colleges: Named[]; createdAt: string; lastActivityAt: string };
export type StudentEnquiry = {
  reference: string;
  status: EnquiryStatus;
  statusLabel: string;
  studentMessage: string;
  counsellor: string | null;
  callbackTime: CallbackTime;
  callbackRequest: CallbackRequest | null;
  createdAt: string;
  lastActivityAt: string;
  preferences: Preferences;
  feeEstimates: FeeEstimate[];
  documents: EnquiryDocument[];
  timeline: StudentEvent[];
  applications: StudentApplication[];
  appointments: StudentAppointment[];
  duplicate?: boolean;
};

// Admin
export type AdminEvent = { id: string; type: string; visibility: "internal" | "student"; actor: string; actorRole: string; fromStatus: EnquiryStatus | null; toStatus: EnquiryStatus | null; reason: string; body: string; meta: Record<string, unknown> | null; createdAt: string };
export type AdminApplication = Omit<StudentApplication, "admissionConfirmed"> & {
  id: string;
  enquiry: string;
  college: string;
  course: string;
  evidence: { type: string; reference: string; verifiedBy: string | null; verifiedAt: string | null } | null;
  internalNote: string;
  updatedAt: string;
  studentName?: string | null;
};
export type AdminAppointment = StudentAppointment & { enquiry: string; counsellorId: string; outcomeNote: string; reminderSentAt: string | null; studentName?: string | null };
export type AdminEnquiry = {
  id: string;
  reference: string;
  status: EnquiryStatus;
  statusLabel: string;
  allowedTransitions: EnquiryStatus[];
  student: { id: string; name: string; email: string; mobile: string | null; city: string; state: string; qualification: string | null; percentage: number | null; passingYear: number | null; entranceExams: Array<{ name: string; score: string; year: number | null }> };
  preferences: Preferences;
  feeEstimates: FeeEstimate[];
  documents: EnquiryDocument[];
  assignedTo: { id: string; name: string; email: string } | null;
  followUpAt: string | null;
  studentMessage: string;
  source: LeadSource;
  campaign: string;
  callbackTime: CallbackTime;
  callbackRequest: CallbackRequest | null;
  lastContactAt: string | null;
  createdAt: string;
  lastActivityAt: string;
  timeline: AdminEvent[];
  applications: AdminApplication[];
  appointments: AdminAppointment[];
};
export type AdminEnquiryRow = {
  id: string;
  reference: string;
  status: EnquiryStatus;
  studentName: string;
  studentEmail: string;
  studentMobile: string | null;
  place: string;
  courses: string[];
  colleges: string[];
  assignedTo: string | null;
  source: LeadSource;
  callbackTime: CallbackTime;
  callbackRequested: boolean;
  lastContactAt: string | null;
  followUpAt: string | null;
  followUpDue: boolean;
  createdAt: string;
  lastActivityAt: string;
};
export type Counsellor = { id: string; name: string; email: string; role?: "admin" | "counsellor" };
// What a counsellor sees for an assigned enquiry: the admin view plus current marks and eligibility.
export type StudentAcademics = { highestQualification: string | null; percentage: number | null; marks: { class10: number | null; class12: number | null; graduation: number | null }; entranceExams: string[]; stream: string; graduationDegree: string; exams: Array<{ name: string; score: string; year: number | null }> };
export type CounsellorEnquiry = AdminEnquiry & { academics: StudentAcademics; eligibility: EligibilityRow[] };
export type CounsellorStats = { assigned: number; contacted: number; pending: number; converted: number; closed: number; overdue: number; conversionRate: number };
