import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { CollegeModel, MAX_COLLEGE_IMAGES } from '../models/College.js';
import { StoredFileModel } from '../models/Support.js';
import { ApiError } from '../utils/ApiError.js';
import { actorFrom, audit } from './audit.service.js';
import { PHOTO_TYPES, deleteStoredFiles, saveUpload } from './files.service.js';

// College photo galleries. Admins upload JPEG/PNG/WebP files (checked by content, stored under random names);
// they are public pictures, served read-only by /api/colleges/images/:fileId.

type Lean = Record<string, any> & { _id: mongoose.Types.ObjectId }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Image = { _id: mongoose.Types.ObjectId; file: mongoose.Types.ObjectId; alt: string };

export const imageUrl = (fileId: unknown) => `/api/colleges/images/${String(fileId)}`;

// The gallery in display order, with the primary image marked (the first image when none is chosen).
export function galleryView(c: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const images = (c.images as Image[] | undefined) ?? [];
  const primary = c.primaryImage && images.some((i) => String(i._id) === String(c.primaryImage)) ? String(c.primaryImage) : images[0] ? String(images[0]._id) : null;
  return images.map((i) => ({ id: String(i._id), url: imageUrl(i.file), alt: i.alt || String(c.name ?? ''), primary: String(i._id) === primary }));
}

export const primaryImageUrl = (c: Record<string, any>) => // eslint-disable-line @typescript-eslint/no-explicit-any
  galleryView(c).find((i) => i.primary)?.url ?? null;

async function collegeOr404(id: string) {
  const c = (await CollegeModel.findById(id).lean()) as Lean | null;
  if (!c) throw ApiError.notFound('College not found');
  return c;
}

function imageOr404(c: Lean, imageId: string) {
  const img = ((c.images as Image[]) ?? []).find((i) => String(i._id) === imageId);
  if (!img) throw ApiError.notFound('Image not found');
  return img;
}

export async function uploadCollegeImage(req: Request, id: string, file: Express.Multer.File | undefined, alt: string) {
  const c = await collegeOr404(id);
  if (((c.images as Image[]) ?? []).length >= MAX_COLLEGE_IMAGES) throw new ApiError(422, 'TOO_MANY_IMAGES', `A college can have up to ${MAX_COLLEGE_IMAGES} photos. Remove one first.`);
  const stored = await saveUpload(file, { owner: req.user!.id, uploadedBy: req.user!.id, kind: 'college_image', allowed: PHOTO_TYPES });
  const image = { _id: new mongoose.Types.ObjectId(), file: stored._id, alt };
  // Conditional on the count, so parallel uploads cannot pass the limit.
  const updated = await CollegeModel.findOneAndUpdate(
    { _id: id, [`images.${MAX_COLLEGE_IMAGES - 1}`]: { $exists: false } },
    { $push: { images: image }, ...(!c.primaryImage && { $set: { primaryImage: image._id } }) },
    { new: true },
  ).lean();
  if (!updated) {
    await deleteStoredFiles({ _id: stored._id });
    throw new ApiError(422, 'TOO_MANY_IMAGES', `A college can have up to ${MAX_COLLEGE_IMAGES} photos. Remove one first.`);
  }
  await audit(actorFrom(req), 'catalog.college_image_added', { type: 'college', id }, req, { image: String(image._id) });
  return galleryView(updated as Lean);
}

// Replaces the picture of one gallery entry (same position, primary flag and caption).
export async function replaceCollegeImage(req: Request, id: string, imageId: string, file: Express.Multer.File | undefined) {
  const c = await collegeOr404(id);
  const old = imageOr404(c, imageId);
  const stored = await saveUpload(file, { owner: req.user!.id, uploadedBy: req.user!.id, kind: 'college_image', allowed: PHOTO_TYPES });
  const updated = await CollegeModel.findOneAndUpdate({ _id: id, 'images._id': old._id, 'images.file': old.file }, { $set: { 'images.$.file': stored._id } }, { new: true }).lean();
  if (!updated) {
    await deleteStoredFiles({ _id: stored._id });
    throw new ApiError(409, 'IMAGE_CHANGED', 'This photo was changed by someone else. Reload and try again.');
  }
  await deleteStoredFiles({ _id: old.file, kind: 'college_image' });
  await audit(actorFrom(req), 'catalog.college_image_replaced', { type: 'college', id }, req, { image: imageId });
  return galleryView(updated as Lean);
}

