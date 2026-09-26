import { NextRequest, NextResponse } from "next/server";
import { ensureUser, getRecentWins } from "@/lib/db";
import { generateWeeklyRecapLine } from "@/lib/anthropic";

export const maxDuration = 30;

// Client-triggered: the visitor's own browser already knows their local
// Sunday-7pm boundary correctly, so this route just takes that "since"
// timestamp and returns whatever landed in the 7 days before it. No
// timezone storage, no server-side scheduling.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const lang = req.nextUrl.searchParams.get("lang");
  const sinceParam = req.nextUrl.searchParams.get("since");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }
  const since = sinceParam ? new Date(sinceParam) : null;
  if (!since || Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "Missing or invalid since." }, { status: 400 });
  }

  await ensureUser(userId);
  const wins = await getRecentWins(userId, since);

  if (wins.length === 0) {
    return NextResponse.json({ wins: [], summary: null });
  }

  try {
    const summary = await generateWeeklyRecapLine(wins, lang);
    return NextResponse.json({ wins, summary });
  } catch (err) {
    console.error("weekly recap error", err);
    return NextResponse.json({ wins, summary: null });
  }
}
