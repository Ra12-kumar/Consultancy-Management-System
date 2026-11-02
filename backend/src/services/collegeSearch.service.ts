import mongoose from 'mongoose';
import { brochureUrl, pictureUrl } from './collegeMedia.service.js';
import { CollegeModel, normalizeName } from '../models/College.js';
import { CollegeImportJobModel } from '../models/Directory.js';
import { CollegeCourseModel } from '../models/CollegeCourse.js';
import { CollegeFeeModel } from '../models/CollegeFee.js';
import { CourseModel } from '../models/Course.js';
import { LocationModel } from '../models/Location.js';
import { ApiError } from '../utils/ApiError.js';
import { safeExternalUrl } from '../utils/safeUrl.js';
import type { CompareQuery, ListCollegesQuery } from '../validators/catalog.validators.js';
import { escapeRegex, pageMeta } from './catalog.service.js';
import { breakdownOf } from './fee.service.js';
import { cached } from './directory/cache.js';
import { collegesWithScholarships } from './scholarship.service.js';
import { galleryView, primaryImageUrl } from './collegeImages.service.js';

type Lean = Record<string, unknown> & { _id: mongoose.Types.ObjectId };
type CourseRef = { id: string; name: string; slug: string; level: string };

export async function courseMap(ids: unknown[]) {
  const courses = await CourseModel.find({ _id: { $in: ids } }).lean();
  return new Map<string, CourseRef>(courses.map((c) => [String(c._id), { id: String(c._id), name: c.name, slug: c.slug, level: c.level }]));
}

// What a directory card shows. Only public fields; sample records and basic listings are always flagged.
export function toCollegeCard(c: Lean, courses: Map<string, CourseRef>, extra: { fee?: CardFee; stale?: boolean } = {}) {
  const fee = c.feeSummary as { minTotalMinor: number | null; maxTotalMinor: number | null; minAnnualMinor?: number | null; maxAnnualMinor?: number | null } | undefined;
  const source = c.source as { name?: string; lastSyncedAt?: Date | null; importer?: string } | undefined;
  return {
    id: String(c._id),
    name: c.name as string,
    slug: c.slug as string,
    type: c.type as string,
    ownership: (c.ownership as string | null) ?? null,
    category: (c.category as string | null) ?? null,
    subtype: (c.subtype as string) ?? '',
    aisheCode: (c.aisheCode as string | null) ?? null,
    city: c.city as string,
    district: (c.district as string) ?? '',
    state: c.state as string,
    // An uploaded logo (our own public image route) wins over an external https address.
    logoUrl: pictureUrl(c.logoFile) ?? safeExternalUrl(c.logoUrl, { httpsOnly: true }),
    // A photo of this college, added by an admin (never a stock or another college's image).
    coverUrl: safeExternalUrl(c.coverUrl, { httpsOnly: true }),
    // The primary gallery photo uploaded by an admin, else the cover photo.
    imageUrl: primaryImageUrl(c) ?? safeExternalUrl(c.coverUrl, { httpsOnly: true }),
    featuredRank: (c.featuredRank as number | null) ?? null,
    academicSession: (c.academicSession as string) ?? '',
    admissionDeadline: (c.admissionDeadline as Date | null) ?? null,
    applicationUrl: safeExternalUrl(c.applicationUrl),
    website: safeExternalUrl(c.website),
    featured: Boolean(c.featured),
    isSample: Boolean(c.isSample),
    listingLevel: ((c.listingLevel as string) ?? 'detailed') as 'basic' | 'detailed',
    lastVerifiedAt: (c.lastVerifiedAt as Date | null) ?? null,
    source: source?.name ? { name: source.name, lastSyncedAt: source.lastSyncedAt ?? null } : null,
    stale: Boolean(extra.stale),
    accreditations: ((c.accreditations as Array<{ body: string; grade: string }>) ?? []).map((a) => ({ body: a.body, grade: a.grade })),
    approvals: (c.approvals as string[]) ?? [],
    courses: ((c.courseIds as unknown[]) ?? []).map((id) => courses.get(String(id))).filter((x): x is CourseRef => Boolean(x)),
    feeFromMinor: fee?.minTotalMinor ?? null,
    feeToMinor: fee?.maxTotalMinor ?? null,
    annualFeeFromMinor: fee?.minAnnualMinor ?? null,
    // The fee for the searched course and basis (or the college's lowest), never a guess.
    fee: extra.fee ?? null,
  };
}

