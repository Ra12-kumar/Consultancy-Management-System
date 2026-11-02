import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// One settings file for the whole project: load the project-root .env (Next.js on its own only reads
// frontend/.env*). Only NEXT_PUBLIC_* values are inlined into browser code; backend secrets in the same
// file (MONGODB_URI, SESSION_SECRET, SMTP_*) are never referenced by the frontend and never bundled.
loadEnvConfig(path.resolve(process.cwd(), ".."));

// Where this server forwards /api/* (server-side only; the browser only ever sees this site's own /api).
const apiInternalUrl = (process.env.API_INTERNAL_URL || "http://localhost:5100").replace(/\/+$/, "");

// Security headers for every page. The CSP allows the inline scripts Next.js needs; images may come from https
// (admin-entered college logos). Development additionally needs eval for fast refresh.
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  // Razorpay checkout (student payments) loads its script and payment window from Razorpay.
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com${isDev ? " 'unsafe-eval'" : ""}`,
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com${isDev ? " ws:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  // End-to-end tests build into their own folder so they never disturb a running dev server or the main build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // A self-contained server for Docker (frontend/Dockerfile); the monorepo root is the tracing root.
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), ".."),
  partialPrefetching: true,
  poweredByHeader: false,
  // Development: lets a phone on the same Wi-Fi open the dev server at FRONTEND_URL (e.g. http://192.168.x.x:3000).
  allowedDevOrigins: [new URL(process.env.FRONTEND_URL || "http://localhost:3000").hostname],
  // The API docs (Swagger UI, served by the backend at /api/docs/) need their trailing slash kept.
  skipTrailingSlashRedirect: true,
  // Same-origin API: session cookies stay first-party and the browser never needs CORS.
  async headers() {
    // Pages only: /api responses keep the backend's own headers (e.g. the strict policy on private files).
    return [{ source: "/((?!api/).*)", headers: securityHeaders }];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiInternalUrl}/api/:path*` }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
