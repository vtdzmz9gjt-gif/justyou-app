import { NextRequest, NextResponse } from "next/server";
import { addMessage, ensureUser, getMessages } from "@/lib/db";
import { runChat } from "@/lib/anthropic";

export async function POST(req: NextRequest) {
  let body: {
    userId?: string;
    message?: string;
    depth?: string;
    lang?: string;
    alivenessAnswer?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { userId, message, depth, lang, alivenessAnswer } = body;
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

  let result: { reply: string; stage?: string; shapeFamily?: string; branches?: string[] };
  try {
    result = await runChat(userId, history, message.trim(), depth, lang, alivenessAnswer);
  } catch (err) {
    console.error("chat error", err);
    return NextResponse.json(
      { error: "The Return couldn't respond just now. Try again in a moment." },
      { status: 502 }
    );
  }

  await addMessage(userId, "user", message.trim());
  await addMessage(userId, "assistant", result.reply);

  return NextResponse.json({
    reply: result.reply,
    stage: result.stage,
    shapeFamily: result.shapeFamily,
    branches: result.branches,
  });
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }
  await ensureUser(userId);
  return NextResponse.json({ messages: await getMessages(userId) });
}