type CardFee = { basis: 'annual' | 'total'; amountMinor: number | null; status: 'verified' | 'not_verified' | 'not_comparable'; academicYear: string | null; lastVerifiedAt: Date | null };

const empty = (page: number, limit: number) => ({ items: [], meta: { ...pageMeta(page, limit, 0), hasSamples: false } });

async function locationId(slugValue: string) {
  return (await LocationModel.findOne({ slug: slugValue, isActive: true }).select('_id').lean())?._id ?? null;
}

// When each importer last completed a full snapshot (records not seen since then are stale).
const lastFullImports = () =>
  cached('last-full-imports', async () => {
    const rows = await CollegeImportJobModel.aggregate<{ _id: string; at: Date }>([{ $match: { status: { $in: ['completed', 'completed_with_errors'] }, fullSnapshot: true } }, { $group: { _id: '$importer', at: { $max: '$createdAt' } } }]);
    return new Map(rows.map((r) => [r._id, r.at]));
  });
const STALE_VERIFICATION_MS = 365 * 86_400_000;
export async function isStale(c: Lean) {
  const src = c.source as { importer?: string; lastSeenAt?: Date | null } | undefined;
  const full = src?.importer ? (await lastFullImports()).get(src.importer) : undefined;
  if (full && src?.lastSeenAt && src.lastSeenAt < full) return true;
  const verified = c.lastVerifiedAt as Date | null;
  return c.listingLevel === 'detailed' && !c.isSample && Boolean(verified) && Date.now() - verified!.getTime() > STALE_VERIFICATION_MS;
}

