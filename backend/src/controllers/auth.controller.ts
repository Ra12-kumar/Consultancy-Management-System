import type { Request, Response } from 'express';
import { mailStatus } from '../config/mail.js';
import { UserModel, toPublicUser } from '../models/User.js';
import * as auth from '../services/auth.service.js';
import { endAllSessions, endSession } from '../services/session.service.js';
import { sendSuccess } from '../utils/response.js';

type Body<T> = Request & { valid: { body: T } };
const body = <T>(req: Request) => (req as Body<T>).valid.body;

// Codes can only reach students when email is configured; never claim a code was sent when it cannot be.
const emailAvailable = () => mailStatus() === 'smtp';
const NO_EMAIL = 'We could not email your code because email delivery is not set up yet. Please contact us to activate your account.';

// Same answer whether the email is new or already registered (no account enumeration).
export async function register(req: Request, res: Response) {
  await auth.register(body(req), req);
  sendSuccess(res, { message: emailAvailable() ? 'We have sent a 6-digit code to your email. Enter it to activate your account.' : NO_EMAIL, emailDelivery: emailAvailable() }, { status: 201 });
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

export async function verifyOtp(req: Request, res: Response) {
  sendSuccess(res, await auth.verifyOtp(body<{ email: string; code: string }>(req), req, res));
}

export async function resendVerification(req: Request, res: Response) {
  await auth.resendVerification(body<{ email: string }>(req).email);
  sendSuccess(res, { message: emailAvailable() ? 'If that account exists and is not verified yet, we have sent a new code. You can request another one after a minute.' : NO_EMAIL, emailDelivery: emailAvailable() });
}

// Whether verification emails can be sent at all (the same answer for everyone, so it reveals no account).
export function emailDelivery(_req: Request, res: Response) {
  sendSuccess(res, { available: emailAvailable() });
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
