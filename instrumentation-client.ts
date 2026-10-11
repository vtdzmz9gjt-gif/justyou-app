import * as Sentry from "@sentry/nextjs";

// Client-side counterpart to sentry.server.config.ts/sentry.edge.config.ts --
// without this, only failures the server itself throws are visible; a
// failed or hung fetch() in the browser (the actual thing a real person
// experiences when send() can't get a reply) never reached Sentry at all.
// Turbopack-era convention: this file (not sentry.client.config.ts, which
// is deprecated and silently inert under Turbopack) is auto-detected and
// loaded by withSentryConfig in next.config.mjs.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: 0,
});
