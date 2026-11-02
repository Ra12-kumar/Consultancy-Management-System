import mongoose from 'mongoose';
import { PERMISSIONS } from './User.js';

// Single-use invitation codes for staff sign-up (Admin or Counsellor). Only a keyed hash of the code is stored;
// the plain code is shown once to the admin (or printed once by the CLI) who created it.
export const INVITE_ROLES = ['admin', 'counsellor'] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

const inviteCodeSchema = new mongoose.Schema(
  {
    codeHash: { type: String, required: true, select: false },
    // Last 4 characters, so admins can tell their codes apart in the list.
    hint: { type: String, required: true, maxlength: 4 },
    role: { type: String, enum: INVITE_ROLES, required: true },
    // Admin codes only: the permissions the new admin gets (never more than the creator holds).
    permissions: { type: [{ type: String, enum: PERMISSIONS }], default: [] },
    // Optional: the code works only for this email address.
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: null },
    note: { type: String, trim: true, maxlength: 200, default: '' },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByLabel: { type: String, trim: true, maxlength: 120, default: '' },
  },
  { timestamps: true },
);
inviteCodeSchema.index({ codeHash: 1 }, { unique: true, name: 'invite_code_unique' });
inviteCodeSchema.index({ createdAt: -1 }, { name: 'invite_recent' });
// Old codes are removed 30 days after they expire.
inviteCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60, name: 'invite_ttl' });

export const InviteCodeModel = mongoose.model('InviteCode', inviteCodeSchema);
