import mongoose, { type InferSchemaType } from 'mongoose';

export const LOCATION_KINDS = ['region', 'state', 'district', 'city'] as const;

// A place students search by. A city lists its state and any regions (e.g. Delhi NCR, North India) as parents,
// so searching a region finds colleges in every city under it.
const locationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, trim: true, lowercase: true, match: /^[a-z0-9-]{2,80}$/ },
    kind: { type: String, enum: LOCATION_KINDS, required: true },
    parents: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Location' }], default: [] },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 100, min: 0, max: 10_000 },
  },
  { timestamps: true },
);
locationSchema.index({ slug: 1 }, { unique: true, name: 'location_slug_unique' });
locationSchema.index({ kind: 1, sortOrder: 1, name: 1 }, { name: 'location_kind_order' });
locationSchema.index({ parents: 1 }, { name: 'location_parents' });

export type Location = InferSchemaType<typeof locationSchema>;
export const LocationModel = mongoose.model('Location', locationSchema);
