import mongoose, { type InferSchemaType } from 'mongoose';

export const ROLES = ['student', 'admin'] as const;
export type Role = (typeof ROLES)[number];

// Fine-grained admin permissions (least privilege). Students have none.
export const PERMISSIONS = [
  'students.read',
  'students.write',
  'admins.manage',
  'email.view',
  'audit.read',
  'catalog.manage',
  'pricing.manage',
  'enquiries.manage',
  'admissions.confirm',
  'scholarships.manage',
  'scholarships.approve',
  'reports.export',
  'feedback.manage',
  'privacy.manage',
  'content.manage',
  'payments.manage',
  'settings.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    // Normalised (trimmed, lowercased) before saving; unique.
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    // E.164, e.g. +919876543210 (optional for admins).
    mobile: { type: String, trim: true, match: /^\+[1-9]\d{7,14}$/, default: null },
    // Never returned unless explicitly selected.
    passwordHash: { type: String, select: false, default: null },
    role: { type: String, enum: ROLES, required: true, default: 'student' },
    permissions: { type: [{ type: String, enum: PERMISSIONS }], default: [] },
    emailVerifiedAt: { type: Date, default: null },
    status: { type: String, enum: ['active', 'disabled'], default: 'active', required: true },
    passwordChangedAt: { type: Date, default: null },
    failedLogins: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },
    lastLoginAt: { type: Date, default: null },
    // Profile photo (a StoredFile).
    photoFile: { type: mongoose.Schema.Types.ObjectId, ref: 'StoredFile', default: null },
    // Set when the account was anonymised at the user's request.
    anonymisedAt: { type: Date, default: null },
    // Optional two-step sign-in (TOTP) for admins. Secrets are encrypted; recovery codes are hashed.
    mfa: {
      enabled: { type: Boolean, default: false },
      secret: { type: String, select: false, default: null },
      pendingSecret: { type: String, select: false, default: null },
      recoveryHashes: { type: [String], select: false, default: [] },
      lastStep: { type: Number, select: false, default: 0 },
    },
  },
  { timestamps: true },
);
userSchema.index({ email: 1 }, { unique: true, name: 'user_email_unique' });
userSchema.index({ role: 1, createdAt: -1 }, { name: 'user_role_recent' });

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId };
export const UserModel = mongoose.model('User', userSchema);

// What the API ever returns about a user.
export function toPublicUser(u: { _id: unknown; name: string; email: string; mobile?: string | null; role: string; permissions?: string[]; emailVerifiedAt?: Date | null; status: string; createdAt?: Date; lastLoginAt?: Date | null; photoFile?: unknown; mfa?: { enabled?: boolean } | null }) {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    mobile: u.mobile ?? null,
    role: u.role,
    permissions: u.role === 'admin' ? (u.permissions ?? []) : [],
    emailVerified: Boolean(u.emailVerifiedAt),
    status: u.status,
    createdAt: u.createdAt ?? null,
    lastLoginAt: u.lastLoginAt ?? null,
    // Served only to the owner and permitted admins (see files.service).
    mfaEnabled: u.role === 'admin' ? Boolean(u.mfa?.enabled) : false,
    photoUrl: u.photoFile ? `/api/files/${String(u.photoFile)}` : null,
  };
}
