import { NextRequest, NextResponse } from "next/server";
import {
  addMessage,
  ensureUser,
  getMessages,
  getMostRecentCommitment,
  getElementTally,
  type Element,
} from "@/lib/db";
import { runChat } from "@/lib/anthropic";

// runChat's tool-use loop can make up to 4 sequential calls to Claude in a
// single turn (recording a commitment, signaling a stage, assigning a shape
// family, then the actual reply) -- comfortably past Vercel's default
// function timeout on a slow round. Needs a paid plan; Hobby's 10s cap
// can't be raised past this.
export const maxDuration = 60;

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

  const userMessageId = await addMessage(userId, "user", message.trim(), result.element);
  const assistantMessageId = await addMessage(userId, "assistant", result.reply);

  const boundary = typeof sinceMessageId === "number" ? sinceMessageId : 0;
  const elementTally = await getElementTally(userId, boundary);

  return NextResponse.json({
    reply: result.reply,
    stage: result.stage,
    shapeFamily: result.shapeFamily,
    branches: result.branches,
    elementTally,
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
