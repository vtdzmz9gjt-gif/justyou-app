import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
// No-op comment -- verifying the Production Branch fix deploys straight to
// Production on merge, no manual promote needed.
const nextConfig = {};

// Safe with no Sentry env vars configured at all -- source map upload
// (org/project/authToken) is skipped gracefully if they're not set,
// never fails the build. Error reporting itself only depends on
// SENTRY_DSN, set directly in sentry.server.config.ts/sentry.edge.config.ts.
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  disableLogger: true,
  automaticVercelMonitors: false,
});
