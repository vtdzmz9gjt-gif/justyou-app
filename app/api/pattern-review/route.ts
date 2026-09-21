import { NextRequest, NextResponse } from "next/server";
import { ensureUser, getMessages, getUserStage } from "@/lib/db";
import { generatePatternReview } from "@/lib/anthropic";

export const maxDuration = 30;

// How much of the message history counts as "this conversation" for the
// pattern review -- there's no session/day boundary in the schema (it's one
// continuous thread per person by design), so this is a practical recency
// window rather than a literal single sitting.
const RECENT_MESSAGE_COUNT = 24;

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const lang = req.nextUrl.searchParams.get("lang");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  await ensureUser(userId);
  const [messages, stage] = await Promise.all([getMessages(userId), getUserStage(userId)]);

  if (messages.length === 0) {
    return NextResponse.json({ error: "Nothing to review yet." }, { status: 400 });
  }

  const recent = messages.slice(-RECENT_MESSAGE_COUNT);

  try {
    const review = await generatePatternReview(stage, recent, lang);
    return NextResponse.json({ review });
  } catch (err) {
    console.error("pattern review error", err);
    return NextResponse.json(
      { error: "Couldn't put that together just now. Try again in a moment." },
      { status: 502 }
    );
  }
}
