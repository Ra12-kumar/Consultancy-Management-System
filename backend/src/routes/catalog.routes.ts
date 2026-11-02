import { Router } from 'express';
import * as c from '../controllers/catalog.controller.js';
import { requireAnyPermission, requirePermission, requireRole } from '../middleware/auth.js';
import { externalSearchLimiter } from '../middleware/rateLimits.js';
import { validate } from '../middleware/validate.js';
import { singleUpload } from '../services/files.service.js';
import * as v from '../validators/catalog.validators.js';
import { publicCache } from '../services/cache.service.js';

// Public, read-only catalogue: only active locations/courses and published colleges and fees.
export const catalogRouter = Router();
catalogRouter.get('/locations', publicCache('catalog'), c.locations);
catalogRouter.get('/courses', publicCache('catalog'), c.courses);
// Course browser: active courses of published colleges, with filters.
catalogRouter.get('/courses/offerings', publicCache('catalog'), validate({ query: v.offeringBrowseQuery }), c.browseOfferings);
catalogRouter.get('/colleges', publicCache('catalog'), validate({ query: v.listCollegesQuery }), c.colleges);
catalogRouter.get('/colleges/filters', publicCache('catalog'), c.directoryFilters);
catalogRouter.get('/colleges/districts', publicCache('catalog'), validate({ query: v.districtsQuery }), c.districts);
// Real-time college finder (Wikidata list, searched in memory). Registered before /colleges/:slug.
catalogRouter.get('/colleges/explore', validate({ query: v.explorerQuery }), c.exploreColleges);
catalogRouter.get('/colleges/explore/branches', c.explorerBranches);
// Third-party name search (CollegeDB). Registered before /colleges/:slug.
catalogRouter.get('/colleges/search', externalSearchLimiter, validate({ query: v.externalSearchQuery }), c.externalSearch);
catalogRouter.get('/colleges/external/:id', externalSearchLimiter, validate({ params: v.externalIdParams }), c.externalCollege);
catalogRouter.get('/colleges/compare', publicCache('catalog'), validate({ query: v.compareQuery }), c.compare);
// College photos uploaded by admins (public pictures; only files stored as college photos).
catalogRouter.get('/colleges/images/:fileId', validate({ params: v.imageFileParams }), c.collegeImage);
catalogRouter.get('/colleges/brochures/:fileId', validate({ params: v.imageFileParams }), c.brochure);
catalogRouter.get('/colleges/:slug', publicCache('catalog'), validate({ params: v.slugParams }), c.college);

// Mounted inside /api/admin (already admin-only). Catalogue and pricing are separate permissions.
export const adminCatalogRouter = Router();
const catalog = requirePermission('catalog.manage');
const pricing = requirePermission('pricing.manage');
const byId = { params: v.idParams };

adminCatalogRouter.get('/locations', catalog, c.adminLocations);
adminCatalogRouter.post('/locations', catalog, validate({ body: v.locationBody }), c.createLocation);
adminCatalogRouter.patch('/locations/:id', catalog, validate({ ...byId, body: v.locationPatch }), c.updateLocation);
adminCatalogRouter.delete('/locations/:id', catalog, validate(byId), c.deleteLocation);

adminCatalogRouter.get('/courses', catalog, c.adminCourses);
adminCatalogRouter.post('/courses', catalog, validate({ body: v.courseBody }), c.createCourse);
adminCatalogRouter.patch('/courses/:id', catalog, validate({ ...byId, body: v.coursePatch }), c.updateCourse);
adminCatalogRouter.delete('/courses/:id', catalog, validate(byId), c.deleteCourse);

