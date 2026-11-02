import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Tests always use the dedicated test database and quiet logs, whatever the root .env says.
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: process.env.MONGODB_URI_TEST ?? 'mongodb://127.0.0.1:27017/education_consultancy_test',
      SESSION_SECRET: 'test-session-secret-that-is-long-enough-0123456789',
      LOG_LEVEL: 'silent',
      FRONTEND_URL: 'http://localhost:3000',
      CORS_ORIGINS: 'http://localhost:3000',
      // Real emails are never sent by tests (a stub transport captures them).
      SMTP_HOST: '',
      SMTP_USER: '',
      SMTP_PASS: '',
      EMAIL_FROM: '',
      ADMIN_NOTIFY_EMAILS: '',
      // Tests never call the real CollegeDB API (a stub client is injected where needed).
      COLLEGEDB_API_KEY: '',
      // Generous limits so only the dedicated tests hit them.
      LOGIN_RATE_LIMIT: '1000',
      AUTH_RATE_LIMIT: '1000',
      API_RATE_LIMIT: '100000',
      // A separate, disposable folder for files uploaded by tests.
      UPLOAD_DIR: 'storage/test-uploads',
    },
    fileParallelism: false,
    // Integration tests hash several passwords (argon2) and talk to MongoDB; 5 s is too tight on a busy machine.
    testTimeout: 20_000,
  },
});
