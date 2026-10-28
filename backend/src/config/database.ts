import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

// This project's own MongoDB connection (database from MONGODB_URI, e.g. education_consultancy).
// Nothing here ever drops, resets or migrates data. The connection string is never logged.

mongoose.set('strictQuery', true);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let listenersAdded = false;

function addListeners() {
  if (listenersAdded) return;
  listenersAdded = true;
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  // Without an error listener, a connection error would crash the process.
  mongoose.connection.on('error', (err: Error) => logger.error({ err: { name: err.name, message: err.message } }, 'MongoDB connection error'));
}

// Connects, retrying a few times with growing waits (e.g. while the database is still starting).
export async function connectDatabase(uri: string = env.MONGODB_URI, { attempts = 5 }: { attempts?: number } = {}) {
  addListeners();
  for (let attempt = 1; ; attempt += 1) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, autoIndex: !env.isProduction });
      logger.info({ database: mongoose.connection.name }, 'MongoDB connected');
      return mongoose.connection;
    } catch (err) {
      const e = err as Error;
      const permanent = e.name === 'MongoParseError' || /authentication failed/i.test(e.message);
      if (permanent || attempt >= attempts) throw err;
      const delayMs = Math.min(15_000, 1000 * 2 ** (attempt - 1));
      logger.warn({ attempt, delayMs, err: { name: e.name, message: e.message } }, 'MongoDB not reachable yet; retrying');
      await wait(delayMs);
    }
  }
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

export type DatabaseState = 'connected' | 'connecting' | 'disconnected' | 'disconnecting';
export function databaseState(): DatabaseState {
  const states: DatabaseState[] = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[mongoose.connection.readyState] ?? 'disconnected';
}
