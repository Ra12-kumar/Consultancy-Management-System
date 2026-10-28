import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

type Schemas = { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny };

declare module 'express-serve-static-core' {
  interface Request {
    // Parsed, validated input. (Express 5 makes req.query read-only, so it is never rewritten.)
    valid: { body?: unknown; query?: unknown; params?: unknown };
  }
}

// Validates request parts with zod; failures become 422 responses through the error handler.
export function validate(schemas: Schemas) {
  const mw = (req: Request, _res: Response, next: NextFunction) => {
    req.valid = {};
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (schema) req.valid[part] = schema.parse(req[part] ?? {});
    }
    next();
  };
  // Read by the OpenAPI generator (services/openapi.ts).
  return Object.assign(mw, { openapi: { schemas } });
}

export type Valid<S extends ZodTypeAny> = z.infer<S>;
