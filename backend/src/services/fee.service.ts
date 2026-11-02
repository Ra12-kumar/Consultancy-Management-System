import type { Request } from 'express';
import { CollegeCourseModel } from '../models/CollegeCourse.js';
import { CollegeFeeModel } from '../models/CollegeFee.js';
import { ApiError } from '../utils/ApiError.js';
import type { FeeInputBody } from '../validators/catalog.validators.js';
import { actorFrom, audit } from './audit.service.js';
import { refreshCollegeSummary, setDraftFeeRecalculator } from './catalog.service.js';
import { calculateFee, storedTotals, type FeeInput } from './feeCalculator.js';

type Lean = Record<string, unknown> & { _id: unknown };

// Runs the calculator, turning its range errors into a 422 the form can show.
export function breakdownOf(input: FeeInput) {
  try {
    return calculateFee(input);
  } catch (err) {
    if (err instanceof RangeError) throw new ApiError(422, 'VALIDATION_ERROR', err.message, [{ field: 'components', message: err.message }]);
    throw err;
  }
}

const feeInput = (f: Lean): FeeInput => ({
  components: f.components as FeeInput['components'],
  durationMonths: f.durationMonths as number,
  consultancyServiceChargeMinor: (f.consultancyServiceChargeMinor as number) ?? 0,
  discount: (f.discount as FeeInput['discount']) ?? null,
});

// A fee version with its breakdown, always recalculated by the server.
export function toFee(f: Lean) {
  return {
    id: String(f._id),
    offering: String(f.collegeCourse),
    college: String(f.college),
    course: String(f.course),
    academicYear: f.academicYear,
    intake: f.intake,
    currency: f.currency,
    components: f.components,
    consultancyServiceChargeMinor: f.consultancyServiceChargeMinor,
    discount: f.discount ?? null,
    paymentSchedule: f.paymentSchedule,
    notes: f.notes,
    effectiveFrom: f.effectiveFrom ?? null,
    lastVerifiedAt: f.lastVerifiedAt ?? null,
    sourceRef: f.sourceRef,
    status: f.status,
    version: f.version,
    publishedAt: f.publishedAt ?? null,
    updatedAt: f.updatedAt ?? null,
    breakdown: breakdownOf(feeInput(f)),
  };
}

async function offeringOr404(id: string) {
  const o = await CollegeCourseModel.findById(id).lean();
  if (!o) throw ApiError.notFound('Course offering not found');
  return o;
}

async function nextVersion(offeringId: unknown, academicYear: string, intake: string) {
  const last = await CollegeFeeModel.findOne({ collegeCourse: offeringId, academicYear, intake }).sort({ version: -1 }).select('version').lean();
  return (last?.version ?? 0) + 1;
}

// Every version for an offering, newest first (the fee history).
export async function listFees(offeringId: string) {
  await offeringOr404(offeringId);
  const fees = await CollegeFeeModel.find({ collegeCourse: offeringId }).sort({ academicYear: -1, intake: 1, version: -1 }).lean();
  return (fees as Lean[]).map(toFee);
}

export function previewFee(input: FeeInput) {
  return breakdownOf(input);
}

export async function createFeeDraft(offeringId: string, input: FeeInputBody, req: Request) {
  const o = await offeringOr404(offeringId);
  const b = breakdownOf({ ...input, durationMonths: o.durationMonths });
  const fee = await CollegeFeeModel.create({
    ...input,
    collegeCourse: o._id,
    college: o.college,
    course: o.course,
    durationMonths: o.durationMonths,
    ...storedTotals(b),
    status: 'draft',
    version: await nextVersion(o._id, input.academicYear, input.intake),
    createdBy: req.user!.id,
  });
  await audit(actorFrom(req), 'pricing.fee_draft_created', { type: 'fee', id: String(fee._id) }, req, { offering: offeringId, academicYear: input.academicYear, officialTotalMinor: b.officialTotalMinor });
  return toFee(fee.toObject() as Lean);
}

