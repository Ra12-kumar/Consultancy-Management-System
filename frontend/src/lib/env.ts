// Browser-safe configuration. Only NEXT_PUBLIC_ values may be read here; they are inlined at build time.
// The API is reached through this site's own /api path (proxied to the backend by next.config.ts).
export const publicEnv = {
  apiBaseUrl: (process.env.NEXT_PUBLIC_API_BASE_URL || "/api").replace(/\/+$/, ""),
} as const;