adminCatalogRouter.get('/colleges', catalog, validate({ query: v.adminCollegesQuery }), c.adminColleges);
adminCatalogRouter.post('/colleges', catalog, validate({ body: v.collegeBody }), c.createCollege);
// Featured colleges and their order (registered before /colleges/:id).
adminCatalogRouter.get('/colleges/featured', catalog, c.featuredOrder);
adminCatalogRouter.put('/colleges/featured', catalog, validate({ body: v.featuredOrderBody }), c.setFeaturedOrder);
// Pricing admins also need to read a college and its offerings to manage fees.
adminCatalogRouter.get('/colleges/:id', requireAnyPermission('catalog.manage', 'pricing.manage'), validate(byId), c.adminCollege);
adminCatalogRouter.patch('/colleges/:id', catalog, validate({ ...byId, body: v.collegePatch }), c.updateCollege);
// Photo gallery: JPEG, PNG or WebP up to 5 MB each, at most 12 per college.
adminCatalogRouter.post('/colleges/:id/images', catalog, singleUpload(5), validate({ ...byId, body: v.collegeImageBody }), c.uploadCollegeImage);
adminCatalogRouter.patch('/colleges/:id/images', catalog, validate({ ...byId, body: v.collegeImagesPatch }), c.updateCollegeImages);
adminCatalogRouter.put('/colleges/:id/images/:imageId', catalog, singleUpload(5), validate({ params: v.collegeImageParams }), c.replaceCollegeImage);
adminCatalogRouter.delete('/colleges/:id/images/:imageId', catalog, validate({ params: v.collegeImageParams }), c.deleteCollegeImage);
adminCatalogRouter.delete('/colleges/:id', catalog, validate(byId), c.deleteCollege);
// Logo (JPEG/PNG/WebP, 5 MB) and brochure (PDF, 10 MB) for a college; picture and brochure for a course offering.
adminCatalogRouter.post('/colleges/:id/logo', catalog, singleUpload(5), validate(byId), c.uploadMedia('college:logo'));
adminCatalogRouter.delete('/colleges/:id/logo', catalog, validate(byId), c.removeMedia('college:logo'));
adminCatalogRouter.post('/colleges/:id/brochure', catalog, singleUpload(10), validate(byId), c.uploadMedia('college:brochure'));
adminCatalogRouter.delete('/colleges/:id/brochure', catalog, validate(byId), c.removeMedia('college:brochure'));
adminCatalogRouter.post('/offerings/:id/image', catalog, singleUpload(5), validate(byId), c.uploadMedia('offering:image'));
adminCatalogRouter.delete('/offerings/:id/image', catalog, validate(byId), c.removeMedia('offering:image'));
adminCatalogRouter.post('/offerings/:id/brochure', catalog, singleUpload(10), validate(byId), c.uploadMedia('offering:brochure'));
adminCatalogRouter.delete('/offerings/:id/brochure', catalog, validate(byId), c.removeMedia('offering:brochure'));
adminCatalogRouter.post('/colleges/:id/publish', catalog, validate(byId), c.collegeStatus('publish'));
adminCatalogRouter.post('/colleges/:id/archive', catalog, validate(byId), c.collegeStatus('archive'));
adminCatalogRouter.post('/colleges/:id/restore', catalog, validate(byId), c.collegeStatus('restore'));
adminCatalogRouter.post('/colleges/:id/offerings', catalog, validate({ ...byId, body: v.offeringBody }), c.createOffering);
adminCatalogRouter.patch('/offerings/:id', catalog, validate({ ...byId, body: v.offeringPatch }), c.updateOffering);
adminCatalogRouter.delete('/offerings/:id', catalog, validate(byId), c.deleteOffering);

// Directory data: imports from authorised sources (AISHE files uploaded by an admin), the review queue for
// possible duplicates and field conflicts, stale records and coverage. Imports run in the background (202).
adminCatalogRouter.get('/college-importers', catalog, c.importers);
adminCatalogRouter.get('/college-imports', catalog, validate({ query: v.importJobsQuery }), c.listImports);
adminCatalogRouter.post('/college-imports', catalog, singleUpload(60), validate({ body: v.collegeImportBody }), c.createImport);
adminCatalogRouter.get('/college-imports/:id', catalog, validate(byId), c.getImport);
adminCatalogRouter.post('/college-imports/:id/retry', catalog, validate(byId), c.retryImport);
adminCatalogRouter.get('/directory/reviews', catalog, validate({ query: v.reviewsQuery }), c.reviews);
adminCatalogRouter.post('/directory/reviews/:id/resolve', catalog, validate({ ...byId, body: v.resolveReviewBody }), c.resolveReview);
adminCatalogRouter.get('/directory/stale', catalog, validate({ query: v.staleQuery }), c.staleColleges);
adminCatalogRouter.get('/directory/coverage', catalog, c.coverage);

adminCatalogRouter.post('/fees/preview', pricing, validate({ body: v.feePreviewBody }), c.previewFee);
adminCatalogRouter.get('/offerings/:id/fees', pricing, validate(byId), c.listFees);
adminCatalogRouter.post('/offerings/:id/fees', pricing, validate({ ...byId, body: v.feeBody }), c.createFee);
adminCatalogRouter.put('/fees/:id', pricing, validate({ ...byId, body: v.feeBody }), c.updateFee);
adminCatalogRouter.post('/fees/:id/publish', pricing, validate(byId), c.publishFee);
adminCatalogRouter.post('/fees/:id/archive', pricing, validate(byId), c.archiveFee);

// Mounted inside /api/students (already authenticated): the signed-in student's own shortlist and comparisons.
// Checks are per route so other /students routes (e.g. admins reading /students/:id) are unaffected.
export const studentCatalogRouter = Router();
const student = requireRole('student');
studentCatalogRouter.get('/me/shortlist', student, c.myShortlist);
studentCatalogRouter.post('/me/shortlist', student, validate({ body: v.shortlistBody }), c.addShortlist);
studentCatalogRouter.delete('/me/shortlist/:collegeId', student, validate({ params: v.collegeIdParams }), c.removeShortlist);
studentCatalogRouter.get('/me/comparisons', student, c.myComparisons);
studentCatalogRouter.post('/me/comparisons', student, validate({ body: v.comparisonBody }), c.saveComparison);
studentCatalogRouter.delete('/me/comparisons/:id', student, validate(byId), c.deleteComparison);
