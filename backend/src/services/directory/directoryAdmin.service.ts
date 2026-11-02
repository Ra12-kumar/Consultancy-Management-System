import type { Request } from 'express';
import mongoose from 'mongoose';
import { CollegeModel, normalizeName } from '../../models/College.js';
import { CollegeFeeModel } from '../../models/CollegeFee.js';
import { CollegeImportJobModel, DirectoryReviewItemModel } from '../../models/Directory.js';
import { ApiError } from '../../utils/ApiError.js';
import { actorFrom, audit } from '../audit.service.js';
import { pageMeta } from '../catalog.service.js';
import { invalidateDirectoryCache } from './cache.js';

type Lean = Record<string, any> & { _id: mongoose.Types.ObjectId }; // eslint-disable-line @typescript-eslint/no-explicit-any
const brief = (c: Lean | undefined) => (c ? { id: String(c._id), name: c.name, slug: c.slug, aisheCode: c.aisheCode ?? null, state: c.state, district: c.district ?? '', status: c.status, source: c.source?.name ?? '' } : null);

// ---- Review queue ----

export async function listReviews({ kind, status, page, limit }: { kind?: string; status: 'open' | 'resolved'; page: number; limit: number }) {
  const filter = { status, ...(kind && { kind }) };
  const [items, total] = await Promise.all([DirectoryReviewItemModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), DirectoryReviewItemModel.countDocuments(filter)]);
  const colleges = new Map(((await CollegeModel.find({ _id: { $in: items.flatMap((i) => [i.college, i.otherCollege].filter(Boolean)) } }).select('name slug aisheCode state district status source').lean()) as Lean[]).map((c) => [String(c._id), c]));
  return {
    items: items.map((i) => ({
      id: String(i._id),
      kind: i.kind,
      college: brief(colleges.get(String(i.college))),
      otherCollege: i.otherCollege ? brief(colleges.get(String(i.otherCollege))) : null,
      field: i.field,
      currentValue: i.currentValue,
      incomingValue: i.incomingValue,
      reason: i.reason,
      status: i.status,
      resolution: i.resolution,
      note: i.note,
      createdAt: i.createdAt,
      resolvedAt: i.resolvedAt ?? null,
    })),
    meta: pageMeta(page, limit, total),
  };
}

export const REVIEW_ACTIONS = {
  possible_duplicate: ['not_duplicate', 'archive_new', 'archive_existing'],
  field_conflict: ['keep_current', 'accept_incoming'],
} as const;

export async function resolveReview(id: string, input: { action: string; note: string }, req: Request) {
  const item = await DirectoryReviewItemModel.findOne({ _id: id, status: 'open' }).lean();
  if (!item) throw ApiError.notFound('Open review item not found');
  if (!(REVIEW_ACTIONS[item.kind as keyof typeof REVIEW_ACTIONS] as readonly string[]).includes(input.action)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'That action does not apply to this item', [{ field: 'action', message: 'Choose a valid action' }]);
  }
  const changes: Record<string, unknown> = {};
  if (item.kind === 'possible_duplicate') {
    if (input.action === 'not_duplicate') {
      await CollegeModel.updateOne({ _id: item.college, status: 'needs_review' }, { $set: { status: 'published' } });
      changes.published = String(item.college);
    } else if (input.action === 'archive_new') {
      await CollegeModel.updateOne({ _id: item.college }, { $set: { status: 'archived' } });
      changes.archived = String(item.college);
    } else {
      // Keep the record from the authorised source; archive the hand-entered twin (nothing is deleted).
      await CollegeModel.updateOne({ _id: item.otherCollege }, { $set: { status: 'archived' } });
      await CollegeModel.updateOne({ _id: item.college, status: 'needs_review' }, { $set: { status: 'published' } });
      changes.archived = String(item.otherCollege);
    }
  } else if (input.action === 'accept_incoming') {
    // The admin accepts the source's value; the field stays locked (now with the verified new value).
    const set: Record<string, unknown> = { [item.field]: item.incomingValue };
    if (item.field === 'name') set.normalizedName = normalizeName(String(item.incomingValue ?? ''));
    await CollegeModel.updateOne({ _id: item.college }, { $set: set });
    changes[item.field] = { from: item.currentValue, to: item.incomingValue };
  }
  const resolved = await DirectoryReviewItemModel.findOneAndUpdate({ _id: id, status: 'open' }, { $set: { status: 'resolved', resolution: input.action, note: input.note, resolvedBy: req.user!.id, resolvedAt: new Date() } }, { new: true }).lean();
  invalidateDirectoryCache();
  await audit(actorFrom(req), 'directory.review_resolved', { type: 'college', id: String(item.college) }, req, { kind: item.kind, action: input.action, changes });
  return { id: String(resolved!._id), status: resolved!.status, resolution: resolved!.resolution };
}