// Public directory: published colleges only, every filter resolved by MongoDB on the server.
export async function searchColleges(query: ListCollegesQuery) {
  const { q, course, location, state, district, type, ownership, category, approval, scholarship, hostel, intake, feeBasis, minBudget, maxBudget, maxHostel, maxOverall, includeUnverified, percentage, sort, page, limit } = query;
  const filter: Record<string, unknown> = { status: 'published' };
  const and: Record<string, unknown>[] = [];
  let courseId: mongoose.Types.ObjectId | null = null;

  if (course) {
    const c = await CourseModel.findOne({ slug: course, isActive: true }).select('_id').lean();
    if (!c) return empty(page, limit);
    courseId = c._id;
    filter.courseIds = courseId;
  }
  // locationIds holds the district/city and every ancestor, so a region or state finds everything under it.
  const placeIds: mongoose.Types.ObjectId[] = [];
  for (const s of [location, state, district]) {
    if (!s) continue;
    const id = await locationId(s);
    if (!id) return empty(page, limit);
    placeIds.push(id);
  }
  if (placeIds.length) filter.locationIds = { $all: placeIds };
  if (type) filter.type = type;
  if (query.featured === 'yes') filter.featured = true;
  if (ownership) filter.ownership = ownership;
  if (category) filter.category = category;
  if (approval) {
    const rx = new RegExp(`^${escapeRegex(approval)}\\b`, 'i');
    and.push({ $or: [{ approvals: rx }, { 'accreditations.body': rx }] });
  }
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    const name = new RegExp(escapeRegex(normalizeName(q)));
    // "btech" should find "B.Tech / B.E.": also compare letters and digits only.
    const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const wanted = squash(q);
    const courses = (await CourseModel.find({ isActive: true }).select('name slug').lean()).filter((c) => rx.test(c.name) || (wanted.length >= 2 && (squash(c.name).includes(wanted) || squash(c.slug).includes(wanted))));
    and.push({
      $or: [{ normalizedName: name }, { aliases: rx }, { aisheCode: q.trim().toUpperCase() }, { city: rx }, { district: rx }, { state: rx }, ...(courses.length ? [{ courseIds: { $in: courses.map((c) => c._id) } }] : [])],
    });
  }
  if (percentage != null) {
    const eligible = await CollegeCourseModel.distinct('college', { status: 'active', ...(courseId && { course: courseId }), $or: [{ minPercentage: null }, { minPercentage: { $lte: percentage } }] });
    and.push({ _id: { $in: eligible } });
  }

  // ---- Fees: strict by default ----
  const basisField = feeBasis === 'annual' ? 'annualOfficialMinor' : 'officialTotalMinor';
  const feeScope = { status: 'published', ...(courseId && { course: courseId }), ...(intake && { intake: new RegExp(`^${escapeRegex(intake)}$`, 'i') }) };
  const budgetFilter = minBudget != null || maxBudget != null || maxHostel != null || maxOverall != null;
  if (budgetFilter) {
    const match: Record<string, unknown> = { ...feeScope, [basisField]: { $ne: null, ...(minBudget != null && { $gte: minBudget }), ...(maxBudget != null && { $lte: maxBudget }) } };
    if (maxHostel != null) match.hostelAnnualMinor = { $ne: null, $lte: maxHostel };
    if (maxOverall != null) match.overallEstimateMinor = { $ne: null, $lte: maxOverall };
    const fitting = await CollegeFeeModel.distinct('college', match);
    if (includeUnverified === 'yes') {
      // Also list colleges with no verified fee on this basis (never colleges whose verified fee is outside the budget).
      const comparable = await CollegeFeeModel.distinct('college', { ...feeScope, [basisField]: { $ne: null } });
      and.push({ $or: [{ _id: { $in: fitting } }, { _id: { $nin: comparable } }] });
    } else and.push({ _id: { $in: fitting } });
  }
  if (hostel === 'yes') {
    const withHostelFee = await CollegeFeeModel.distinct('college', { ...feeScope, hostelAnnualMinor: { $ne: null } });
    and.push({ $or: [{ hostelAvailable: true }, { _id: { $in: withHostelFee } }] });
  }
  if (scholarship === 'yes') and.push({ _id: { $in: await collegesWithScholarships() } });
  if (and.length) filter.$and = and;

  const minField = feeBasis === 'annual' ? 'feeSummary.minAnnualMinor' : 'feeSummary.minTotalMinor';
  const maxField = feeBasis === 'annual' ? 'feeSummary.maxAnnualMinor' : 'feeSummary.maxTotalMinor';
  const noFee = { $cond: [{ $eq: [{ $ifNull: [`$${minField}`, null] }, null] }, 1, 0] };
  const order: Record<string, 1 | -1> = {
    featured: { listingLevel: 1, featured: -1, _rank: 1, name: 1 },
    name: { name: 1 },
    fee_low: { _noFee: 1, [minField]: 1, name: 1 },
    fee_high: { _noFee: 1, [maxField]: -1, name: 1 },
    recently_verified: { lastVerifiedAt: -1, name: 1 },
    recently_updated: { updatedAt: -1, name: 1 },
  }[sort] as Record<string, 1 | -1>;

  const [result] = await CollegeModel.aggregate<{ items: Lean[]; total: Array<{ n: number }> }>([
    { $match: filter },
    ...(sort.startsWith('fee') ? [{ $addFields: { _noFee: noFee } }] : []),
    // Featured colleges in the order chosen by admins.
    ...(sort === 'featured' ? [{ $addFields: { _rank: { $ifNull: ['$featuredRank', 1_000_000] } } }] : []),
    { $sort: { ...order, _id: 1 } },
    { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { _noFee: 0, _rank: 0, aliases: 0, normalizedName: 0, lockedFields: 0, verificationNotes: 0 } }], total: [{ $count: 'n' }] } },
  ]);
  const items = result?.items ?? [];
  // One query for the fees of the whole page (no per-card queries).
  const fees = items.length
    ? await CollegeFeeModel.find({ ...feeScope, college: { $in: items.map((c) => c._id) } })
        .select(`college academicYear lastVerifiedAt ${basisField}`)
        .sort({ academicYear: -1 })
        .lean()
    : [];
  const amount = (f: unknown) => (f as Record<string, number | null>)[basisField] ?? null;
  const cardFee = (c: Lean): CardFee => {
    const own = fees.filter((f) => String(f.college) === String(c._id));
    const comparable = own.filter((f) => amount(f) != null);
    if (!comparable.length) return { basis: feeBasis, amountMinor: null, status: own.length ? 'not_comparable' : 'not_verified', academicYear: null, lastVerifiedAt: null };
    const best = comparable.reduce((x, y) => (amount(x)! <= amount(y)! ? x : y));
    return { basis: feeBasis, amountMinor: amount(best), status: 'verified', academicYear: best.academicYear, lastVerifiedAt: best.lastVerifiedAt ?? null };
  };
  const courses = await courseMap(items.flatMap((c) => (c.courseIds as unknown[]) ?? []));
  const hasSamples = Boolean(await CollegeModel.exists({ status: 'published', isSample: true }));
  const cards = [];
  for (const c of items) cards.push(toCollegeCard(c, courses, { fee: cardFee(c), stale: await isStale(c) }));
  return { items: cards, meta: { ...pageMeta(page, limit, result?.total[0]?.n ?? 0), hasSamples, feeBasis, coverage: await directoryCoverage() } };
}

