import mongoose, { type InferSchemaType } from 'mongoose';

// A college a student saved ("My Selected Colleges"). Always read and written through the session user.
const shortlistSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    college: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true },
    note: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { timestamps: true },
);
shortlistSchema.index({ student: 1, college: 1 }, { unique: true, name: 'shortlist_unique' });
shortlistSchema.index({ college: 1 }, { name: 'shortlist_by_college' });

export type Shortlist = InferSchemaType<typeof shortlistSchema>;
export const ShortlistModel = mongoose.model('Shortlist', shortlistSchema);

// A named comparison of 2-4 colleges a student saved.
const savedComparisonSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    colleges: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'College' }], validate: (v: unknown[]) => v.length >= 2 && v.length <= 4 },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
  },
  { timestamps: true },
);
savedComparisonSchema.index({ student: 1, createdAt: -1 }, { name: 'comparison_by_student' });
savedComparisonSchema.index({ colleges: 1 }, { name: 'comparison_by_college' });

export type SavedComparison = InferSchemaType<typeof savedComparisonSchema>;
export const SavedComparisonModel = mongoose.model('SavedComparison', savedComparisonSchema);
