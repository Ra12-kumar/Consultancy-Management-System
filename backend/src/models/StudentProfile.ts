import mongoose from 'mongoose';

export const CONTACT_METHODS = ['email', 'phone', 'whatsapp'] as const;
export const SCORE_TYPES = ['percentage', 'cgpa', 'marks'] as const;
export const QUALIFICATIONS = ['class_10', 'class_12', 'diploma', 'undergraduate', 'postgraduate', 'other'] as const;

const examSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    score: { type: String, trim: true, maxlength: 30, default: '' },
    year: { type: Number, min: 1990, max: 2100, default: null },
  },
  { _id: false },
);

// A student's personal and academic details (one per student account).
const studentProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    personal: {
      city: { type: String, trim: true, maxlength: 80, default: '' },
      state: { type: String, trim: true, maxlength: 80, default: '' },
      guardianName: { type: String, trim: true, maxlength: 80, default: '' },
      guardianPhone: { type: String, trim: true, match: /^(\+[1-9]\d{7,14})?$/, default: '' },
      preferredContact: { type: String, enum: CONTACT_METHODS, default: 'email' },
    },
    academic: {
      highestQualification: { type: String, enum: [...QUALIFICATIONS, null], default: null },
      course: { type: String, trim: true, maxlength: 120, default: '' },
      institution: { type: String, trim: true, maxlength: 160, default: '' },
      boardOrUniversity: { type: String, trim: true, maxlength: 160, default: '' },
      passingYear: { type: Number, min: 1990, max: 2100, default: null },
      score: {
        type: { type: String, enum: [...SCORE_TYPES, null], default: null },
        value: { type: Number, min: 0, default: null },
        max: { type: Number, min: 0, default: null },
      },
      // Derived on the server from `score` (never accepted from the client).
      percentage: { type: Number, min: 0, max: 100, default: null },
      entranceExams: { type: [examSchema], default: [] },
    },
    // Marks by stage (percentages), used for eligibility checks. All optional.
    marks: {
      class10: { percentage: { type: Number, min: 0, max: 100, default: null }, board: { type: String, trim: true, maxlength: 120, default: '' }, year: { type: Number, min: 1990, max: 2100, default: null } },
      class12: { percentage: { type: Number, min: 0, max: 100, default: null }, board: { type: String, trim: true, maxlength: 120, default: '' }, year: { type: Number, min: 1990, max: 2100, default: null }, stream: { type: String, trim: true, maxlength: 60, default: '' } },
      graduation: { percentage: { type: Number, min: 0, max: 100, default: null }, degree: { type: String, trim: true, maxlength: 120, default: '' }, year: { type: Number, min: 1990, max: 2100, default: null } },
    },
    // What the student would like to study and where (used for college suggestions).
    preferences: {
      course: { type: String, trim: true, maxlength: 120, default: '' },
      location: { type: String, trim: true, maxlength: 120, default: '' },
    },
  },
  { timestamps: true },
);
studentProfileSchema.index({ user: 1 }, { unique: true, name: 'profile_user_unique' });
studentProfileSchema.index({ 'personal.state': 1, 'personal.city': 1 }, { name: 'profile_location' });

export const StudentProfileModel = mongoose.model('StudentProfile', studentProfileSchema);
