import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { AdmissionApplicationModel } from '../models/Admission.js';
import { CollegeModel } from '../models/College.js';
import { CollegeCourseModel } from '../models/CollegeCourse.js';
import { CollegeFeeModel } from '../models/CollegeFee.js';
import { EnquiryModel } from '../models/Enquiry.js';
import { ScholarshipModel } from '../models/Scholarship.js';
import { SavedComparisonModel, ShortlistModel } from '../models/Shortlist.js';
import { StoredFileModel } from '../models/Support.js';
import { ApiError } from '../utils/ApiError.js';
import { actorFrom, audit } from './audit.service.js';
import { imageUrl } from './collegeImages.service.js';
import { invalidateDirectoryCache } from './directory/cache.js';
import { PDF_TYPES, PHOTO_TYPES, deleteStoredFiles, saveUpload } from './files.service.js';

// College logo and brochure, and course pictures and brochures. Pictures are public college_image files
// (served by /api/colleges/images/:id like the gallery); brochures are public PDFs (/api/colleges/brochures/:id).
// Types are decided by the file's content; old files are removed when replaced.

export const brochureUrl = (fileId: unknown) => (fileId ? `/api/colleges/brochures/${String(fileId)}` : null);
export const pictureUrl = (fileId: unknown) => (fileId ? imageUrl(fileId) : null);

type Slot = { model: 'college' | 'offering'; field: 'logoFile' | 'brochureFile' | 'imageFile' };
const SLOTS = {
  'college:logo': { model: 'college', field: 'logoFile' },
  'college:brochure': { model: 'college', field: 'brochureFile' },
  'offering:image': { model: 'offering', field: 'imageFile' },
  'offering:brochure': { model: 'offering', field: 'brochureFile' },
} as const satisfies Record<string, Slot>;
export type MediaSlot = keyof typeof SLOTS;

const modelFor = (slot: Slot) => (slot.model === 'college' ? CollegeModel : CollegeCourseModel) as unknown as mongoose.Model<Record<string, unknown>>;

export async function setMedia(req: Request, slotName: MediaSlot, id: string, file: Express.Multer.File | undefined) {
  const slot = SLOTS[slotName];
  const Model = modelFor(slot);
  const before = await Model.findById(id).lean();
  if (!before) throw ApiError.notFound(slot.model === 'college' ? 'College not found' : 'Course offering not found');
  const pdf = slot.field === 'brochureFile';
  const stored = await saveUpload(file, { owner: req.user!.id, uploadedBy: req.user!.id, kind: pdf ? 'brochure' : 'college_image', allowed: pdf ? PDF_TYPES : PHOTO_TYPES });
  const set: Record<string, unknown> = { [slot.field]: stored._id };
  // An uploaded logo replaces the logo address, so every page that shows logoUrl shows the upload.
  if (slotName === 'college:logo') set.logoUrl = imageUrl(stored._id);
  await Model.updateOne({ _id: id }, { $set: set });
  const old = before[slot.field];
  if (old) await deleteStoredFiles({ _id: old, kind: pdf ? 'brochure' : 'college_image' });
  if (slot.model === 'college') invalidateDirectoryCache();
  await audit(actorFrom(req), `catalog.${slotName.replace(':', '_')}_uploaded`, { type: slot.model, id }, req, { file: String(stored._id), size: stored.size });
  return { url: pdf ? brochureUrl(stored._id) : pictureUrl(stored._id), name: stored.originalName };
}

export async function removeMedia(req: Request, slotName: MediaSlot, id: string) {
  const slot = SLOTS[slotName];
  const Model = modelFor(slot);
  const before = await Model.findById(id).lean();
  if (!before) throw ApiError.notFound(slot.model === 'college' ? 'College not found' : 'Course offering not found');
  const old = before[slot.field];
  if (!old) return { removed: false };
  const unset: Record<string, unknown> = { [slot.field]: null };
  if (slotName === 'college:logo' && before.logoUrl === imageUrl(old)) unset.logoUrl = '';
  await Model.updateOne({ _id: id }, { $set: unset });
  await deleteStoredFiles({ _id: old, kind: slot.field === 'brochureFile' ? 'brochure' : 'college_image' });
  if (slot.model === 'college') invalidateDirectoryCache();
  await audit(actorFrom(req), `catalog.${slotName.replace(':', '_')}_removed`, { type: slot.model, id }, req);
  return { removed: true };
}

// Public, read-only: only files stored as brochures (never student documents).
export async function streamBrochure(res: Response, fileId: string) {
  const f = await StoredFileModel.findOne({ _id: fileId, kind: 'brochure' }).lean();
  if (!f) throw ApiError.notFound('Brochure not found');
  const full = path.join(env.uploadDir, f.key);
  try {
    await fs.access(full);
  } catch {
    throw ApiError.notFound('Brochure not found');
  }
  const name = f.originalName.replace(/[^\w.\- ]/g, '_') || 'brochure.pdf';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', String(f.size));
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Content-Disposition', `inline; filename="${name}"`);
  await new Promise<void>((resolve, reject) => createReadStream(full).on('error', reject).on('end', resolve).pipe(res));
}

// Deleting is for colleges that were never used: drafts (or archived records) that no enquiry, application,
// shortlist, comparison or scholarship refers to. Anything used is kept and can be made inactive instead.
export async function deleteCollege(req: Request, id: string) {
  const c = await CollegeModel.findById(id).lean();
  if (!c) throw ApiError.notFound('College not found');
  if (c.status === 'published') throw new ApiError(409, 'COLLEGE_ACTIVE', 'Unpublish (make inactive) the college before deleting it.');
  const oid = new mongoose.Types.ObjectId(id);
  const [enquiry, application, shortlist, comparison, scholarship] = await Promise.all([
    EnquiryModel.exists({ $or: [{ 'preferences.colleges': oid }, { 'feeEstimates.college': oid }] }),
    AdmissionApplicationModel.exists({ college: oid }),
    ShortlistModel.exists({ college: oid }),
    SavedComparisonModel.exists({ colleges: oid }),
    ScholarshipModel.exists({ college: oid }),
  ]);
  if (enquiry || application || shortlist || comparison || scholarship) {
    throw new ApiError(409, 'IN_USE', 'Students or enquiries already refer to this college, so it cannot be deleted. Keep it inactive instead.');
  }
  const offerings = await CollegeCourseModel.find({ college: oid }).select('imageFile brochureFile').lean();
  const files = [
    ...((c.images as Array<{ file: unknown }> | undefined) ?? []).map((i) => i.file),
    c.logoFile,
    c.brochureFile,
    ...offerings.flatMap((o) => [o.imageFile, o.brochureFile]),
  ].filter(Boolean);
  await CollegeFeeModel.deleteMany({ college: oid });
  await CollegeCourseModel.deleteMany({ college: oid });
  await CollegeModel.deleteOne({ _id: oid });
  if (files.length) await deleteStoredFiles({ _id: { $in: files }, kind: { $in: ['college_image', 'brochure'] } });
  invalidateDirectoryCache();
  await audit(actorFrom(req), 'catalog.college_deleted', { type: 'college', id }, req, { name: c.name, slug: c.slug, offerings: offerings.length });
  return { deleted: true };
}
