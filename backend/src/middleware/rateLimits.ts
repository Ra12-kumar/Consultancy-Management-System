import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';
import { RedisFallbackStore, retryAfterSeconds } from './rateLimitStore.js';

// 429 answer with Retry-After (seconds) so clients know when to try again.
export const limited = (message: string, windowMs: number) => (req: Request, res: Response) => {
  res.setHeader('Retry-After', String(retryAfterSeconds((req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime, windowMs)));
  res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message } });
};

const emailKey = (req: Request) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  return crypto.createHash('sha256').update(email).digest('hex').slice(0, 24);
};

// Every limiter has its own name: its counters live in Redis under that name (shared by all API instances),
// or in this process's memory when Redis is not available.
export const makeLimiter = (name: string, windowMs: number, limit: number, key: (req: Request) => string, message: string) =>
  rateLimit({ windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: key, handler: limited(message, windowMs), store: new RedisFallbackStore(name) });

const ip = (req: Request) => ipKeyGenerator(req.ip ?? '');

// Sign-in: per IP and per account (shared through Redis when configured; see docs/security.md).
export const loginLimiter = [
  makeLimiter('login-ip', 15 * 60_000, env.LOGIN_RATE_LIMIT * 3, ip, 'Too many sign-in attempts from this network. Please wait and try again.'),
  makeLimiter('login-account', 15 * 60_000, env.LOGIN_RATE_LIMIT, (req) => `login:${emailKey(req)}`, 'Too many sign-in attempts. Please wait 15 minutes and try again.'),
];
export const registerLimiter = makeLimiter('register-ip', 60 * 60_000, env.LOGIN_RATE_LIMIT, ip, 'Too many registrations from this network. Please try again later.');
// Emails sent on request (verification resend, password reset): per account and per IP.
export const emailRequestLimiter = [
  makeLimiter('mail-ip', 60 * 60_000, env.AUTH_RATE_LIMIT * 4, ip, 'Too many requests. Please try again later.'),
  makeLimiter('mail-account', 60 * 60_000, env.AUTH_RATE_LIMIT, (req) => `mail:${emailKey(req)}`, 'Too many requests for this email. Please try again later.'),
];
export const tokenLimiter = makeLimiter('token-ip', 15 * 60_000, 30, ip, 'Too many attempts. Please try again later.');
// Email codes: per IP and per email address (each code also stops working after 5 wrong guesses).
export const otpLimiter = [
  makeLimiter('otp-ip', 15 * 60_000, env.LOGIN_RATE_LIMIT * 3, ip, 'Too many attempts. Please try again later.'),
  makeLimiter('otp-account', 15 * 60_000, env.LOGIN_RATE_LIMIT, (req) => `otp:${emailKey(req)}`, 'Too many attempts for this email. Please wait 15 minutes and request a new code.'),
];
// Third-party college search: each call can spend the provider's small daily quota, so it is limited per IP.
export const externalSearchLimiter = makeLimiter('external-search-ip', 10 * 60_000, 30, ip, 'Too many searches. Please wait a few minutes and try again.');
// Every API request: per IP.
export const apiLimiter = makeLimiter('api-ip', 15 * 60_000, env.API_RATE_LIMIT, ip, 'Too many requests, please try again later');
