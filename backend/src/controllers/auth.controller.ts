import type { Request, Response } from 'express';
import { UserModel, toPublicUser } from '../models/User.js';
import * as auth from '../services/auth.service.js';
import { endAllSessions, endSession } from '../services/session.service.js';
import { sendSuccess } from '../utils/response.js';

type Body<T> = Request & { valid: { body: T } };
const body = <T>(req: Request) => (req as Body<T>).valid.body;

// Same answer whether the email is new or already registered (no account enumeration).
export async function register(req: Request, res: Response) {
  await auth.register(body(req), req);
  sendSuccess(res, { message: 'Account created. Please check your email to verify your address before signing in.' }, { status: 201 });
}

export async function login(req: Request, res: Response) {
  sendSuccess(res, await auth.login(body(req), req, res));
}

export async function logout(req: Request, res: Response) {
  await endSession(req, res);
  sendSuccess(res, { signedOut: true });
}

export async function logoutAll(req: Request, res: Response) {
  await endAllSessions(req.user!.id);
  await endSession(req, res);
  sendSuccess(res, { signedOut: true });
}

export async function me(req: Request, res: Response) {
  const user = await UserModel.findById(req.user!.id).lean();
  sendSuccess(res, { user: user ? toPublicUser(user) : null });
}

export async function verifyEmail(req: Request, res: Response) {
  sendSuccess(res, { user: await auth.verifyEmail(body<{ token: string }>(req).token, req) });
}

export async function resendVerification(req: Request, res: Response) {
  await auth.resendVerification(body<{ email: string }>(req).email);
  sendSuccess(res, { message: 'If that account exists and is not verified yet, we have sent a new verification link.' });
}

export async function forgotPassword(req: Request, res: Response) {
  await auth.forgotPassword(body<{ email: string }>(req).email);
  sendSuccess(res, { message: 'If an account exists for that email, we have sent a password reset link.' });
}

export async function resetPassword(req: Request, res: Response) {
  const { token, password } = body<{ token: string; password: string }>(req);
  await auth.resetPassword(token, password, req);
  sendSuccess(res, { message: 'Your password has been changed. Please sign in with your new password.' });
}

export async function setPassword(req: Request, res: Response) {
  const { token, password } = body<{ token: string; password: string }>(req);
  await auth.setPassword(token, password, req);
  sendSuccess(res, { message: 'Your password is set. You can now sign in.' });
}

export async function changePassword(req: Request, res: Response) {
  await auth.changePassword(req.user!.id, body(req), req, res);
  sendSuccess(res, { message: 'Password changed. Other devices have been signed out.' });
}
