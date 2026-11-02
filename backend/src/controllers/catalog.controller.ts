import type { Request, Response } from 'express';
import * as media from '../services/collegeMedia.service.js';
import * as offeringSearch from '../services/offeringSearch.service.js';
import * as explorer from '../services/collegeExplorer.service.js';
import * as catalog from '../services/catalog.service.js';
import * as images from '../services/collegeImages.service.js';
import * as collegeDb from '../services/collegeDb.service.js';
import * as directoryAdmin from '../services/directory/directoryAdmin.service.js';
import * as imports from '../services/directory/importJob.service.js';
import { IMPORTERS } from '../services/directory/importers.js';
import * as search from '../services/collegeSearch.service.js';
import * as fees from '../services/fee.service.js';
import * as shortlist from '../services/shortlist.service.js';
import { sendSuccess } from '../utils/response.js';
import type { CollegeInput, CompareQuery, FeeInputBody, ListCollegesQuery, OfferingInput } from '../validators/catalog.validators.js';

const id = (req: Request) => (req.valid.params as { id: string }).id;
const body = <T>(req: Request) => req.valid.body as T;

// ---- Public ----
export async function locations(_req: Request, res: Response) {
  sendSuccess(res, await catalog.publicLocations());
}
export async function courses(_req: Request, res: Response) {
  sendSuccess(res, await catalog.publicCourses());
}
export async function colleges(req: Request, res: Response) {
  const { items, meta } = await search.searchColleges(req.valid.query as ListCollegesQuery);
  sendSuccess(res, items, { meta });
}
export async function college(req: Request, res: Response) {
  sendSuccess(res, await search.collegeDetail((req.valid.params as { slug: string }).slug));
}
export async function compare(req: Request, res: Response) {
  sendSuccess(res, await search.compareColleges(req.valid.query as CompareQuery));
}

// ---- Admin: catalogue (catalog.manage) ----
export async function adminLocations(_req: Request, res: Response) {
  sendSuccess(res, await catalog.adminLocations());
}
export async function createLocation(req: Request, res: Response) {
  sendSuccess(res, await catalog.createLocation(body(req), req), { status: 201 });
}
export async function updateLocation(req: Request, res: Response) {
  sendSuccess(res, await catalog.updateLocation(id(req), body(req), req));
}
export async function deleteLocation(req: Request, res: Response) {
  sendSuccess(res, await catalog.deleteLocation(id(req), req));
}
export async function adminCourses(_req: Request, res: Response) {
  sendSuccess(res, await catalog.adminCourses());
}
export async function createCourse(req: Request, res: Response) {
  sendSuccess(res, await catalog.createCourse(body(req), req), { status: 201 });
}
export async function updateCourse(req: Request, res: Response) {
  sendSuccess(res, await catalog.updateCourse(id(req), body(req), req));
}
export async function deleteCourse(req: Request, res: Response) {
  sendSuccess(res, await catalog.deleteCourse(id(req), req));
}
export async function adminColleges(req: Request, res: Response) {
  const { items, meta } = await catalog.adminColleges(req.valid.query as Parameters<typeof catalog.adminColleges>[0]);
  sendSuccess(res, items, { meta });
}
// ---- College photos and featured order ----
const imageId = (req: Request) => (req.valid.params as { imageId: string }).imageId;
// College logo and brochure; course picture and brochure (admin uploads), and the public brochure file.
export const uploadMedia = (slot: media.MediaSlot) => async (req: Request, res: Response) => {
  sendSuccess(res, await media.setMedia(req, slot, id(req), req.file), { status: 201 });
};
export const removeMedia = (slot: media.MediaSlot) => async (req: Request, res: Response) => {
  sendSuccess(res, await media.removeMedia(req, slot, id(req)));
};
export async function brochure(req: Request, res: Response) {
  await media.streamBrochure(res, (req.valid.params as { fileId: string }).fileId);
}
export async function deleteCollege(req: Request, res: Response) {
  sendSuccess(res, await media.deleteCollege(req, id(req)));
}
export async function browseOfferings(req: Request, res: Response) {
  const { items, meta } = await offeringSearch.browseOfferings(req.valid.query as offeringSearch.OfferingQuery);
  sendSuccess(res, items, { meta });
}
export async function collegeImage(req: Request, res: Response) {
  await images.streamCollegeImage(res, (req.valid.params as { fileId: string }).fileId);
}
export async function uploadCollegeImage(req: Request, res: Response) {
  sendSuccess(res, await images.uploadCollegeImage(req, id(req), req.file, (req.valid.body as { alt: string }).alt), { status: 201 });
}
export async function replaceCollegeImage(req: Request, res: Response) {
  sendSuccess(res, await images.replaceCollegeImage(req, id(req), imageId(req), req.file));
}
export async function updateCollegeImages(req: Request, res: Response) {
  sendSuccess(res, await images.updateCollegeImages(req, id(req), req.valid.body as { order?: string[]; primary?: string; alts?: Record<string, string> }));
}
export async function deleteCollegeImage(req: Request, res: Response) {
  sendSuccess(res, await images.deleteCollegeImage(req, id(req), imageId(req)));
}
export async function featuredOrder(_req: Request, res: Response) {
  sendSuccess(res, await images.featuredColleges());
}
export async function setFeaturedOrder(req: Request, res: Response) {
  sendSuccess(res, await images.setFeaturedOrder(req, (req.valid.body as { ids: string[] }).ids));
}

