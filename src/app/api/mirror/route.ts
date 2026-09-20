import { NextResponse } from "next/server";
import { buildMirrorPrompt, MIRROR_TOOL, type MirrorActionSummary } from "@/lib/prompt";
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

  let body: { stage: StageKey; actions: MirrorActionSummary[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { stage, actions } = body;
  if (!STAGE_KEYS.includes(stage) || !Array.isArray(actions) || actions.length === 0) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

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
        max_tokens: 256,
        system: buildMirrorPrompt(stage, actions.slice(0, 10)),
        messages: [{ role: "user", content: "Generate the line." }],
        tools: [MIRROR_TOOL],
        tool_choice: { type: "tool", name: "mirror_line" },
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
  const input = toolUse?.input as { line?: string } | undefined;

  if (!input || typeof input.line !== "string" || !input.line.trim()) {
    return NextResponse.json({ error: "Model did not return a line." }, { status: 502 });
  }

  return NextResponse.json({ line: input.line.trim() });
}
