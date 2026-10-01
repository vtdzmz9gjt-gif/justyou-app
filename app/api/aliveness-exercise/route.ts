import { NextRequest, NextResponse } from "next/server";
import { generateAlivenessExercise } from "@/lib/anthropic";

export const maxDuration = 30;

// A few real words minimum -- the five lines are grounded entirely in
// these two answers, so there has to be something real to ground in.
const MIN_WORDS = 3;

function hasEnoughWords(value: string): boolean {
  return value.trim().split(/\s+/).filter(Boolean).length >= MIN_WORDS;
}

// Standalone and fully isolated from the main conversation by design: no
// userId, no DB read or write, nothing persisted. Ephemeral in, ephemeral
// out -- this must never feed the tree/family tagging systems, which only
// ever see organic conversation content.
export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const alivenessAnswer = typeof body?.alivenessAnswer === "string" ? body.alivenessAnswer : "";
  const stuckAnswer = typeof body?.stuckAnswer === "string" ? body.stuckAnswer : "";
  const lang = typeof body?.lang === "string" ? body.lang : null;

  if (!hasEnoughWords(alivenessAnswer) || !hasEnoughWords(stuckAnswer)) {
    return NextResponse.json(
      { error: "A few more words would help this mean something." },
      { status: 400 }
    );
  }

  try {
    const result = await generateAlivenessExercise(
      alivenessAnswer.trim(),
      stuckAnswer.trim(),
      lang
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("aliveness-exercise error", err);
    return NextResponse.json(
      { error: "Couldn't put that together just now. Try again in a moment." },
      { status: 502 }
    );
  }
}
