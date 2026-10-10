import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { HEALTH_CHECK_USER_ID } from "@/lib/db";

// Periodic synthetic turn against the real public /api/chat endpoint --
// not an internal shortcut -- so this tests the exact path a real user
// hits (DNS, Vercel routing, the whole thing), not a bypassed version of
// it. Same CRON_SECRET auth pattern as the existing check-ins cron. A
// fixed, permanent test user (HEALTH_CHECK_USER_ID) is excluded from
// getAdminSignals()/getSignals() everywhere they touch users/messages/
// commitments/tags, so this never pollutes real-traffic counts.
const SITE_URL = "https://www.justyou.fyi";
const SLOW_THRESHOLD_MS = 20_000;
const TEST_MESSAGE = "This is an automated health check. A brief reply is fine.";

// Needs to comfortably outlast /api/chat's own 45s internal timeout plus
// network overhead, or this function could get killed first and the
// failure would look like a health-check bug instead of a real one.
export const maxDuration = 55;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const started = Date.now();
  let ok = false;
  let status: number | undefined;
  let errorDetail: string | undefined;

  try {
    const res = await fetch(`${SITE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: HEALTH_CHECK_USER_ID, message: TEST_MESSAGE }),
    });
    status = res.status;
    if (res.ok) {
      const data = await res.json();
      ok = typeof data.reply === "string" && data.reply.trim().length > 0;
      if (!ok) errorDetail = "200 response had no reply text.";
    } else {
      const data = await res.json().catch(() => ({}));
      errorDetail = data.error || `HTTP ${res.status}`;
    }
  } catch (err) {
    errorDetail = err instanceof Error ? err.message : "Unknown fetch error.";
  }

  const durationMs = Date.now() - started;
  const slow = durationMs > SLOW_THRESHOLD_MS;

  if (!ok) {
    console.error(`[health-check] FAILED durationMs=${durationMs} status=${status} error=${errorDetail}`);
    Sentry.captureMessage("chat health check failed", {
      level: "error",
      tags: { route: "api/cron/health-check" },
      extra: { durationMs, status, errorDetail },
    });
  } else if (slow) {
    console.error(`[health-check] SLOW durationMs=${durationMs}`);
    Sentry.captureMessage("chat health check unusually slow", {
      level: "warning",
      tags: { route: "api/cron/health-check" },
      extra: { durationMs, status },
    });
  } else {
    console.log(`[health-check] ok durationMs=${durationMs}`);
  }

  return NextResponse.json({ ok, slow, durationMs, status, error: errorDetail });
}
