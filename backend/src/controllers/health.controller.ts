import type { Request, Response } from 'express';
import { databaseState } from '../config/database.js';
import { mailStatus } from '../config/mail.js';
import { redisState } from '../config/redis.js';
import { sendSuccess } from '../utils/response.js';

// Liveness: the process is up (never checks dependencies, so a database outage cannot cause restarts).
export function liveness(_req: Request, res: Response) {
  sendSuccess(res, { status: 'ok', service: 'education-consultancy-api', uptimeSeconds: Math.round(process.uptime()) });
}

// Readiness: can serve requests that need the database. Reports only states, never hosts, names or credentials.
export function readiness(_req: Request, res: Response) {
  const connected = databaseState() === 'connected';
  sendSuccess(res, { status: connected ? 'ready' : 'unavailable', database: connected ? 'connected' : 'unavailable', mail: mailStatus(), cache: redisState() }, { status: connected ? 200 : 503 });
}
