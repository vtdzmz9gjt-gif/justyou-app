import { NextRequest, NextResponse } from "next/server";
import {
  addMessage,
  ensureUser,
  getMessages,
  getMostRecentCommitment,
  getElementTally,
  type Element,
} from "@/lib/db";
import { runChat, generateElementReflection } from "@/lib/anthropic";

// runChat's tool-use loop can make up to 4 sequential calls to Claude in a
// single turn (recording a commitment, signaling a stage, assigning a shape
// family, then the actual reply) -- comfortably past Vercel's default
// function timeout on a slow round. Needs a paid plan; Hobby's 10s cap
// can't be raised past this.
export const maxDuration = 60;

// The avatar reveal (elemental orb resolving into a standing figure) only
// fires alongside a genuine closing moment (record_commitment) AND once
// there's actually enough tagged material behind it -- a reveal built on
// one or two tagged messages wouldn't mean anything.
const ELEMENT_REVEAL_FLOOR = 4;

const ELEMENTS: Element[] = ["fire", "earth", "air", "water"];

async function buildAvatarReveal(
  userId: string,
  sinceMessageId: number,
  lang: string | undefined,
  history: { role: "user" | "assistant"; content: string }[]
) {
  const tally = await getElementTally(userId, sinceMessageId);
  const total = ELEMENTS.reduce((sum, el) => sum + tally[el], 0);
  console.log(
    `[avatar-reveal] sinceMessageId=${sinceMessageId} tally=${JSON.stringify(tally)} total=${total} floor=${ELEMENT_REVEAL_FLOOR}`
  );
  if (total < ELEMENT_REVEAL_FLOOR) return { tally, reveal: null };

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
    history.slice(-24) as never,
    lang
  );

  return {
    tally,
    reveal: { dominant, dominantPct, weakest, weakestPct, reflection },
  };
}

export async function POST(req: NextRequest) {
  let body: {
    userId?: string;
    message?: string;
    depth?: string;
    lang?: string;
    alivenessAnswer?: string;
    sinceMessageId?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { userId, message, depth, lang, alivenessAnswer, sinceMessageId } = body;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Missing message." }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  await ensureUser(userId);
  const history = await getMessages(userId);

  let result: {
    reply: string;
    stage?: string;
    shapeFamily?: string;
    branches?: string[];
    element?: Element;
    committed?: boolean;
  };
  try {
    result = await runChat(userId, history, message.trim(), depth, lang, alivenessAnswer);
  } catch (err) {
    console.error("chat error", err);
    return NextResponse.json(
      { error: "Just You couldn't respond just now. Try again in a moment." },
      { status: 502 }
    );
  }

  console.log(
    `[chat] userId=${userId} element=${result.element ?? "none"} committed=${!!result.committed} stage=${result.stage ?? "n/a"}`
  );

  await addMessage(userId, "user", message.trim(), result.element);
  await addMessage(userId, "assistant", result.reply);

  const boundary = typeof sinceMessageId === "number" ? sinceMessageId : 0;
  let elementTally: Record<Element, number> = { fire: 0, earth: 0, air: 0, water: 0 };
  let avatarReveal = null;
  if (result.committed) {
    const withNewTurn = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: message.trim() },
      { role: "assistant" as const, content: result.reply },
    ];
    const built = await buildAvatarReveal(userId, boundary, lang, withNewTurn);
    elementTally = built.tally;
    avatarReveal = built.reveal;
  } else {
    elementTally = await getElementTally(userId, boundary);
  }

  return NextResponse.json({
    reply: result.reply,
    stage: result.stage,
    shapeFamily: result.shapeFamily,
    branches: result.branches,
    elementTally,
    avatarReveal,
  });
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }
  const sinceMessageId = parseInt(req.nextUrl.searchParams.get("sinceMessageId") || "0", 10) || 0;
  await ensureUser(userId);
  const [messages, lastCommitment, elementTally] = await Promise.all([
    getMessages(userId),
    getMostRecentCommitment(userId),
    getElementTally(userId, sinceMessageId),
  ]);
  return NextResponse.json({
    messages,
    lastCommitment: lastCommitment
      ? { action: lastCommitment.action, status: lastCommitment.status }
      : null,
    elementTally,
  });
}
