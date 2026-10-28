import mongoose, { type InferSchemaType } from 'mongoose';

// A course as offered by one college (its specialization, duration, eligibility and deadlines).
const collegeCourseSchema = new mongoose.Schema(
  {
    college: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    specialization: { type: String, trim: true, maxlength: 120, default: '' },
    durationMonths: { type: Number, required: true, min: 1, max: 120 },
    seats: { type: Number, min: 0, max: 100_000, default: null },
    eligibilityText: { type: String, trim: true, maxlength: 1000, default: '' },
    // Minimum qualifying percentage, if the college publishes one.
    minPercentage: { type: Number, min: 0, max: 100, default: null },
    entranceExams: { type: [{ type: String, trim: true, maxlength: 60 }], default: [] },
    applicationDeadline: { type: Date, default: null },
    admissionProcess: { type: String, trim: true, maxlength: 2000, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', required: true },
  },
  { timestamps: true },
);
collegeCourseSchema.index({ college: 1, course: 1, specialization: 1 }, { unique: true, name: 'offering_unique' });
collegeCourseSchema.index({ course: 1, status: 1, minPercentage: 1 }, { name: 'offering_eligibility' });

export type CollegeCourse = InferSchemaType<typeof collegeCourseSchema>;
export const CollegeCourseModel = mongoose.model('CollegeCourse', collegeCourseSchema);
