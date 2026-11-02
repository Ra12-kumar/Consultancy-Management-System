// Response shapes shared by every endpoint.
export type ApiSuccess<T> = { success: true; data: T; meta?: Record<string, unknown> };
export type ApiFailure = { success: false; error: { code: string; message: string; details?: Array<{ field: string; message: string }> } };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const ROLES = ['admin', 'student', 'counsellor'] as const;
export type Role = (typeof ROLES)[number];
