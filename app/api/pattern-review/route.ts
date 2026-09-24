import { NextRequest, NextResponse } from "next/server";
import { ensureUser, getMessages, getUserStage, getElementTally, type Element } from "@/lib/db";
import { generatePatternReview, generateElementReflection } from "@/lib/anthropic";

export const maxDuration = 30;

// How much of the message history counts as "this conversation" for the
// pattern review -- there's no session/day boundary in the schema (it's one
// continuous thread per person by design), so this is a practical recency
// window rather than a literal single sitting.
const RECENT_MESSAGE_COUNT = 24;

// The avatar reveal only shows alongside the pattern review once there's
// actually enough tagged material behind it -- a reveal built on one or two
// tagged messages wouldn't mean anything.
const ELEMENT_REVEAL_FLOOR = 4;
const ELEMENTS: Element[] = ["fire", "earth", "air", "water"];

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const lang = req.nextUrl.searchParams.get("lang");
  const sinceMessageId = parseInt(req.nextUrl.searchParams.get("sinceMessageId") || "0", 10) || 0;
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

    const tally = await getElementTally(userId, sinceMessageId);
    const total = ELEMENTS.reduce((sum, el) => sum + tally[el], 0);
    let avatarReveal = null;
    if (total >= ELEMENT_REVEAL_FLOOR) {
      const sorted = [...ELEMENTS].sort((a, b) => tally[b] - tally[a]);
      const dominant = sorted[0];
      const weakest = sorted[sorted.length - 1];
      const dominantPct = Math.round((tally[dominant] / total) * 100);
      const weakestPct = Math.round((tally[weakest] / total) * 100);
      const reflection = await generateElementReflection(
        dominant,
        dominantPct,
        weakest,
        weakestPct,
        recent,
        lang
      );
      avatarReveal = { dominant, dominantPct, weakest, weakestPct, reflection };
    }

    return NextResponse.json({ review, elementTally: tally, avatarReveal });
  } catch (err) {
    console.error("pattern review error", err);
    return NextResponse.json(
      { error: "Couldn't put that together just now. Try again in a moment." },
      { status: 502 }
    );
  }
}
