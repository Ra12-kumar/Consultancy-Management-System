import mongoose from 'mongoose';

// A signed-in browser. The cookie holds a random token; only its sha256 hash is stored here.
const sessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Sliding expiry (renewed on use) and an absolute limit.
    expiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    userAgent: { type: String, maxlength: 300, default: '' },
    ip: { type: String, maxlength: 60, default: '' },
  },
  { timestamps: true },
);
sessionSchema.index({ tokenHash: 1 }, { unique: true, name: 'session_token_unique' });
sessionSchema.index({ user: 1 }, { name: 'session_user' });
// MongoDB removes expired sessions automatically.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'session_ttl' });

export const SessionModel = mongoose.model('Session', sessionSchema);
