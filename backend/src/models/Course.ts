import mongoose, { type InferSchemaType } from 'mongoose';

export const COURSE_LEVELS = ['diploma', 'ug', 'pg', 'pg_diploma', 'doctorate'] as const;

// The programme catalogue (B.Tech, MBA, ...), configurable by admins. Colleges offer these through CollegeCourse.
const courseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, trim: true, lowercase: true, match: /^[a-z0-9-]{2,80}$/ },
    level: { type: String, enum: COURSE_LEVELS, required: true },
    category: { type: String, trim: true, maxlength: 60, default: '' },
    typicalDurationMonths: { type: Number, min: 1, max: 120, default: null },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 100, min: 0, max: 10_000 },
  },
  { timestamps: true },
);
courseSchema.index({ slug: 1 }, { unique: true, name: 'course_slug_unique' });
courseSchema.index({ isActive: 1, level: 1, sortOrder: 1 }, { name: 'course_listing' });

export type Course = InferSchemaType<typeof courseSchema>;
export const CourseModel = mongoose.model('Course', courseSchema);
