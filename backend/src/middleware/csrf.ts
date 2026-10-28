import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { SESSION_COOKIE } from '../services/session.service.js';
import { ApiError } from '../utils/ApiError.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

// CSRF defence for cookie-authenticated writes (alongside SameSite=Lax cookies): a browser always sends Origin
// (or at least Referer) on cross-site POST/PUT/PATCH/DELETE, so a write that carries the session cookie must
// come from one of our own origins. Requests without the cookie (sign-up, sign-in) are not affected.
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (SAFE.has(req.method) || !req.cookies?.[SESSION_COOKIE]) return next();
  const origin = req.get('origin') ?? (() => {
    try {
      return new URL(req.get('referer') ?? '').origin;
    } catch {
      return null;
    }
  })();
  if (origin && env.CORS_ORIGINS.includes(origin)) return next();
  return next(new ApiError(403, 'CSRF_REJECTED', 'This request was refused for security reasons. Please reload the page and try again.'));
}
