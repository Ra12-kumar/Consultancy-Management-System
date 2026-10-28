import type { Request, Response } from 'express';
import * as students from '../services/student.service.js';
import { sendSuccess } from '../utils/response.js';
import type { ProfileInput } from '../validators/student.validators.js';

const valid = <T>(req: Request, part: 'body' | 'params') => req.valid[part] as T;

export async function getMe(req: Request, res: Response) {
  sendSuccess(res, await students.getMe(req.user!.id));
}
export async function updateMe(req: Request, res: Response) {
  sendSuccess(res, await students.updateMe(req.user!.id, valid(req, 'body')));
}
export async function getMyProfile(req: Request, res: Response) {
  sendSuccess(res, await students.getProfile(req.user!.id));
}
export async function saveMyProfile(req: Request, res: Response) {
  sendSuccess(res, await students.saveProfile(req.user!.id, valid<ProfileInput>(req, 'body')));
}
export async function getStudent(req: Request, res: Response) {
  sendSuccess(res, await students.getStudent(valid<{ id: string }>(req, 'params').id, req.user!));
}
