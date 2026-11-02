import mongoose from 'mongoose';

// Callback requests from the public landing page (no account needed). The team is emailed and works them in
// the Enquiries section; nothing here creates an account or an enquiry.
export const LEAD_ROLES = ['student', 'parent'] as const;
export const LEAD_EDUCATION = ['class_10', 'class_12', 'diploma', 'undergraduate', 'postgraduate', 'other'] as const;
export const LEAD_STATUSES = ['new', 'contacted', 'closed'] as const;

const callbackLeadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    // E.164, e.g. +919876543210.
    mobile: { type: String, required: true, trim: true, maxlength: 20 },
    role: { type: String, enum: LEAD_ROLES, required: true },
    education: { type: String, enum: LEAD_EDUCATION, required: true },
    interest: { type: String, trim: true, maxlength: 80, default: '' },
    // When the person agreed to be contacted about this request (required to submit).
    consentAt: { type: Date, required: true },
    source: { type: String, trim: true, maxlength: 40, default: 'landing' },
    status: { type: String, enum: LEAD_STATUSES, default: 'new' },
    // Who calls back (a counsellor, or an admin who handles enquiries), the team's note and when the
    // person was first reached. Shown in the Enquiries section.
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, trim: true, maxlength: 1000, default: '' },
    contactedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
callbackLeadSchema.index({ status: 1, createdAt: -1 }, { name: 'lead_by_status' });
callbackLeadSchema.index({ assignedTo: 1, status: 1, createdAt: -1 }, { name: 'lead_by_assignee' });
callbackLeadSchema.index({ createdAt: -1 }, { name: 'lead_recent' });
callbackLeadSchema.index({ mobile: 1, createdAt: -1 }, { name: 'lead_mobile_recent' });

export const CallbackLeadModel = mongoose.model('CallbackLead', callbackLeadSchema);
