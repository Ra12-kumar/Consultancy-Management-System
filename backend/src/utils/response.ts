import type { Response } from 'express';

// Every successful response has the same shape: { success: true, data, meta? }.
export function sendSuccess<T>(res: Response, data: T, { status = 200, meta }: { status?: number; meta?: Record<string, unknown> } = {}) {
  return res.status(status).json(meta ? { success: true, data, meta } : { success: true, data });
}
