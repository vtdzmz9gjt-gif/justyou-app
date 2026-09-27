import { NextRequest, NextResponse } from "next/server";
import { setUserEmail, setUserSchedule } from "@/lib/db";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Optional, and each piece independently settable: an email (so the daily
// check-ins cron in app/api/cron/check-ins can nudge someone the day
// before a commitment is due) and/or a preferred time + timezone (so a
// future check-in nudge can land at a time that's actually theirs).
// Nothing in the core chat depends on either.
export async function POST(req: NextRequest) {
  let body: { userId?: string; email?: string; preferredTime?: string; timezone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { userId, email, preferredTime, timezone } = body;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }

  if (email !== undefined) {
    if (typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email." }, { status: 400 });
    }
    await setUserEmail(userId, email.trim());
  }

  if (preferredTime !== undefined || timezone !== undefined) {
    if (typeof preferredTime !== "string" || !TIME_PATTERN.test(preferredTime)) {
      return NextResponse.json({ error: "Invalid preferredTime." }, { status: 400 });
    }
    if (typeof timezone !== "string" || !timezone.trim()) {
      return NextResponse.json({ error: "Invalid timezone." }, { status: 400 });
    }
    await setUserSchedule(userId, preferredTime, timezone.trim());
  }

  return NextResponse.json({ ok: true });
}
