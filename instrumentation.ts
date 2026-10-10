// Next.js's own hook for registering instrumentation once per server
// start -- this is what actually activates sentry.server.config.ts /
// sentry.edge.config.ts; without this file, those two configs are inert.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
