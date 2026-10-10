import * as Sentry from "@sentry/nextjs";

// Server-side error monitoring, scoped to the real goal: know about a
// failed or stuck /api/chat turn automatically, not by personally
// experiencing it. Nothing fires without SENTRY_DSN set -- harmless no-op
// locally and in any environment that hasn't configured it yet.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: 0,
});