export async function updateCollegeImages(req: Request, id: string, input: { order?: string[]; primary?: string; alts?: Record<string, string> }) {
  const c = await collegeOr404(id);
  const images = (c.images as Image[]) ?? [];
  const ids = images.map((i) => String(i._id));
  let next = images;
  if (input.order) {
    if (input.order.length !== ids.length || input.order.some((o) => !ids.includes(o)) || new Set(input.order).size !== ids.length) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'The new order must list every photo exactly once', [{ field: 'order', message: 'List every photo once' }]);
    }
    next = input.order.map((o) => images.find((i) => String(i._id) === o)!);
  }
  if (input.primary && !ids.includes(input.primary)) throw ApiError.notFound('Image not found');
  for (const [imageId, alt] of Object.entries(input.alts ?? {})) {
    if (!ids.includes(imageId)) throw ApiError.notFound('Image not found');
    next = next.map((i) => (String(i._id) === imageId ? { ...i, alt } : i));
  }
  // Optimistic: the gallery must still be the one that was read.
  const updated = await CollegeModel.findOneAndUpdate(
    { _id: id, images: { $size: ids.length }, 'images._id': { $all: images.map((i) => i._id) } },
    { $set: { images: next, ...(input.primary && { primaryImage: new mongoose.Types.ObjectId(input.primary) }) } },
    { new: true, runValidators: true },
  ).lean();
  if (!updated) throw new ApiError(409, 'IMAGE_CHANGED', 'The photos were changed by someone else. Reload and try again.');
  await audit(actorFrom(req), 'catalog.college_images_updated', { type: 'college', id }, req, { reordered: Boolean(input.order), primary: input.primary ?? null });
  return galleryView(updated as Lean);
}

export async function deleteCollegeImage(req: Request, id: string, imageId: string) {
  const c = await collegeOr404(id);
  const img = imageOr404(c, imageId);
  const remaining = ((c.images as Image[]) ?? []).filter((i) => String(i._id) !== imageId);
  const wasPrimary = String(c.primaryImage) === imageId;
  const updated = await CollegeModel.findOneAndUpdate(
    { _id: id },
    { $pull: { images: { _id: img._id } }, ...(wasPrimary && { $set: { primaryImage: remaining[0]?._id ?? null } }) },
    { new: true },
  ).lean();
  await deleteStoredFiles({ _id: img.file, kind: 'college_image' });
  await audit(actorFrom(req), 'catalog.college_image_removed', { type: 'college', id }, req, { image: imageId });
  return galleryView(updated as Lean);
}

// Public, read-only. Only files uploaded as college photos are served here (never documents or profile photos).
export async function streamCollegeImage(res: Response, fileId: string) {
  const f = await StoredFileModel.findOne({ _id: fileId, kind: 'college_image' }).lean();
  if (!f) throw ApiError.notFound('Image not found');
  const full = path.join(env.uploadDir, f.key);
  try {
    await fs.access(full);
  } catch {
    throw ApiError.notFound('Image not found');
  }
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Content-Length', String(f.size));
  // File ids change whenever a photo is replaced, so the content behind an id never changes.
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Content-Disposition', 'inline');
  await new Promise<void>((resolve, reject) => createReadStream(full).on('error', reject).on('end', resolve).pipe(res));
}

// ---- Featured colleges and their order ----

export async function featuredColleges() {
  const list = (await CollegeModel.find({ featured: true }).select('name slug status city state featuredRank images primaryImage').lean()) as Lean[];
  return list
    .sort((a, b) => (a.featuredRank ?? Number.MAX_SAFE_INTEGER) - (b.featuredRank ?? Number.MAX_SAFE_INTEGER) || String(a.name).localeCompare(String(b.name)))
    .map((c) => ({ id: String(c._id), name: c.name, slug: c.slug, status: c.status, city: c.city, state: c.state, rank: c.featuredRank ?? null, imageUrl: primaryImageUrl(c) }));
}

// Replaces the featured list: exactly these colleges, in this order. Archived colleges cannot be featured.
export async function setFeaturedOrder(req: Request, ids: string[]) {
  const found = await CollegeModel.find({ _id: { $in: ids } }).select('status').lean();
  const missing = ids.filter((id) => !found.some((c) => String(c._id) === id));
  if (missing.length) throw new ApiError(422, 'VALIDATION_ERROR', 'Some colleges were not found', missing.map(() => ({ field: 'ids', message: 'College not found' })));
  if (found.some((c) => c.status === 'archived')) throw new ApiError(422, 'VALIDATION_ERROR', 'Archived colleges cannot be featured', [{ field: 'ids', message: 'Restore the college first' }]);
  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
  await CollegeModel.updateMany({ featured: true, _id: { $nin: objectIds } }, { $set: { featured: false, featuredRank: null } });
  if (ids.length) await CollegeModel.bulkWrite(objectIds.map((_id, i) => ({ updateOne: { filter: { _id }, update: { $set: { featured: true, featuredRank: i + 1 } } } })));
  await audit(actorFrom(req), 'catalog.featured_order_set', { type: 'college', id: 'featured' }, req, { ids });
  return featuredColleges();
}
