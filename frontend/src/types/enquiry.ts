// Mirrors backend/src/services/enquiryViews.ts. Student views never contain internal notes.

export type EnquiryStatus =
  | "NEW"
  | "CONTACTED"
  | "COUNSELLING_SCHEDULED"
  | "DOCUMENTS_PENDING"
  | "APPLICATION_IN_PROGRESS"
  | "SUBMITTED"
  | "OFFER_RECEIVED"
  | "ADMITTED"
  | "ON_HOLD"
  | "REJECTED"
  | "WITHDRAWN"
  | "CLOSED";

type Named = { id: string; name: string; slug: string };
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
export type StudentEvent = { id: string; type: string; toStatus: EnquiryStatus | null; statusLabel: string | null; body: string; by: string; createdAt: string; reference?: string };
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
  createdAt: string;
  lastActivityAt: string;
  timeline: AdminEvent[];
  applications: AdminApplication[];
  appointments: AdminAppointment[];
};
export type AdminEnquiryRow = { id: string; reference: string; status: EnquiryStatus; studentName: string; studentEmail: string; place: string; courses: string[]; assignedTo: string | null; followUpAt: string | null; followUpDue: boolean; createdAt: string; lastActivityAt: string };
export type Counsellor = { id: string; name: string; email: string };
