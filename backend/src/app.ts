import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { createRequire } from 'node:module';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimits.js';
import { apiRouter, openApiDocument } from './routes/index.js';
import { logger } from './utils/logger.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  // A correlation id on every request (also returned as X-Request-Id).
  app.use((req, res, next) => {
    const incoming = req.get('x-request-id');
    const id = incoming && /^[A-Za-z0-9._-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', id);
    (req as express.Request & { id: string }).id = id;
    next();
  });
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url?.startsWith('/api/health') ?? false } }));
  app.use(helmet());
  // Only this project's own frontend origins may call the API from a browser.
  app.use(cors({ origin: (origin, cb) => cb(null, !origin || env.CORS_ORIGINS.includes(origin) ? origin ?? false : false), credentials: true }));
  // The raw body is kept for the Razorpay webhook only (its signature covers the exact bytes).
  app.use(express.json({ limit: '100kb', verify: (req, _res, buf) => { if ((req as express.Request).originalUrl?.startsWith('/api/payments/webhook')) (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf); } }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());

  // Overall per-IP limit (shared by every API instance through Redis when REDIS_URL is set).
  app.use('/api', apiLimiter);
  app.use('/api', apiRouter);

  // API documentation generated from the route table (on outside production unless API_DOCS=false).
  if (env.apiDocs) {
    app.get('/api/docs.json', (_req, res) => res.json(openApiDocument()));
    // Swagger UI with absolute asset paths (works with or without a trailing slash, also through the web proxy)
    // and no inline script, so the strict Content-Security-Policy stays on.
    const assets = (createRequire(import.meta.url)('swagger-ui-dist') as { getAbsoluteFSPath: () => string }).getAbsoluteFSPath();
    app.use('/api/docs/assets', express.static(assets, { index: false }));
    app.get('/api/docs/init.js', (_req, res) => res.type('application/javascript').send("window.ui = SwaggerUIBundle({ url: '/api/docs.json', dom_id: '#swagger-ui', deepLinking: true });"));
    app.get(['/api/docs', '/api/docs/'], (_req, res) =>
      res.type('html').send(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${env.APP_NAME} API</title><link rel="stylesheet" href="/api/docs/assets/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="/api/docs/assets/swagger-ui-bundle.js"></script><script src="/api/docs/init.js"></script></body></html>`,
      ),
    );
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