// What the directory actually contains, so it never claims to list "every college in India".
export const directoryCoverage = () =>
  cached('coverage', async () => {
    const published = { status: 'published' };
    const [total, byCategory, bySource, states, withFees, lastImport] = await Promise.all([
      CollegeModel.countDocuments(published),
      CollegeModel.aggregate<{ _id: string | null; n: number }>([{ $match: published }, { $group: { _id: '$category', n: { $sum: 1 } } }]),
      CollegeModel.aggregate<{ _id: string; n: number; lastSyncedAt: Date | null }>([{ $match: { ...published, 'source.importer': { $nin: ['', null] } } }, { $group: { _id: '$source.name', n: { $sum: 1 }, lastSyncedAt: { $max: '$source.lastSyncedAt' } } }]),
      CollegeModel.distinct('state', { ...published, state: { $nin: ['', null] } }),
      CollegeFeeModel.distinct('college', { status: 'published' }),
      CollegeImportJobModel.find({ status: { $in: ['completed', 'completed_with_errors'] } }).sort({ finishedAt: -1 }).select('importer finishedAt sourceDataDate').limit(10).lean(),
    ]);
    const importedAll = ['aishe-colleges', 'aishe-universities', 'aishe-standalone'].every((i) => lastImport.some((j) => j.importer === i));
    return {
      total,
      byCategory: Object.fromEntries(byCategory.map((c) => [c._id ?? 'unspecified', c.n])),
      sources: bySource.map((s) => ({ name: s._id, records: s.n, lastSyncedAt: s.lastSyncedAt })),
      statesCovered: states.length,
      statesTotal: 36,
      withVerifiedFees: await CollegeModel.countDocuments({ ...published, _id: { $in: withFees } }),
      lastImportAt: lastImport[0]?.finishedAt ?? null,
      // True until all three AISHE lists (colleges, universities, standalone) have been imported.
      partial: !importedAll,
    };
  });

