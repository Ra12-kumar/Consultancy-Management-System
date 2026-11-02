import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

const DB_UNAVAILABLE = new Set(['MongoServerSelectionError', 'MongooseServerSelectionError', 'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoNotConnectedError']);

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route ${req.method} ${req.path} not found`));
}

// Turns any error into a safe, consistent response: { success: false, error: { code, message, details? } }.
// Stack traces and internal details stay in the server log.
function normalise(err: unknown): ApiError | null {
  if (err instanceof ApiError) return err;
  if (err instanceof ZodError) {
    return new ApiError(422, 'VALIDATION_ERROR', 'Request validation failed', err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return new ApiError(422, 'VALIDATION_ERROR', 'Request validation failed', Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })));
  }
  if (err instanceof mongoose.Error.CastError) return ApiError.badRequest(`Invalid value for ${err.path}`);
  const e = err as { code?: number; type?: string; name?: string; message?: string };
  if (e?.code === 11000) return ApiError.conflict('A record with these details already exists');
  if (e?.name === 'MulterError') {
    const m = err as { code?: string };
    return m.code === 'LIMIT_FILE_SIZE' ? new ApiError(413, 'FILE_TOO_LARGE', 'The file is too large') : ApiError.badRequest('Upload one file in the "file" field');
  }
  if (e?.type === 'entity.parse.failed') return ApiError.badRequest('Malformed JSON body');
  if (e?.type === 'entity.too.large') return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  if (e?.name && (DB_UNAVAILABLE.has(e.name) || (e.name === 'MongooseError' && /buffering timed out/i.test(e.message ?? '')))) {
    return new ApiError(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable. Please try again shortly.');
  }
  return null;
}

// Express recognises error handlers by their four arguments.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) {
    req.socket?.destroy();
    return;
  }
  const apiError = normalise(err);
  // The request's correlation id (also in the X-Request-Id header and the server log), so a user's report can be
  // matched to the log entry.
  const requestId = (req as Request & { id?: string }).id;
  if (!apiError || apiError.statusCode >= 500) {
    (req.log ?? logger).error({ err, path: req.path, method: req.method, requestId }, apiError ? apiError.message : 'Unhandled error');
  }
  if (!apiError) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' }, requestId });
    return;
  }
  if (apiError.statusCode === 503) res.set('Retry-After', '5');
  res.status(apiError.statusCode).json({ success: false, error: { code: apiError.code, message: apiError.message, ...(apiError.details && { details: apiError.details }) }, requestId });
}
