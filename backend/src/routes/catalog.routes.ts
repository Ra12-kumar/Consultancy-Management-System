import { Router } from 'express';
import * as c from '../controllers/catalog.controller.js';
import { requireAnyPermission, requirePermission, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as v from '../validators/catalog.validators.js';

// Public, read-only catalogue: only active locations/courses and published colleges and fees.
export const catalogRouter = Router();
catalogRouter.get('/locations', c.locations);
catalogRouter.get('/courses', c.courses);
catalogRouter.get('/colleges', validate({ query: v.listCollegesQuery }), c.colleges);
catalogRouter.get('/colleges/compare', validate({ query: v.compareQuery }), c.compare);
catalogRouter.get('/colleges/:slug', validate({ params: v.slugParams }), c.college);

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
// Pricing admins also need to read a college and its offerings to manage fees.
adminCatalogRouter.get('/colleges/:id', requireAnyPermission('catalog.manage', 'pricing.manage'), validate(byId), c.adminCollege);
adminCatalogRouter.patch('/colleges/:id', catalog, validate({ ...byId, body: v.collegePatch }), c.updateCollege);
adminCatalogRouter.post('/colleges/:id/publish', catalog, validate(byId), c.collegeStatus('publish'));
adminCatalogRouter.post('/colleges/:id/archive', catalog, validate(byId), c.collegeStatus('archive'));
adminCatalogRouter.post('/colleges/:id/restore', catalog, validate(byId), c.collegeStatus('restore'));
adminCatalogRouter.post('/colleges/:id/offerings', catalog, validate({ ...byId, body: v.offeringBody }), c.createOffering);
adminCatalogRouter.patch('/offerings/:id', catalog, validate({ ...byId, body: v.offeringPatch }), c.updateOffering);
adminCatalogRouter.delete('/offerings/:id', catalog, validate(byId), c.deleteOffering);

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
