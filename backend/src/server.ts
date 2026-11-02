import type { Server } from 'node:http';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { connectRedis, disconnectRedis } from './config/redis.js';
import { mailStatus, verifyMailTransport } from './config/mail.js';
import { createApp } from './app.js';
import { startAppointmentReminders, stopAppointmentReminders } from './services/appointment.service.js';
import { kickImports, recoverInterruptedImports } from './services/directory/importJob.service.js';
import { startEmailWorker, stopEmailWorker } from './services/emailWorker.js';
import { loadTemplateOverrides } from './services/settings.service.js';
import { logger } from './utils/logger.js';

let server: Server | null = null;
let stopping: Promise<void> | null = null;

// Graceful, bounded, run-once shutdown: stop accepting requests, let in-flight ones finish, close MongoDB.
function shutdown(reason: string, exitCode = 0) {
  if (stopping) return stopping;
  logger[exitCode ? 'fatal' : 'info']({ reason }, 'Shutting down');
  const force = setTimeout(() => process.exit(exitCode || 1), 8000);
  force.unref();
  stopping = (async () => {
    stopEmailWorker();
    stopAppointmentReminders();
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await disconnectRedis();
    await disconnectDatabase().catch((err: Error) => logger.warn({ err: { name: err.name, message: err.message } }, 'MongoDB did not close cleanly during shutdown'));
    process.exit(exitCode);
  })();
  return stopping;
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  void shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  void shutdown('uncaughtException', 1);
});

async function start() {
  try {
    await connectDatabase();
  } catch (err) {
    const e = err as Error;
    logger.fatal({ err: { name: e.name, message: e.message } }, 'Could not connect to MongoDB');
    process.exit(1);
  }
  // Optional shared cache and rate-limit store; the API also runs without it.
  await connectRedis();
  server = createApp().listen(env.BACKEND_PORT, () => {
    logger.info({ port: env.BACKEND_PORT, env: env.NODE_ENV, mail: mailStatus(), collegeDbSearch: env.collegeDbConfigured ? 'enabled' : 'disabled (COLLEGEDB_API_KEY not set)' }, 'Education Consultancy API listening');
  });
  // Email: check the SMTP login (nothing is sent), then start sending queued emails with retries.
  void verifyMailTransport();
  await loadTemplateOverrides();
  startEmailWorker();
  startAppointmentReminders();
  // College directory imports: release jobs a restart interrupted, then run anything queued.
  await recoverInterruptedImports();
  kickImports();
  server.on('error', (err: NodeJS.ErrnoException) => {
    logger.fatal({ code: err.code, port: env.BACKEND_PORT }, err.code === 'EADDRINUSE' ? 'Port already in use' : 'HTTP server error');
    process.exit(1);
  });
}

void start();