// ---- Stale data ----

// Published records not seen in the latest full import of their source, and detailed records verified more than a
// year ago. Nothing is changed automatically: admins decide.
export async function staleRecords({ reason, page, limit }: { reason?: 'not_in_source' | 'verification_due'; page: number; limit: number }) {
  const lastFull = await CollegeImportJobModel.aggregate<{ _id: string; at: Date }>([{ $match: { status: { $in: ['completed', 'completed_with_errors'] }, fullSnapshot: true } }, { $group: { _id: '$importer', at: { $max: '$createdAt' } } }]);
  const notInSource = lastFull.map((f) => ({ 'source.importer': f._id, 'source.lastSeenAt': { $lt: f.at } }));
  const verificationDue = { listingLevel: 'detailed', isSample: false, lastVerifiedAt: { $ne: null, $lt: new Date(Date.now() - 365 * 86_400_000) } };
  const or = [...(reason !== 'verification_due' ? notInSource : []), ...(reason !== 'not_in_source' ? [verificationDue] : [])];
  if (!or.length) return { items: [], meta: pageMeta(page, limit, 0) };
  const filter = { status: { $in: ['published', 'needs_review'] }, $or: or };
  const [items, total] = await Promise.all([CollegeModel.find(filter).sort({ updatedAt: 1 }).skip((page - 1) * limit).limit(limit).select('name slug aisheCode state district status source lastVerifiedAt listingLevel').lean(), CollegeModel.countDocuments(filter)]);
  const fullAt = new Map(lastFull.map((f) => [f._id, f.at]));
  return {
    items: (items as Lean[]).map((c) => {
      const latest = c.source?.importer ? fullAt.get(c.source.importer) : undefined;
      return { ...brief(c), lastVerifiedAt: c.lastVerifiedAt ?? null, lastSeenAt: c.source?.lastSeenAt ?? null, reason: latest && c.source?.lastSeenAt && c.source.lastSeenAt < latest ? 'not_in_source' : 'verification_due' };
    }),
    meta: pageMeta(page, limit, total),
  };
}

// ---- Coverage by state ----

export async function coverageByState() {
  const [byState, withFees] = await Promise.all([
    CollegeModel.aggregate<{ _id: string; total: number; universities: number; colleges: number; standalone: number; basic: number; review: number }>([
      { $match: { status: { $in: ['published', 'needs_review'] }, state: { $nin: ['', null] } } },
      {
        $group: {
          _id: '$state',
          total: { $sum: 1 },
          universities: { $sum: { $cond: [{ $eq: ['$category', 'university'] }, 1, 0] } },
          colleges: { $sum: { $cond: [{ $eq: ['$category', 'college'] }, 1, 0] } },
          standalone: { $sum: { $cond: [{ $eq: ['$category', 'standalone'] }, 1, 0] } },
          basic: { $sum: { $cond: [{ $eq: ['$listingLevel', 'basic'] }, 1, 0] } },
          review: { $sum: { $cond: [{ $eq: ['$status', 'needs_review'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    CollegeFeeModel.distinct('college', { status: 'published' }),
  ]);
  const feesByState = new Map((await CollegeModel.aggregate<{ _id: string; n: number }>([{ $match: { _id: { $in: withFees } } }, { $group: { _id: '$state', n: { $sum: 1 } } }])).map((r) => [r._id, r.n]));
  return byState.map((s) => ({ state: s._id, total: s.total, universities: s.universities, colleges: s.colleges, standalone: s.standalone, basicListings: s.basic, needsReview: s.review, withVerifiedFees: feesByState.get(s._id) ?? 0 }));
}
