import mongoose from 'mongoose';

// Append-only record of security-relevant and administrative actions. The application never updates or deletes
// these records (the hooks below refuse it).
const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      role: { type: String, maxlength: 20, default: 'system' },
      label: { type: String, maxlength: 160, required: true },
    },
    action: { type: String, required: true, maxlength: 80 },
    target: {
      type: { type: String, maxlength: 40, default: null },
      id: { type: String, maxlength: 60, default: null },
    },
    ip: { type: String, maxlength: 60, default: '' },
    requestId: { type: String, maxlength: 80, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditLogSchema.index({ createdAt: -1 }, { name: 'audit_recent' });
auditLogSchema.index({ 'actor.user': 1, createdAt: -1 }, { name: 'audit_actor' });
auditLogSchema.index({ action: 1, createdAt: -1 }, { name: 'audit_action' });

const refuse = () => {
  throw new Error('Audit records are append-only');
};
auditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'], refuse);

export const AuditLogModel = mongoose.model('AuditLog', auditLogSchema, 'auditLogs');
