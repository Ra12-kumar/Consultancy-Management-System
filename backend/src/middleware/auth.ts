import type { NextFunction, Request, Response } from 'express';
import type { Permission, Role } from '../models/User.js';
import { sessionUser } from '../services/session.service.js';
import { ApiError } from '../utils/ApiError.js';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions: Permission[];
  emailVerified: boolean;
  sessionId: string;
};

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

// Requires a valid session cookie. The user (and role) always come from the database, never the request.
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const found = await sessionUser(req);
  if (!found) return next(ApiError.unauthorized('Please sign in to continue'));
  const u = found.user;
  req.user = {
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role as Role,
    permissions: (u.role === 'admin' ? u.permissions : []) as Permission[],
    emailVerified: Boolean(u.emailVerifiedAt),
    sessionId: found.sessionId,
  };
  return next();
}

export function requireRole(...roles: Role[]) {
  const mw = (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    return next();
  };
  return Object.assign(mw, { openapi: { roles } });
}

// Admin with a specific permission (least privilege).
export function requirePermission(...permissions: Permission[]) {
  const mw = (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (req.user.role !== 'admin' || !permissions.every((p) => req.user!.permissions.includes(p))) return next(ApiError.forbidden());
    return next();
  };
  return Object.assign(mw, { openapi: { permissions, all: true } });
}

// Admin with at least one of the permissions (e.g. pricing admins reading the college they price).
export function requireAnyPermission(...permissions: Permission[]) {
  const mw = (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (req.user.role !== 'admin' || !permissions.some((p) => req.user!.permissions.includes(p))) return next(ApiError.forbidden());
    return next();
  };
  return Object.assign(mw, { openapi: { permissions, all: false } });
}

// For sensitive student actions (enquiries, applications) from Stage 3 on.
export function requireVerifiedEmail(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(ApiError.unauthorized());
  if (!req.user.emailVerified) return next(new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Please verify your email address first'));
  return next();
}

// Read by the OpenAPI generator (services/openapi.ts).
Object.assign(authenticate, { openapi: { auth: true } });
Object.assign(requireVerifiedEmail, { openapi: { verified: true } });
