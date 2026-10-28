import mongoose, { type InferSchemaType } from 'mongoose';

export const APPLICATION_STATUSES = ['planned', 'submitted', 'offer_received', 'admitted', 'rejected', 'withdrawn'] as const;
export const EVIDENCE_TYPES = ['offer_letter', 'fee_receipt', 'college_portal', 'other'] as const;

// A college application made for an enquiry. `admitted` is only set through the confirm-admission step,
// which records the evidence and the admin who verified it.
const applicationSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, match: /^APP-\d{4}-\d{6}$/ },
    enquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    college: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    collegeName: { type: String, required: true },
    courseName: { type: String, required: true },
    // The college's own application number, if any.
    applicationNumber: { type: String, trim: true, maxlength: 60, default: '' },
    status: { type: String, enum: APPLICATION_STATUSES, default: 'planned', required: true },
    submittedAt: { type: Date, default: null },
    decisionAt: { type: Date, default: null },
    evidence: {
      type: { type: String, enum: [...EVIDENCE_TYPES, null], default: null },
      reference: { type: String, trim: true, maxlength: 200, default: '' },
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      verifiedAt: { type: Date, default: null },
    },
    // Never shown to students.
    internalNote: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { timestamps: true },
);
applicationSchema.index({ reference: 1 }, { unique: true, name: 'application_reference_unique' });
applicationSchema.index({ enquiry: 1 }, { name: 'application_by_enquiry' });
applicationSchema.index({ student: 1, createdAt: -1 }, { name: 'application_by_student' });
applicationSchema.index({ status: 1, updatedAt: -1 }, { name: 'application_by_status' });

export type AdmissionApplication = InferSchemaType<typeof applicationSchema>;
export const AdmissionApplicationModel = mongoose.model('AdmissionApplication', applicationSchema, 'admissionApplications');
