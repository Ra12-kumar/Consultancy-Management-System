import type { Router } from 'express';
import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { env } from '../config/env.js';

// Builds the OpenAPI document from the real routers, so the docs cannot drift from the code: paths and methods come
// from the route table, request schemas from the zod validators, and access rules from the auth middleware.

type Meta = { schemas?: { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny }; roles?: string[]; permissions?: string[]; all?: boolean; auth?: boolean; verified?: boolean };
type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: { openapi?: Meta } }> }; handle: { stack?: Layer[]; openapi?: Meta } };
type Operation = Record<string, unknown>;

const json = (schema: ZodTypeAny) => {
  // Request input as clients send it (before defaults/transforms are applied).
  const s = zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none', effectStrategy: 'input' }) as Record<string, unknown>;
  delete s.$schema;
  return s;
};

function parameters(schema: ZodTypeAny | undefined, where: 'path' | 'query') {
  if (!schema) return [];
  const s = json(schema) as { properties?: Record<string, unknown>; required?: string[] };
  return Object.entries(s.properties ?? {}).map(([name, prop]) => ({ name, in: where, required: where === 'path' || (s.required ?? []).includes(name), schema: prop }));
}

const ERROR = { $ref: '#/components/responses/Error' };

function operation(path: string, method: string, metas: Meta[], tag: string): Operation {
  const m: Meta = Object.assign({}, ...metas);
  const schemas = metas.find((x) => x.schemas)?.schemas ?? {};
  const access = m.permissions ? `Admin with ${m.permissions.join(m.all ? ' and ' : ' or ')}` : m.roles ? `Signed-in ${m.roles.join(' or ')}` : m.auth ? 'Signed in' : 'Public';
  const op: Operation = {
    tags: [tag],
    summary: `${method.toUpperCase()} ${path}`,
    description: `Access: ${access}${m.verified ? ' (verified email required)' : ''}.`,
    parameters: [...parameters(schemas.params, 'path'), ...parameters(schemas.query, 'query')],
    responses: { 200: { $ref: '#/components/responses/Success' }, 401: ERROR, 403: ERROR, 404: ERROR, 409: ERROR, 422: ERROR, 429: ERROR },
    'x-access': { auth: Boolean(m.auth), roles: m.roles ?? [], permissions: m.permissions ?? [], verifiedEmail: Boolean(m.verified) },
  };
  if (m.auth) op.security = [{ sessionCookie: [] }];
  if (schemas.body) op.requestBody = { required: true, content: { 'application/json': { schema: json(schemas.body) } } };
  if (/\/(photo|files)$/.test(path) && ['put', 'post'].includes(method)) {
    op.requestBody = { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } } } };
  }
  return op;
}

// `mounts` maps each path-mounted router to its prefix; routers mounted without a path share their parent's prefix.
export function buildOpenApi(root: Router, prefix: string, mounts: Map<unknown, string>) {
  const paths: Record<string, Record<string, Operation>> = {};
  const inherited: Meta[] = [];
  const walk = (router: Router, base: string, parentMetas: Meta[]) => {
    const metas = [...parentMetas];
    for (const layer of (router as unknown as { stack: Layer[] }).stack) {
      if (layer.route) {
        const full = `${base}${layer.route.path}`.replace(/\/$/, '') || '/';
        const routeMetas = [...metas, ...layer.route.stack.map((s) => s.handle.openapi).filter((x): x is Meta => Boolean(x))];
        const openApiPath = full.replace(/:(\w+)/g, '{$1}');
        const tag = full.replace(`${prefix}/`, '').split('/')[0] === 'admin' ? `admin/${full.split('/')[3] ?? ''}` : full.replace(`${prefix}/`, '').split('/')[0]!;
        for (const method of Object.keys(layer.route.methods)) {
          (paths[openApiPath] ??= {})[method] = operation(full, method, routeMetas, tag);
        }
      } else if (layer.handle.stack) {
        const sub = mounts.has(layer.handle) ? `${prefix}${mounts.get(layer.handle)}` : base;
        walk(layer.handle as unknown as Router, sub, mounts.has(layer.handle) ? [] : metas);
      } else if (layer.handle.openapi) {
        // Router-level middleware (e.g. adminRouter.use(authenticate, requireRole('admin'))) applies to later routes.
        metas.push(layer.handle.openapi);
      }
    }
  };
  walk(root, prefix, inherited);
  return {
    openapi: '3.0.3',
    info: {
      title: `${env.APP_NAME} API`,
      version: '1.0.0',
      description:
        'Generated from the live route table and validators. All responses use `{ success, data, meta? }` or `{ success: false, error: { code, message, details? } }`. Money is integer paise. Cookie-authenticated writes must send an allowed Origin header (CSRF protection).',
    },
    servers: [{ url: '/' }],
    components: {
      securitySchemes: { sessionCookie: { type: 'apiKey', in: 'cookie', name: 'ec_sid' } },
      responses: {
        Success: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', enum: [true] }, data: {}, meta: { type: 'object' } } } } } },
        Error: {
          description: 'Error',
          content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', enum: [false] }, error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } } } } } } } } },
        },
      },
    },
    paths,
  };
}
