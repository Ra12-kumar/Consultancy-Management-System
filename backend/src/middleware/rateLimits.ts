import crypto from 'node:crypto';
import type { Request } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';

const limited = (message: string) => (_req: Request, res: import('express').Response) =>
  res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message } });

const emailKey = (req: Request) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  return crypto.createHash('sha256').update(email).digest('hex').slice(0, 24);
};

const make = (windowMs: number, limit: number, key: (req: Request) => string, message: string) =>
  rateLimit({ windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: key, handler: limited(message) });

const ip = (req: Request) => ipKeyGenerator(req.ip ?? '');

// Sign-in: per IP and per account (in-memory per server process; see docs/security.md).
export const loginLimiter = [
  make(15 * 60_000, env.LOGIN_RATE_LIMIT * 3, ip, 'Too many sign-in attempts from this network. Please wait and try again.'),
  make(15 * 60_000, env.LOGIN_RATE_LIMIT, (req) => `login:${emailKey(req)}`, 'Too many sign-in attempts. Please wait 15 minutes and try again.'),
];
export const registerLimiter = make(60 * 60_000, env.LOGIN_RATE_LIMIT, ip, 'Too many registrations from this network. Please try again later.');
// Emails sent on request (verification resend, password reset): per account and per IP.
export const emailRequestLimiter = [
  make(60 * 60_000, env.AUTH_RATE_LIMIT * 4, ip, 'Too many requests. Please try again later.'),
  make(60 * 60_000, env.AUTH_RATE_LIMIT, (req) => `mail:${emailKey(req)}`, 'Too many requests for this email. Please try again later.'),
];
export const tokenLimiter = make(15 * 60_000, 30, ip, 'Too many attempts. Please try again later.');
