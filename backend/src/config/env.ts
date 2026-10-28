import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// Central, validated configuration. The backend reads the project's ROOT .env (one settings file for the
// whole project); variables already set in the real environment always win. On invalid settings the
// process stops before anything starts, printing variable names and rules only, never values.

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true });

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const bool = z.preprocess(emptyToUndefined, z.enum(['true', 'false']).default('false')).transform((v) => v === 'true');
const csv = z.preprocess(emptyToUndefined, z.string().default('')).transform((v) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_NAME: z.string().default('EduPath Consultancy'),
    BACKEND_PORT: z.coerce.number().int().min(1).max(65535).default(5100),
    FRONTEND_URL: z.string().url().default('http://localhost:3000'),
    // Browser origins allowed to call the API (CORS) and to send cookie-authenticated writes (CSRF check).
    CORS_ORIGINS: csv,
    MONGODB_URI: z.string().regex(/^mongodb(\+srv)?:\/\//, 'must be a mongodb:// or mongodb+srv:// URI'),
    SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    SESSION_MAX_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    API_RATE_LIMIT: z.coerce.number().int().positive().default(300),
    LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
    AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(5),
    SMTP_HOST: optionalString,
    SMTP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
    SMTP_SECURE: bool,
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,
    EMAIL_FROM: z.preprocess(emptyToUndefined, z.string().email('must be an email address').optional()),
    EMAIL_FROM_NAME: z.string().default('EduPath Consultancy'),
    // Team addresses told about new registrations (comma separated). Optional.
    ADMIN_NOTIFY_EMAILS: csv.pipe(z.array(z.string().email('each must be an email address'))),
    // Private file storage (photos, documents). Relative paths are resolved from the project root; keep it
    // outside any public web folder.
    UPLOAD_DIR: z.preprocess(emptyToUndefined, z.string().default('storage/uploads')),
    // Swagger UI at /api/docs: on by default outside production.
    API_DOCS: z.preprocess(emptyToUndefined, z.enum(['true', 'false']).optional()),
    // Razorpay (online payment of the consultancy service charge). Payments stay off until all are set.
    RAZORPAY_KEY_ID: optionalString,
    RAZORPAY_KEY_SECRET: optionalString,
    RAZORPAY_WEBHOOK_SECRET: optionalString,
  })
  .superRefine((env, ctx) => {
    // This project's data must never go to the Gym application's database.
    if (/\/mockmentor_gym/i.test(env.MONGODB_URI)) {
      ctx.addIssue({ code: 'custom', path: ['MONGODB_URI'], message: "points at the Gym application database; use this project's own database" });
    }
    if (env.NODE_ENV === 'production') {
      if (!env.FRONTEND_URL.startsWith('https://')) ctx.addIssue({ code: 'custom', path: ['FRONTEND_URL'], message: 'must be https in production' });
      if (env.SESSION_SECRET.startsWith('replace_with')) ctx.addIssue({ code: 'custom', path: ['SESSION_SECRET'], message: 'must be a real secret in production' });
      for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'email (SMTP) must be fully configured in production' });
      }
    }
  });

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(env)'}: ${i.message}`);
    console.error(`Invalid environment configuration:\n${problems.join('\n')}`);
    process.exit(1);
  }
  const data = parsed.data;
  const missingSmtp = (['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'] as const).filter((k) => !data[k]);
  return Object.freeze({
    ...data,
    CORS_ORIGINS: data.CORS_ORIGINS.length ? data.CORS_ORIGINS : [data.FRONTEND_URL],
    isProduction: data.NODE_ENV === 'production',
    isTest: data.NODE_ENV === 'test',
    // Email is sent only when every SMTP setting is present; otherwise it is logged (and shown as not sent).
    smtpConfigured: missingSmtp.length === 0,
    smtpMissing: missingSmtp,
    uploadDir: path.resolve(projectRoot, data.UPLOAD_DIR),
    paymentsConfigured: Boolean(data.RAZORPAY_KEY_ID && data.RAZORPAY_KEY_SECRET),
    apiDocs: data.API_DOCS ? data.API_DOCS === 'true' : data.NODE_ENV !== 'production',
  });
}

export const env = load();
export type Env = typeof env;
