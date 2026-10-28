import type { Request } from 'express';
import { AuditLogModel } from '../models/AuditLog.js';
import { logger } from '../utils/logger.js';

export type Actor = { user: string | null; role: string; label: string };
export const SYSTEM_ACTOR: Actor = { user: null, role: 'system', label: 'System' };

export const actorFrom = (req: Request): Actor =>
  req.user ? { user: req.user.id, role: req.user.role, label: `${req.user.name} <${req.user.email}>` } : { user: null, role: 'anonymous', label: 'Anonymous' };

// Appends an audit record. A failure is logged loudly but never undoes the action that already happened.
export async function audit(actor: Actor, action: string, target: { type: string; id: string } | null, req?: Request, metadata?: Record<string, unknown>) {
  try {
    await AuditLogModel.create({
      actor,
      action,
      target: target ?? { type: null, id: null },
      ip: req?.ip ?? '',
      requestId: (req as (Request & { id?: string }) | undefined)?.id ?? '',
      metadata: metadata ?? null,
    });
  } catch (err) {
    logger.error({ err: { name: (err as Error).name, message: (err as Error).message }, action }, 'Audit write failed');
  }
}
