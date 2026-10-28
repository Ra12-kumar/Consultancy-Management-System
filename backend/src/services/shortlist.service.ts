import type { Request } from 'express';
import mongoose from 'mongoose';
import { CollegeModel } from '../models/College.js';
import { CourseModel } from '../models/Course.js';
import { SavedComparisonModel, ShortlistModel } from '../models/Shortlist.js';
import { ApiError } from '../utils/ApiError.js';
import { toCollegeCard } from './collegeSearch.service.js';

export const SHORTLIST_LIMIT = 50;
export const COMPARISON_LIMIT = 20;

// Every function takes the student id from the session (req.user), never from the request.
const me = (req: Request) => new mongoose.Types.ObjectId(req.user!.id);

async function cards(ids: unknown[]) {
  const colleges = await CollegeModel.find({ _id: { $in: ids } }).lean();
  const courses = await CourseModel.find({ _id: { $in: colleges.flatMap((c) => c.courseIds) } }).lean();
  const courseMap = new Map(courses.map((c) => [String(c._id), { id: String(c._id), name: c.name, slug: c.slug, level: c.level }]));
  // Colleges that were unpublished since saving are shown as unavailable, without their details.
  return new Map(colleges.map((c) => [String(c._id), c.status === 'published' ? { ...toCollegeCard(c as never, courseMap), available: true } : { id: String(c._id), name: c.name, available: false }]));
}

export async function listShortlist(req: Request) {
  const items = await ShortlistModel.find({ student: me(req) }).sort({ createdAt: -1 }).lean();
  const byId = await cards(items.map((i) => i.college));
  return items
    .filter((i) => byId.has(String(i.college)))
    .map((i) => ({ collegeId: String(i.college), note: i.note, addedAt: i.createdAt, college: byId.get(String(i.college))! }));
}

export async function addToShortlist(req: Request, { collegeId, note }: { collegeId: string; note: string }) {
  if (!(await CollegeModel.exists({ _id: collegeId, status: 'published' }))) throw ApiError.notFound('College not found');
  const exists = await ShortlistModel.exists({ student: me(req), college: collegeId });
  if (!exists && (await ShortlistModel.countDocuments({ student: me(req) })) >= SHORTLIST_LIMIT) {
    throw new ApiError(409, 'LIMIT_REACHED', `You can save up to ${SHORTLIST_LIMIT} colleges. Remove one first.`);
  }
  await ShortlistModel.updateOne({ student: me(req), college: collegeId }, { $set: { note }, $setOnInsert: { student: me(req), college: collegeId } }, { upsert: true });
  return { collegeId, saved: true };
}

export async function removeFromShortlist(req: Request, collegeId: string) {
  const r = await ShortlistModel.deleteOne({ student: me(req), college: collegeId });
  if (!r.deletedCount) throw ApiError.notFound('This college is not in your list');
  return { collegeId, saved: false };
}

export async function listComparisons(req: Request) {
  const items = await SavedComparisonModel.find({ student: me(req) }).sort({ createdAt: -1 }).lean();
  const byId = await cards(items.flatMap((i) => i.colleges));
  const courses = new Map((await CourseModel.find({ _id: { $in: items.map((i) => i.course).filter(Boolean) } }).lean()).map((c) => [String(c._id), { id: String(c._id), name: c.name, slug: c.slug }]));
  return items.map((i) => ({
    id: String(i._id),
    name: i.name,
    createdAt: i.createdAt,
    course: i.course ? (courses.get(String(i.course)) ?? null) : null,
    colleges: i.colleges.map((id) => byId.get(String(id))).filter(Boolean),
  }));
}

export async function saveComparison(req: Request, { name, colleges, course }: { name: string; colleges: string[]; course: string | null }) {
  if ((await CollegeModel.countDocuments({ _id: { $in: colleges }, status: 'published' })) !== colleges.length) throw ApiError.notFound('One or more colleges are not available');
  if (course && !(await CourseModel.exists({ _id: course }))) throw ApiError.notFound('Course not found');
  if ((await SavedComparisonModel.countDocuments({ student: me(req) })) >= COMPARISON_LIMIT) {
    throw new ApiError(409, 'LIMIT_REACHED', `You can save up to ${COMPARISON_LIMIT} comparisons. Delete one first.`);
  }
  const c = await SavedComparisonModel.create({ student: me(req), name, colleges, course });
  return { id: String(c._id), name: c.name };
}

export async function deleteComparison(req: Request, id: string) {
  // Scoped to the owner: another student's comparison looks like it does not exist.
  const r = await SavedComparisonModel.deleteOne({ _id: id, student: me(req) });
  if (!r.deletedCount) throw ApiError.notFound('Comparison not found');
  return { deleted: true };
}
