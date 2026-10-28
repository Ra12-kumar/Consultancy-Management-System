import type { Request, Response } from 'express';
import * as catalog from '../services/catalog.service.js';
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