// Filter options with counts (cached; cleared after imports and admin edits).
export const directoryFilters = () =>
  cached('filters', async () => {
    const published = { status: 'published' };
    const [states, ownership, categories] = await Promise.all([
      CollegeModel.aggregate<{ _id: string; n: number }>([{ $match: { ...published, state: { $nin: ['', null] } } }, { $group: { _id: '$state', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      CollegeModel.aggregate<{ _id: string; n: number }>([{ $match: { ...published, ownership: { $ne: null } } }, { $group: { _id: '$ownership', n: { $sum: 1 } } }]),
      CollegeModel.aggregate<{ _id: string; n: number }>([{ $match: { ...published, category: { $ne: null } } }, { $group: { _id: '$category', n: { $sum: 1 } } }]),
    ]);
    const stateDocs = await LocationModel.find({ kind: 'state', name: { $in: states.map((s) => s._id) } }).select('name slug').lean();
    const slugOf = new Map(stateDocs.map((s) => [s.name, s.slug]));
    return {
      states: states.map((s) => ({ name: s._id, slug: slugOf.get(s._id) ?? null, count: s.n })).filter((s) => s.slug),
      ownership: Object.fromEntries(ownership.map((o) => [o._id, o.n])),
      categories: Object.fromEntries(categories.map((c) => [c._id, c.n])),
      approvals: ['AICTE', 'UGC', 'NAAC', 'NBA', 'NMC', 'PCI', 'BCI', 'INC', 'COA', 'NCTE'],
    };
  });

// Districts of one state with published institutions (for the dependent district filter).
export async function districtsOf(stateSlug: string) {
  return cached(`districts:${stateSlug}`, async () => {
    const st = await LocationModel.findOne({ slug: stateSlug, kind: 'state' }).select('_id name').lean();
    if (!st) throw ApiError.notFound('State not found');
    const districts = await LocationModel.find({ kind: 'district', parents: st._id }).select('name slug').sort({ name: 1 }).lean();
    const counts = new Map((await CollegeModel.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([{ $match: { status: 'published', locationIds: { $in: districts.map((d) => d._id) } } }, { $unwind: '$locationIds' }, { $match: { locationIds: { $in: districts.map((d) => d._id) } } }, { $group: { _id: '$locationIds', n: { $sum: 1 } } }])).map((r) => [String(r._id), r.n]));
    return districts.map((d) => ({ name: d.name, slug: d.slug, count: counts.get(String(d._id)) ?? 0 })).filter((d) => d.count > 0);
  });
}

// The current published fees (one per academic year and intake), newest year first.
function toPublicFee(f: Lean) {
  return {
    id: String(f._id),
    academicYear: f.academicYear,
    intake: f.intake,
    version: f.version,
    paymentSchedule: f.paymentSchedule,
    notes: f.notes,
    effectiveFrom: f.effectiveFrom ?? null,
    lastVerifiedAt: f.lastVerifiedAt ?? null,
    sourceRef: f.sourceRef,
    publishedAt: f.publishedAt ?? null,
    // Annual figures are null when the fee has no recurring yearly or semester component (not comparable per year).
    annualOfficialMinor: (f.annualOfficialMinor as number | null) ?? null,
    hostelAnnualMinor: (f.hostelAnnualMinor as number | null) ?? null,
    breakdown: breakdownOf({
      components: f.components as never,
      durationMonths: f.durationMonths as number,
      consultancyServiceChargeMinor: (f.consultancyServiceChargeMinor as number) ?? 0,
      discount: (f.discount as never) ?? null,
    }),
  };
}

async function offeringsWithFees(collegeIds: mongoose.Types.ObjectId[], courseId?: mongoose.Types.ObjectId) {
  const offerings = (await CollegeCourseModel.find({ college: { $in: collegeIds }, status: 'active', ...(courseId && { course: courseId }) }).sort({ createdAt: 1 }).lean()) as Lean[];
  const fees = (await CollegeFeeModel.find({ collegeCourse: { $in: offerings.map((o) => o._id) }, status: 'published' }).sort({ academicYear: -1, intake: 1 }).lean()) as Lean[];
  const courses = await courseMap(offerings.map((o) => o.course));
  return offerings.map((o) => ({
    id: String(o._id),
    college: String(o.college),
    course: courses.get(String(o.course)) ?? null,
    specialization: o.specialization as string,
    durationMonths: o.durationMonths as number,
    seats: (o.seats as number | null) ?? null,
    eligibilityText: o.eligibilityText as string,
    minPercentage: (o.minPercentage as number | null) ?? null,
    entranceExams: o.entranceExams as string[],
    applicationDeadline: (o.applicationDeadline as Date | null) ?? null,
    admissionProcess: o.admissionProcess as string,
    description: (o.description as string) ?? '',
    mode: (o.mode as string) ?? 'offline',
    minQualification: (o.minQualification as string | null) ?? null,
    imageUrl: pictureUrl(o.imageFile),
    brochureUrl: brochureUrl(o.brochureFile),
    fees: fees.filter((f) => String(f.collegeCourse) === String(o._id)).map(toPublicFee),
  }));
}

// A published college's public profile with its courses and current fees. Anything else is a 404.
export async function collegeDetail(slug: string) {
  const c = (await CollegeModel.findOne({ slug, status: 'published' }).lean()) as Lean | null;
  if (!c) throw ApiError.notFound('College not found');
  const offerings = await offeringsWithFees([c._id]);
  const courses = await courseMap((c.courseIds as unknown[]) ?? []);
  const source = c.source as { name?: string; url?: string; lastSyncedAt?: Date | null; lastSeenAt?: Date | null } | undefined;
  const affiliated = c.affiliatedUniversity as { name?: string; type?: string } | undefined;
  return {
    ...toCollegeCard(c, courses, { stale: await isStale(c) }),
    source: source?.name ? { name: source.name, url: source.url || null, lastSyncedAt: source.lastSyncedAt ?? null, lastSeenAt: source.lastSeenAt ?? null } : null,
    yearEstablished: (c.yearEstablished as number | null) ?? null,
    areaType: (c.areaType as string) ?? '',
    postalCode: (c.postalCode as string) ?? '',
    affiliatedUniversity: affiliated?.name ? { name: affiliated.name, type: affiliated.type ?? '' } : null,
    address: c.address,
    about: c.about,
    accreditations: c.accreditations,
    approvals: c.approvals,
    admissionProcess: c.admissionProcess,
    campusInfo: c.campusInfo,
    placementInfo: c.placementVerified ? c.placementInfo : '',
    contact: c.contact,
    verificationSource: c.verificationSource,
    gallery: galleryView(c),
    eligibility: (c.eligibility as string) ?? '',
    entranceExams: (c.entranceExams as string[]) ?? [],
    facilities: (c.facilities as string[]) ?? [],
    highlights: (c.highlights as string[]) ?? [],
    social: (c.social as Record<string, string> | undefined) ?? {},
    admissionInfo: (c.admissionInfo as string) ?? '',
    brochureUrl: brochureUrl(c.brochureFile),
    offerings,
  };
}

// Side-by-side data for 2-4 published colleges, optionally for one course.
export async function compareColleges({ colleges: slugs, course }: CompareQuery) {
  let courseRef: CourseRef | null = null;
  if (course) {
    const c = await CourseModel.findOne({ slug: course }).lean();
    if (!c) throw ApiError.notFound('Course not found');
    courseRef = { id: String(c._id), name: c.name, slug: c.slug, level: c.level };
  }
  const found = (await CollegeModel.find({ slug: { $in: slugs }, status: 'published' }).lean()) as Lean[];
  if (found.length < 2) throw ApiError.notFound('Choose at least two published colleges to compare');
  const ordered = slugs.map((s) => found.find((c) => c.slug === s)).filter((c): c is Lean => Boolean(c));
  const offerings = await offeringsWithFees(ordered.map((c) => c._id), courseRef ? new mongoose.Types.ObjectId(courseRef.id) : undefined);
  const courses = await courseMap(ordered.flatMap((c) => (c.courseIds as unknown[]) ?? []));
  const stale = await Promise.all(ordered.map(isStale));
  return {
    course: courseRef,
    missing: slugs.filter((s) => !ordered.some((c) => c.slug === s)),
    colleges: ordered.map((c, i) => {
      const card = toCollegeCard(c, courses, { stale: stale[i] });
      const own = offerings.filter((o) => o.college === card.id);
      return { ...card, approvals: c.approvals as string[], offerings: courseRef ? own : [], offering: courseRef ? (own[0] ?? null) : null };
    }),
  };
}
