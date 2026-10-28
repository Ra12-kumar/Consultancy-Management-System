import type { Request, Response } from 'express';
import * as apps from '../services/application.service.js';
import * as appts from '../services/appointment.service.js';
import * as admin from '../services/enquiryAdmin.service.js';
import * as student from '../services/enquiry.service.js';
import { sendSuccess } from '../utils/response.js';
import type { CreateEnquiryInput } from '../validators/enquiry.validators.js';

const id = (req: Request) => (req.valid.params as { id: string }).id;
const ref = (req: Request) => (req.valid.params as { reference: string }).reference;
const body = <T = any>(req: Request) => req.valid.body as T; // eslint-disable-line @typescript-eslint/no-explicit-any
const query = <T = any>(req: Request) => req.valid.query as T; // eslint-disable-line @typescript-eslint/no-explicit-any

// ---- Student ----
export async function createEnquiry(req: Request, res: Response) {
  const { enquiry, duplicate } = await student.createEnquiry(req, body<CreateEnquiryInput>(req));
  sendSuccess(res, { ...enquiry, duplicate }, { status: duplicate ? 200 : 201 });
}
export async function myEnquiries(req: Request, res: Response) {
  sendSuccess(res, await student.listMyEnquiries(req));
}
export async function myEnquiry(req: Request, res: Response) {
  sendSuccess(res, await student.getMyEnquiry(req, ref(req)));
}
export async function studentMessage(req: Request, res: Response) {
  sendSuccess(res, await student.studentMessage(req, ref(req), body(req).body), { status: 201 });
}
export async function withdraw(req: Request, res: Response) {
  sendSuccess(res, await student.withdrawEnquiry(req, ref(req), body(req).reason));
}
export async function myUpdates(req: Request, res: Response) {
  const { items, meta } = await student.myUpdates(req, query(req));
  sendSuccess(res, items, { meta });
}
export async function myApplications(req: Request, res: Response) {
  sendSuccess(res, await student.myApplications(req));
}
export async function myAppointments(req: Request, res: Response) {
  sendSuccess(res, await appts.myAppointments(req));
}
export const appointmentAction = (action: 'confirm' | 'reschedule' | 'cancel') => async (req: Request, res: Response) => {
  sendSuccess(res, await appts.studentAppointmentAction(req, id(req), action, (body(req)?.note as string) ?? ''));
};

// ---- Admin ----
export async function list(req: Request, res: Response) {
  const { items, meta } = await admin.listEnquiries(req, query(req));
  sendSuccess(res, items, { meta });
}
export async function detail(req: Request, res: Response) {
  sendSuccess(res, await admin.enquiryDetail(id(req)));
}
export async function counsellors(_req: Request, res: Response) {
  sendSuccess(res, await admin.listCounsellors());
}
export async function update(req: Request, res: Response) {
  sendSuccess(res, await admin.updateEnquiry(id(req), body(req), req));
}
export async function status(req: Request, res: Response) {
  sendSuccess(res, await admin.changeStatus(id(req), body(req), req));
}
export async function note(req: Request, res: Response) {
  sendSuccess(res, await admin.addNote(id(req), body(req).body, req), { status: 201 });
}
export async function contactAttempt(req: Request, res: Response) {
  sendSuccess(res, await admin.addContactAttempt(id(req), body(req), req), { status: 201 });
}
export async function reply(req: Request, res: Response) {
  sendSuccess(res, await admin.replyToStudent(id(req), body(req).body, req), { status: 201 });
}
export async function requestDocuments(req: Request, res: Response) {
  sendSuccess(res, await admin.requestDocuments(id(req), body(req), req), { status: 201 });
}
export async function updateDocument(req: Request, res: Response) {
  const { id: enquiryId, docId } = req.valid.params as { id: string; docId: string };
  sendSuccess(res, await admin.updateDocument(enquiryId, docId, body(req), req));
}
export async function remindDocuments(req: Request, res: Response) {
  sendSuccess(res, await admin.remindDocuments(id(req)));
}
export async function createApplication(req: Request, res: Response) {
  sendSuccess(res, await apps.createApplication(id(req), body(req), req), { status: 201 });
}
export async function updateApplication(req: Request, res: Response) {
  sendSuccess(res, await apps.updateApplication(id(req), body(req), req));
}
export async function confirmAdmission(req: Request, res: Response) {
  sendSuccess(res, await apps.confirmAdmission(id(req), body(req), req));
}
export async function listApplications(req: Request, res: Response) {
  const { items, meta } = await apps.listApplications(query(req));
  sendSuccess(res, items, { meta });
}
export async function scheduleAppointment(req: Request, res: Response) {
  sendSuccess(res, await appts.scheduleAppointment(id(req), body(req), req), { status: 201 });
}
export async function updateAppointment(req: Request, res: Response) {
  sendSuccess(res, await appts.updateAppointment(id(req), body(req), req));
}
export const closeAppointment = (action: 'cancel' | 'complete' | 'no_show') => async (req: Request, res: Response) => {
  sendSuccess(res, await appts.closeAppointment(id(req), action, (body(req)?.note as string) ?? '', req));
};
export async function listAppointments(req: Request, res: Response) {
  const { items, meta } = await appts.listAppointments(req, query(req));
  sendSuccess(res, items, { meta });
}
