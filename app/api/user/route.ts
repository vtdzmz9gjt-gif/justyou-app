import { NextRequest, NextResponse } from "next/server";
import { setUserEmail } from "@/lib/db";

// Optional: lets someone leave an email so the daily check-ins cron
// (see app/api/cron/check-ins) can nudge them the day before a commitment
// is due. Nothing in the core chat depends on this.
export async function POST(req: NextRequest) {
  let body: { userId?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { userId, email } = body;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }

  setUserEmail(userId, email.trim());
  return NextResponse.json({ ok: true });
}
