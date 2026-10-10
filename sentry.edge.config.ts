import * as Sentry from "@sentry/nextjs";

// Edge runtime counterpart to sentry.server.config.ts (middleware runs on
// the edge runtime, not Node) -- required for instrumentation.ts's
// register() to cover both runtimes. /api/chat itself runs on the regular
// Node runtime (sentry.server.config.ts), this just keeps the setup
// complete.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: 0,
});
