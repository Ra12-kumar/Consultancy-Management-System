import { pino } from 'pino';
import { env } from '../config/env.js';

// Structured JSON logs. Anything that could carry a credential is censored before it is written.
export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', '*.password', '*.token', '*.secret', '*.uri'],
    censor: '[REDACTED]',
  },
});
