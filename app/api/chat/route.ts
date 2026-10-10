import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  addMessage,
  checkConversationGate,
  ensureUser,
  getDistinctActiveDays,
  getMessages,
  getMostRecentCommitment,
  getElementTally,
  getUser,
  type Element,
} from "@/lib/db";
import { runChat } from "@/lib/anthropic";

// runChat's tool-use loop can make up to 4 sequential calls to Claude in a
// single turn (recording a commitment, signaling a stage, offering
// branches, then the actual reply) -- comfortably past Vercel's default
// function timeout on a slow round. Needs a paid plan; Hobby's 10s cap
// can't be raised past this.
export const maxDuration = 60;

// An internal ceiling below Vercel's own hard kill at maxDuration, so a
// slow turn gets a clean, friendly response instead of however the
// platform's own timeout happens to surface (no response at all, in the
// worst case). 45s leaves real margin before the 60s wall.
const INTERNAL_TIMEOUT_MS = 45_000;
const TIMEOUT_SENTINEL = Symbol("chat-route-internal-timeout");

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

  // Checked before touching history/runChat, so a blocked turn costs
  // nothing -- no Anthropic call, and nothing gets persisted to messages.
  const gate = await checkConversationGate(userId);
  if (!gate.allowed) {
    return NextResponse.json({
      blocked: true,
      message:
        "You've used your 3 free conversations this month. Subscribe for unlimited, or come back next month.",
    });
  }

  const history = await getMessages(userId);

  type RunChatResult = {
    reply: string;
    stage?: string;
    branches?: string[];
    element?: Element;
    sephirah?: string;
    committed?: boolean;
    win?: { action: string; reflection: string };
  };

  let timeoutId!: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
    timeoutId = setTimeout(() => resolve(TIMEOUT_SENTINEL), INTERNAL_TIMEOUT_MS);
  });

  let raced: RunChatResult | typeof TIMEOUT_SENTINEL;
  try {
    raced = await Promise.race([
      runChat(userId, history, message.trim(), depth, lang, alivenessAnswer),
      timeoutPromise,
    ]);
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("chat error", err);
    Sentry.captureException(err, { tags: { route: "api/chat" }, extra: { userId } });
    return NextResponse.json(
      { error: "Just You couldn't respond just now. Try again in a moment." },
      { status: 502 }
    );
  }
  clearTimeout(timeoutId);

  if (raced === TIMEOUT_SENTINEL) {
    // runChat() keeps running in the background and may still write to
    // the database (recordCommitment, setUserStage, etc. from whatever
    // round was in flight) -- that's an accepted tradeoff, same as what
    // Vercel's own hard kill at maxDuration would do anyway, just earlier
    // and with an actual message instead of silence.
    console.error(`chat route internal timeout userId=${userId}`);
    Sentry.captureMessage("chat route internal timeout (45s)", {
      level: "warning",
      tags: { route: "api/chat" },
      extra: { userId },
    });
    return NextResponse.json(
      { error: "This is taking longer than expected. Please try again." },
      { status: 504 }
    );
  }
  const result: RunChatResult = raced;

  console.log(
    `[chat] userId=${userId} element=${result.element ?? "none"} sephirah=${result.sephirah ?? "none"}`
  );

  const userMessageId = await addMessage(userId, "user", message.trim(), result.element);
  const assistantMessageId = await addMessage(userId, "assistant", result.reply);

  const boundary = typeof sinceMessageId === "number" ? sinceMessageId : 0;
  const elementTally = await getElementTally(userId, boundary);

  return NextResponse.json({
    reply: result.reply,
    stage: result.stage,
    branches: result.branches,
    elementTally,
    win: result.win,
    userMessageId,
    assistantMessageId,
  });
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }
  const sinceMessageId = parseInt(req.nextUrl.searchParams.get("sinceMessageId") || "0", 10) || 0;
  await ensureUser(userId);
  const [messages, lastCommitment, elementTally, user, activeDays] = await Promise.all([
    getMessages(userId),
    getMostRecentCommitment(userId),
    getElementTally(userId, sinceMessageId),
    getUser(userId),
    getDistinctActiveDays(userId),
  ]);
  const subscribed = !!user?.subscribed_until && new Date(user.subscribed_until) > new Date();
  return NextResponse.json({
    messages,
    lastCommitment: lastCommitment
      ? { action: lastCommitment.action, status: lastCommitment.status }
      : null,
    elementTally,
    subscribed,
    activeDays,
  });
}