// Only drafts can be edited. Published fees are immutable: publish a new version instead.
export async function updateFeeDraft(id: string, input: FeeInputBody, req: Request) {
  const fee = await CollegeFeeModel.findById(id).lean();
  if (!fee) throw ApiError.notFound('Fee not found');
  if (fee.status !== 'draft') throw new ApiError(409, 'FEE_LOCKED', 'Published fees cannot be changed. Create a new draft version instead.');
  const o = await offeringOr404(String(fee.collegeCourse));
  const b = breakdownOf({ ...input, durationMonths: o.durationMonths });
  const moved = input.academicYear !== fee.academicYear || input.intake !== fee.intake;
  const updated = await CollegeFeeModel.findOneAndUpdate(
    { _id: id, status: 'draft' },
    { $set: { ...input, durationMonths: o.durationMonths, ...storedTotals(b), ...(moved && { version: await nextVersion(o._id, input.academicYear, input.intake) }) } },
    { new: true, runValidators: true },
  ).lean();
  if (!updated) throw new ApiError(409, 'FEE_LOCKED', 'This fee was published or archived meanwhile. Reload and try again.');
  await audit(actorFrom(req), 'pricing.fee_draft_updated', { type: 'fee', id }, req, { officialTotalMinor: b.officialTotalMinor });
  return toFee(updated as Lean);
}

// Publishes a draft: the currently published version for the same offering, year and intake becomes
// `superseded` (kept as history). A unique partial index guarantees at most one published version.
export async function publishFee(id: string, req: Request) {
  const fee = await CollegeFeeModel.findById(id).lean();
  if (!fee) throw ApiError.notFound('Fee not found');
  if (fee.status !== 'draft') throw new ApiError(409, 'FEE_LOCKED', 'Only a draft can be published');
  const missing = [!fee.sourceRef && 'sourceRef', !fee.lastVerifiedAt && 'lastVerifiedAt'].filter(Boolean) as string[];
  if (missing.length) throw new ApiError(422, 'NOT_READY', 'Add the official source and the date the fees were verified before publishing', missing.map((field) => ({ field, message: 'Required before publishing' })));
  const o = await offeringOr404(String(fee.collegeCourse));
  const b = breakdownOf({ ...feeInput(fee as Lean), durationMonths: o.durationMonths });

  const scope = { collegeCourse: fee.collegeCourse, academicYear: fee.academicYear, intake: fee.intake };
  const previous = await CollegeFeeModel.findOneAndUpdate({ ...scope, status: 'published' }, { $set: { status: 'superseded' } }, { new: true }).lean();
  let published;
  try {
    published = await CollegeFeeModel.findOneAndUpdate(
      { _id: id, status: 'draft' },
      { $set: { status: 'published', publishedBy: req.user!.id, publishedAt: new Date(), durationMonths: o.durationMonths, ...storedTotals(b) } },
      { new: true },
    ).lean();
  } catch (err) {
    // Someone else published for the same scope at the same moment: keep theirs.
    if ((err as { code?: number }).code === 11000) throw new ApiError(409, 'CONFLICT', 'Another version was published at the same time. Reload and try again.');
    throw err;
  }
  if (!published) {
    // The draft changed state meanwhile: put the previous version back.
    if (previous) await CollegeFeeModel.updateOne({ _id: previous._id, status: 'superseded' }, { $set: { status: 'published' } });
    throw new ApiError(409, 'FEE_LOCKED', 'This draft was published or archived meanwhile. Reload and try again.');
  }
  await refreshCollegeSummary(fee.college);
  await audit(actorFrom(req), 'pricing.fee_published', { type: 'fee', id }, req, { offering: String(fee.collegeCourse), academicYear: fee.academicYear, version: fee.version, supersedes: previous ? String(previous._id) : null, officialTotalMinor: b.officialTotalMinor });
  return toFee(published as Lean);
}

export async function archiveFee(id: string, req: Request) {
  const fee = await CollegeFeeModel.findOneAndUpdate({ _id: id, status: { $in: ['draft', 'published'] } }, { $set: { status: 'archived' } }).lean();
  if (!fee) {
    if (!(await CollegeFeeModel.exists({ _id: id }))) throw ApiError.notFound('Fee not found');
    throw new ApiError(409, 'FEE_LOCKED', 'Only a draft or the published version can be archived');
  }
  if (fee.status === 'published') await refreshCollegeSummary(fee.college);
  await audit(actorFrom(req), 'pricing.fee_archived', { type: 'fee', id }, req, { from: fee.status });
  const after = await CollegeFeeModel.findById(id).lean();
  return toFee(after as Lean);
}

// Drafts follow an offering's new duration; published and superseded versions keep what was published.
setDraftFeeRecalculator(async (offeringId, durationMonths) => {
  const drafts = await CollegeFeeModel.find({ collegeCourse: offeringId, status: 'draft' }).lean();
  for (const d of drafts) {
    const b = breakdownOf({ ...feeInput(d as Lean), durationMonths });
    await CollegeFeeModel.updateOne({ _id: d._id, status: 'draft' }, { $set: { durationMonths, ...storedTotals(b) } });
  }
});
