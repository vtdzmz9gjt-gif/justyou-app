import { NextResponse } from "next/server";
import { buildSystemPrompt, RESPOND_TOOL } from "@/lib/prompt";
import type { AssistantTurn, SessionRequestBody } from "@/lib/types";
import type { StageKey } from "@/lib/stages";

const STAGE_KEYS: StageKey[] = ["mystery", "safety", "recognition", "courage", "return"];

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  let body: SessionRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { stage, turnCount, history, message } = body;
  if (!STAGE_KEYS.includes(stage) || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const messages = [
    ...(Array.isArray(history) ? history : []).map((turn) => ({
      role: turn.role,
      content: turn.content,
    })),
    { role: "user" as const, content: message },
  ];

  let anthropicRes: Response;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        system: buildSystemPrompt(stage, turnCount),
        messages,
        tools: [RESPOND_TOOL],
        tool_choice: { type: "tool", name: "respond" },
      }),
    });
  } catch {
    return NextResponse.json({ error: "Could not reach the model." }, { status: 502 });
  }

  if (!anthropicRes.ok) {
    const detail = await anthropicRes.text();
    return NextResponse.json(
      { error: `Model request failed (${anthropicRes.status}): ${detail}` },
      { status: 502 },
    );
  }

  const data = await anthropicRes.json();
  const toolUse = (data.content as { type: string; input?: unknown }[])?.find(
    (block) => block.type === "tool_use",
  );

  if (!toolUse || typeof toolUse.input !== "object" || toolUse.input === null) {
    return NextResponse.json({ error: "Model did not return a structured response." }, { status: 502 });
  }

  const input = toolUse.input as Partial<AssistantTurn>;
  if (
    typeof input.truth !== "string" ||
    typeof input.question !== "string" ||
    !Array.isArray(input.branches) ||
    !input.stage ||
    !STAGE_KEYS.includes(input.stage as StageKey)
  ) {
    return NextResponse.json({ error: "Model response was malformed." }, { status: 502 });
  }

  const turn: AssistantTurn = {
    role: "assistant",
    truth: input.truth,
    question: input.question,
    branches: input.branches.filter((b): b is string => typeof b === "string").slice(0, 3),
    stage: input.stage as StageKey,
    weighted: Boolean(input.weighted),
    ...(input.weighted && typeof input.quote === "string" ? { quote: input.quote } : {}),
    ...(input.weighted && typeof input.quoteSource === "string"
      ? { quoteSource: input.quoteSource }
      : {}),
    ...(input.weighted && typeof input.ignition === "string" ? { ignition: input.ignition } : {}),
  };

  return NextResponse.json(turn);
}
