import mongoose from 'mongoose';

export const OTP_PURPOSES = ['verify_email'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

// One-time codes sent by email. One live code per user and purpose; only a keyed hash of the code is stored.
const emailOtpSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: OTP_PURPOSES, required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    // Wrong guesses against the current code (the code is cancelled at the limit).
    attempts: { type: Number, default: 0 },
    usedAt: { type: Date, default: null },
    lastSentAt: { type: Date, required: true },
    // Codes sent in the current hour window (resend limit).
    sendWindowStart: { type: Date, required: true },
    sendsInWindow: { type: Number, default: 1 },
  },
  { timestamps: true },
);
emailOtpSchema.index({ user: 1, purpose: 1 }, { unique: true, name: 'otp_user_purpose_unique' });
// Removed a day after its last use or expiry.
emailOtpSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 86_400, name: 'otp_ttl' });

export const EmailOtpModel = mongoose.model('EmailOtp', emailOtpSchema, 'emailOtps');
