import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { HEALTH_CHECK_USER_ID, deleteHealthCheckMessages } from "@/lib/db";

// Daily (see vercel.json) synthetic turn against the real public
// /api/chat endpoint -- not an internal shortcut -- so this tests the
// exact path a real user hits (DNS, Vercel routing, the whole thing), not
// a bypassed version of it. Same CRON_SECRET auth pattern as the existing
// check-ins cron. A fixed, permanent test user (HEALTH_CHECK_USER_ID) is
// excluded from getAdminSignals()/getSignals() everywhere they touch
// users/messages/commitments/tags, so this never pollutes real-traffic
// counts. Was every 15 minutes -- real cost, every single run, since this
// hits the real API same as any user turn, with zero real users behind
// any of it; daily keeps the same coverage (one real check that the
// deployed site can still reach the model end to end) at roughly 1/96th
// the spend. Its own message history is wiped before every run (below) so
// tagFamilyPattern's now-full-history classification call can't let this
// cost climb on its own, independent of the frequency cut.
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

  // Wiped before this run, not after -- so every run, including the very
  // first one after a deploy and any run following one whose own cleanup
  // never got to run (killed, crashed, etc.), starts from a guaranteed-
  // empty history rather than "usually empty except when the previous
  // run's own cleanup failed." Its own try/catch, outside the timer
  // below: a delete failure is a reason to look at the DB, never a
  // reason to skip or fail this run's actual check.
  try {
    await deleteHealthCheckMessages();
  } catch (err) {
    console.error("[health-check] failed to reset synthetic user history", err);
  }

  // Started only now -- the delete's own DB round trip isn't part of
  // what this measures or what SLOW_THRESHOLD_MS judges.
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
