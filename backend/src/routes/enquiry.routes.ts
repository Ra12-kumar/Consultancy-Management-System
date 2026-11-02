import { Router } from 'express';
import * as c from '../controllers/enquiry.controller.js';
import { authenticate, requirePermission, requireRole, requireVerifiedEmail } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as v from '../validators/enquiry.validators.js';

// Student: their own enquiries, applications and appointments. Writes need a verified email address.
const student = [authenticate, requireRole('student')];
const write = [...student, requireVerifiedEmail];

export const enquiryRouter = Router();
enquiryRouter.post('/', ...write, validate({ body: v.createEnquiryBody }), c.createEnquiry);
enquiryRouter.get('/', ...student, c.myEnquiries);
enquiryRouter.get('/:reference', ...student, validate({ params: v.referenceParams }), c.myEnquiry);
enquiryRouter.post('/:reference/messages', ...write, validate({ params: v.referenceParams, body: v.messageBody }), c.studentMessage);
enquiryRouter.post('/:reference/callback-request', ...write, validate({ params: v.referenceParams, body: v.callbackRequestBody }), c.requestCallback);
enquiryRouter.post('/:reference/withdraw', ...write, validate({ params: v.referenceParams, body: v.reasonBody }), c.withdraw);

export const appointmentRouter = Router();
appointmentRouter.get('/', ...student, c.myAppointments);
appointmentRouter.post('/:id/confirm', ...write, validate({ params: v.idParams, body: v.noteBody }), c.appointmentAction('confirm'));
appointmentRouter.post('/:id/reschedule', ...write, validate({ params: v.idParams, body: v.noteBody }), c.appointmentAction('reschedule'));
appointmentRouter.post('/:id/cancel', ...write, validate({ params: v.idParams, body: v.noteBody }), c.appointmentAction('cancel'));

export const admissionRouter = Router();
admissionRouter.get('/', ...student, c.myApplications);

// Mounted inside /api/students (already authenticated).
export const studentUpdatesRouter = Router();
studentUpdatesRouter.get('/me/updates', requireRole('student'), validate({ query: v.updatesQuery }), c.myUpdates);

// Mounted inside /api/admin (already admin-only).
export const adminEnquiryRouter = Router();
const manage = requirePermission('enquiries.manage');
const byId = { params: v.idParams };

adminEnquiryRouter.get('/counsellors', manage, c.counsellors);
adminEnquiryRouter.get('/enquiries', manage, validate({ query: v.adminEnquiriesQuery }), c.list);
// Personal data leaves the system: needs both permissions, and every export is audited.
adminEnquiryRouter.get('/enquiries/export', requirePermission('enquiries.manage', 'reports.export'), validate({ query: v.exportEnquiriesQuery }), c.exportCsv);
adminEnquiryRouter.get('/enquiries/:id', manage, validate(byId), c.detail);
adminEnquiryRouter.patch('/enquiries/:id', manage, validate({ ...byId, body: v.enquiryPatch }), c.update);
adminEnquiryRouter.post('/enquiries/:id/status', manage, validate({ ...byId, body: v.statusBody }), c.status);
adminEnquiryRouter.post('/enquiries/:id/notes', manage, validate({ ...byId, body: v.internalNoteBody }), c.note);
adminEnquiryRouter.post('/enquiries/:id/contact-attempts', manage, validate({ ...byId, body: v.contactAttemptBody }), c.contactAttempt);
adminEnquiryRouter.post('/enquiries/:id/messages', manage, validate({ ...byId, body: v.messageBody }), c.reply);
adminEnquiryRouter.post('/enquiries/:id/documents', manage, validate({ ...byId, body: v.documentsBody }), c.requestDocuments);
adminEnquiryRouter.post('/enquiries/:id/documents/remind', manage, validate(byId), c.remindDocuments);
adminEnquiryRouter.patch('/enquiries/:id/documents/:docId', manage, validate({ params: v.documentParams, body: v.documentPatch }), c.updateDocument);
adminEnquiryRouter.post('/enquiries/:id/applications', manage, validate({ ...byId, body: v.applicationBody }), c.createApplication);
adminEnquiryRouter.post('/enquiries/:id/appointments', manage, validate({ ...byId, body: v.appointmentBody }), c.scheduleAppointment);

adminEnquiryRouter.get('/applications', manage, validate({ query: v.applicationsQuery }), c.listApplications);
adminEnquiryRouter.patch('/applications/:id', manage, validate({ ...byId, body: v.applicationPatch }), c.updateApplication);
// Confirming an admission is a separate, more sensitive permission.
adminEnquiryRouter.post('/applications/:id/confirm-admission', requirePermission('enquiries.manage', 'admissions.confirm'), validate({ ...byId, body: v.confirmAdmissionBody }), c.confirmAdmission);

adminEnquiryRouter.get('/appointments', manage, validate({ query: v.appointmentsQuery }), c.listAppointments);
adminEnquiryRouter.patch('/appointments/:id', manage, validate({ ...byId, body: v.appointmentPatch }), c.updateAppointment);
adminEnquiryRouter.post('/appointments/:id/cancel', manage, validate({ ...byId, body: v.noteBody }), c.closeAppointment('cancel'));
adminEnquiryRouter.post('/appointments/:id/complete', manage, validate({ ...byId, body: v.noteBody }), c.closeAppointment('complete'));
adminEnquiryRouter.post('/appointments/:id/no-show', manage, validate({ ...byId, body: v.noteBody }), c.closeAppointment('no_show'));