export async function adminCollege(req: Request, res: Response) {
  sendSuccess(res, await catalog.adminCollege(id(req)));
}
export async function createCollege(req: Request, res: Response) {
  sendSuccess(res, await catalog.createCollege(body<CollegeInput>(req), req), { status: 201 });
}
export async function updateCollege(req: Request, res: Response) {
  sendSuccess(res, await catalog.updateCollege(id(req), body<Partial<CollegeInput>>(req), req));
}
export const collegeStatus = (action: 'publish' | 'archive' | 'restore') => async (req: Request, res: Response) => {
  sendSuccess(res, await catalog.setCollegeStatus(id(req), action, req));
};
export async function createOffering(req: Request, res: Response) {
  sendSuccess(res, await catalog.createOffering(id(req), body<OfferingInput>(req), req), { status: 201 });
}
export async function updateOffering(req: Request, res: Response) {
  sendSuccess(res, await catalog.updateOffering(id(req), body(req), req));
}
export async function deleteOffering(req: Request, res: Response) {
  sendSuccess(res, await catalog.deleteOffering(id(req), req));
}

// ---- Admin: pricing (pricing.manage) ----
export async function listFees(req: Request, res: Response) {
  sendSuccess(res, await fees.listFees(id(req)));
}
export async function createFee(req: Request, res: Response) {
  sendSuccess(res, await fees.createFeeDraft(id(req), body<FeeInputBody>(req), req), { status: 201 });
}
export async function updateFee(req: Request, res: Response) {
  sendSuccess(res, await fees.updateFeeDraft(id(req), body<FeeInputBody>(req), req));
}
export async function publishFee(req: Request, res: Response) {
  sendSuccess(res, await fees.publishFee(id(req), req));
}
export async function archiveFee(req: Request, res: Response) {
  sendSuccess(res, await fees.archiveFee(id(req), req));
}
export function previewFee(req: Request, res: Response) {
  sendSuccess(res, fees.previewFee(body(req)));
}

// ---- Student: shortlist and saved comparisons ----
export async function myShortlist(req: Request, res: Response) {
  sendSuccess(res, await shortlist.listShortlist(req));
}
export async function addShortlist(req: Request, res: Response) {
  sendSuccess(res, await shortlist.addToShortlist(req, body(req)), { status: 201 });
}
export async function removeShortlist(req: Request, res: Response) {
  sendSuccess(res, await shortlist.removeFromShortlist(req, (req.valid.params as { collegeId: string }).collegeId));
}
export async function myComparisons(req: Request, res: Response) {
  sendSuccess(res, await shortlist.listComparisons(req));
}
export async function saveComparison(req: Request, res: Response) {
  sendSuccess(res, await shortlist.saveComparison(req, body(req)), { status: 201 });
}
export async function deleteComparison(req: Request, res: Response) {
  sendSuccess(res, await shortlist.deleteComparison(req, id(req)));
}

// ---- Directory ----
export async function directoryFilters(_req: Request, res: Response) {
  const [filters, coverage] = await Promise.all([search.directoryFilters(), search.directoryCoverage()]);
  sendSuccess(res, { ...filters, coverage, externalSearch: collegeDb.collegeDbStatus() });
}
export async function districts(req: Request, res: Response) {
  sendSuccess(res, await search.districtsOf((req.valid.query as { state: string }).state));
}

// ---- Admin: directory data (catalog.manage) ----
type Paged = { page: number; limit: number };
export async function createImport(req: Request, res: Response) {
  sendSuccess(res, await imports.createImportJob(req, req.valid.body as { importer: string; sourceDataDate: Date | null; fullSnapshot: boolean }), { status: 202 });
}
export async function listImports(req: Request, res: Response) {
  const { items, meta } = await imports.listImportJobs(req.valid.query as Paged);
  sendSuccess(res, items, { meta });
}
export async function getImport(req: Request, res: Response) {
  sendSuccess(res, await imports.importJob(id(req)));
}
export async function retryImport(req: Request, res: Response) {
  sendSuccess(res, await imports.retryImportJob(id(req), req), { status: 202 });
}
export function importers(_req: Request, res: Response) {
  sendSuccess(res, IMPORTERS.map((i) => ({ id: i.id, label: i.label, sourceName: i.sourceName, sourceUrl: i.sourceUrl, licence: i.licence, howToGet: i.howToGet, formats: i.formats, requiredColumns: i.required })));
}
export async function reviews(req: Request, res: Response) {
  const { items, meta } = await directoryAdmin.listReviews(req.valid.query as Paged & { kind?: string; status: 'open' | 'resolved' });
  sendSuccess(res, items, { meta });
}
export async function resolveReview(req: Request, res: Response) {
  sendSuccess(res, await directoryAdmin.resolveReview(id(req), body(req), req));
}
export async function staleColleges(req: Request, res: Response) {
  const { items, meta } = await directoryAdmin.staleRecords(req.valid.query as Paged & { reason?: 'not_in_source' | 'verification_due' });
  sendSuccess(res, items, { meta });
}
export async function coverage(_req: Request, res: Response) {
  const [overall, byState] = await Promise.all([search.directoryCoverage(), directoryAdmin.coverageByState()]);
  sendSuccess(res, { overall, byState });
}

// ---- External college search (CollegeDB; server-side key) ----
// Real-time college finder: name, place and branch over the Wikidata list.
export async function exploreColleges(req: Request, res: Response) {
  sendSuccess(res, await explorer.exploreColleges(req.valid.query as explorer.ExplorerQuery));
}
export function explorerBranches(_req: Request, res: Response) {
  sendSuccess(res, explorer.BRANCHES);
}
export async function externalSearch(req: Request, res: Response) {
  sendSuccess(res, await collegeDb.searchCollegeDb((req.valid.query as { q: string }).q));
}
export async function externalCollege(req: Request, res: Response) {
  sendSuccess(res, await collegeDb.lookupCollegeDb(id(req)));
}
