import type { Request, Response } from 'express';
import type { Permission } from '../models/User.js';
import * as admin from '../services/admin.service.js';
import * as invites from '../services/inviteCode.service.js';
import { sendSuccess } from '../utils/response.js';

type Page = { page: number; limit: number };

export async function summary(req: Request, res: Response) {
  sendSuccess(res, await admin.dashboardSummary(req.valid.query as Parameters<typeof admin.dashboardSummary>[0]));
}
export async function students(req: Request, res: Response) {
  const { items, meta } = await admin.listStudents(req.valid.query as Parameters<typeof admin.listStudents>[0]);
  sendSuccess(res, items, { meta });
}
export async function admins(_req: Request, res: Response) {
  sendSuccess(res, await admin.listAdmins());
}
export async function inviteAdmin(req: Request, res: Response) {
  sendSuccess(res, await admin.inviteAdminByAdmin(req.valid.body as { name: string; email: string; permissions: Permission[] }, req), { status: 201 });
}
// Invitation codes for staff sign-up (Counsellor or Admin). The plain code is returned only once, here.
export async function inviteCodes(_req: Request, res: Response) {
  sendSuccess(res, await invites.listInviteCodes());
}
export async function createInviteCode(req: Request, res: Response) {
  sendSuccess(res, await invites.createInviteByAdmin(req.valid.body as Parameters<typeof invites.createInviteByAdmin>[0], req), { status: 201 });
}
export async function revokeInviteCode(req: Request, res: Response) {
  sendSuccess(res, await invites.revokeInviteCode((req.valid.params as { id: string }).id, req));
}
export async function setPermissions(req: Request, res: Response) {
  const { id } = req.valid.params as { id: string };
  const { permissions } = req.valid.body as { permissions: Permission[] };
  sendSuccess(res, await admin.setAdminPermissions(id, permissions, req));
}
export async function deliveries(req: Request, res: Response) {
  const { items, meta } = await admin.listDeliveries(req.valid.query as Page & { status?: string; template?: string });
  sendSuccess(res, items, { meta });
}
export function emailStatus(_req: Request, res: Response) {
  sendSuccess(res, admin.emailStatus());
}
export async function auditLogs(req: Request, res: Response) {
  const { items, meta } = await admin.listAuditLogs(req.valid.query as Page & { action?: string });
  sendSuccess(res, items, { meta });
}
