import mongoose from 'mongoose';

export const TOKEN_TYPES = ['verify_email', 'reset_password', 'set_password', 'mfa_challenge'] as const;
export type TokenType = (typeof TOKEN_TYPES)[number];

// Single-use, expiring tokens sent by email. Only the hash is stored.
const authTokenSchema = new mongoose.Schema(
  {
    type: { type: String, enum: TOKEN_TYPES, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
authTokenSchema.index({ tokenHash: 1 }, { unique: true, name: 'auth_token_unique' });
authTokenSchema.index({ user: 1, type: 1 }, { name: 'auth_token_user_type' });
// Cleaned up a day after expiry.
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86_400, name: 'auth_token_ttl' });

export const AuthTokenModel = mongoose.model('AuthToken', authTokenSchema);
