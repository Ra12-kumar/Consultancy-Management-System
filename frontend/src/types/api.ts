// Mirrors the backend's response shapes (backend/src/types/api.ts).
export type ApiSuccess<T> = { success: true; data: T; meta?: Record<string, unknown> };
export type ApiFailure = { success: false; error: { code: string; message: string; details?: Array<{ field: string; message: string }> } };

export type ApiError = { status: number; code: string; message: string; details?: Array<{ field: string; message: string }> };

export type Readiness = { status: "ready" | "unavailable"; database: "connected" | "unavailable"; mail: "smtp" | "log-only" };

export type Role = "student" | "admin" | "counsellor";
export type User = {
  id: string;
  name: string;
  email: string;
  mobile: string | null;
  role: Role;
  permissions: string[];
  emailVerified: boolean;
  status: string;
  createdAt: string | null;
  lastLoginAt: string | null;
  // Private: served by the API to the owner and permitted admins only.
  photoUrl?: string | null;
  // Admins only: two-step sign-in is on.
  mfaEnabled?: boolean;
};

export type PageMeta = { page: number; limit: number; total: number; totalPages: number };

export type Profile = {
  personal: { city: string; state: string; guardianName: string; guardianPhone: string; preferredContact: "email" | "phone" | "whatsapp" };
  academic: {
    highestQualification: string | null;
    course: string;
    institution: string;
    boardOrUniversity: string;
    passingYear: number | null;
    score: { type: "percentage" | "cgpa" | "marks"; value: number; max: number | null } | null;
    entranceExams: Array<{ name: string; score: string; year: number | null }>;
    percentage: number | null;
  };
  // What the student would like to study and where (free text; drives college suggestions).
  preferences?: { course: string; location: string };
  // Percentages by stage, used for eligibility checks.
  marks?: { class10: { percentage: number | null; board: string; year: number | null }; class12: { percentage: number | null; board: string; year: number | null; stream: string }; graduation: { percentage: number | null; degree: string; year: number | null } };
  completion: number;
  updatedAt: string | null;
};
