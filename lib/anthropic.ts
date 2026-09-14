import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import {
  getOpenCommitment,
  recordCommitment,
  resolveCommitment,
  countLandedCommitments,
  setUserStage,
  getUserStage,
  getStagePercentages,
  type StoredMessage,
  type Stage,
} from "./db";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

const BASE_SYSTEM_PROMPT = fs.readFileSync(
  path.join(process.cwd(), "system-prompt.md"),
  "utf-8"
);

const tools: Anthropic.Tool[] = [
  {
    name: "record_commitment",
    description:
      "Call this the moment a conversation lands on ONE clear committed next action and a concrete date for when the person will next have the chance to try it. Only call it once per conversation turn, and only when both the action and the date are actually known.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description:
            "The committed action, in the person's own words (e.g. \"tell my manager I want the promotion conversation\").",
        },
        target_date: {
          type: "string",
          description:
            "ISO date (YYYY-MM-DD) of the person's next real chance to try it. Infer this from what they say relative to today.",
        },
      },
      required: ["action", "target_date"],
    },
  },
  {
    name: "resolve_open_commitment",
    description:
      "Call this the moment the person tells you what actually happened with their open commitment — whether they did it, tried but it didn't land, or didn't engage with it at all.",
    input_schema: {
      type: "object",
      properties: {
        outcome: {
          type: "string",
          enum: ["landed", "not_landed"],
          description:
            "\"landed\" if they followed through, \"not_landed\" for either a real attempt that didn't land or no attempt at all — describe the distinction to the person yourself in your reply.",
        },
      },
      required: ["outcome"],
    },
  },
  {
    name: "signal_depth",
    description:
      "Call this ONLY when the conversation has just crossed into a new stage, per the strict gating rules in the system prompt. Never call it to move backward. Never call it more than once per stage per conversation. Most conversations should end in Mystery, Safety, or Recognition — Courage is uncommon, and Return is rare. Do not call this speculatively or to reward effort that doesn't meet the bar.",
    input_schema: {
      type: "object",
      properties: {
        stage: {
          type: "string",
          enum: ["mystery", "safety", "recognition", "courage", "return"],
          description: "The stage just reached, per the gating criteria.",
        },
      },
      required: ["stage"],
    },
  },
];

function todayContext(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `Today's date is ${today}.`;
}

function openCommitmentContext(userId: string): string {
  const open = getOpenCommitment(userId);
  if (!open) return "There is no open commitment right now.";
  return `There is an open commitment, not yet resolved: "${open.action}", target date ${open.target_date}. If that date has arrived or passed, raise it yourself early in your reply, low-pressure, in your own words — don't wait to be asked.`;
}

function depthContext(depth: string | null | undefined): string {
  if (depth === "light")
    return "The person chose 'just looking around' when asked how much they wanted to get into today — open light and easy for the first couple of exchanges. Don't rush toward anything heavy.";
  if (depth === "medium")
    return "The person chose 'a little' when asked how much they wanted to get into today — moderate pacing, neither guarded nor immediately deep.";
  if (depth === "deep")
    return "The person chose 'I've got something on my mind' when asked how much they wanted to get into today — you can go straight to what's real, no need to ease in.";
  return "";
}

// The mood-pick opening line ("I'm feeling calm right now.") is generated
// by the app in English regardless of the visitor's UI language, since
// translating that exact sentence for every supported locale isn't worth
// it. Tell the model the visitor's actual UI language so it doesn't get
// steered into replying in English by that one synthetic line.
function uiLanguageContext(uiLang: string | null | undefined): string {
  if (!uiLang || uiLang === "en") return "";
  return `The visitor's browser/UI language is set to "${uiLang}". If their first message doesn't make the language clear on its own, default to responding in that language instead of English.`;
}

function stageContext(userId: string): string {
  const currentStage = getUserStage(userId);
  const percentages = getStagePercentages();
  const pctLine = Object.keys(percentages).length
    ? `Current real distribution of people across stages: ${JSON.stringify(
        percentages
      )}. You may fold this into a congrats moment for empathy (e.g. "most people are exactly here too"), never as a rank or comparison.`
    : "";
  return `${
    currentStage
      ? `This person's last known stage was "${currentStage}".`
      : "This person has no recorded stage yet — they are starting at Mystery."
  } ${pctLine}`;
}

function toApiMessages(history: StoredMessage[]): Anthropic.MessageParam[] {
  return history.map((m) => ({ role: m.role, content: m.content }));
}

export interface ChatResult {
  reply: string;
  stage?: Stage;
}

export async function runChat(
  userId: string,
  history: StoredMessage[],
  userMessage: string,
  depth?: string | null,
  uiLang?: string | null
): Promise<ChatResult> {
  const system = `${BASE_SYSTEM_PROMPT}\n\n---\n\nCONTEXT (not visible to the person, never repeat it back verbatim):\n${todayContext()}\n${openCommitmentContext(
    userId
  )}\n${depthContext(depth)}\n${uiLanguageContext(uiLang)}\n${stageContext(userId)}`;

  const messages: Anthropic.MessageParam[] = [
    ...toApiMessages(history),
    { role: "user", content: userMessage },
  ];

  let newStage: Stage | undefined;

  // Tool-use loop: the model may call record_commitment / resolve_open_commitment /
  // signal_depth one or more times before producing its actual reply to the person.
  for (let round = 0; round < 4; round++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools,
      messages,
    });

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );

    if (toolUses.length === 0) {
      return { reply: textBlocks.map((b) => b.text).join("\n").trim(), stage: newStage };
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = toolUses.map(
      (call) => {
        try {
          if (call.name === "record_commitment") {
            const input = call.input as { action: string; target_date: string };
            recordCommitment(userId, input.action, input.target_date);
            return {
              type: "tool_result",
              tool_use_id: call.id,
              content: "Recorded.",
            };
          }
          if (call.name === "resolve_open_commitment") {
            const input = call.input as { outcome: "landed" | "not_landed" };
            resolveCommitment(userId, input.outcome);
            return {
              type: "tool_result",
              tool_use_id: call.id,
              content: `Recorded. Total landed commitments for this person: ${countLandedCommitments(
                userId
              )}.`,
            };
          }
          if (call.name === "signal_depth") {
            const input = call.input as { stage: Stage };
            setUserStage(userId, input.stage);
            newStage = input.stage;
            return {
              type: "tool_result",
              tool_use_id: call.id,
              content: "Recorded.",
            };
          }
          return {
            type: "tool_result",
            tool_use_id: call.id,
            content: "Unknown tool.",
            is_error: true,
          };
        } catch (err) {
          return {
            type: "tool_result",
            tool_use_id: call.id,
            content: "Failed to record.",
            is_error: true,
          };
        }
      }
    );

    messages.push({ role: "user", content: toolResults });

    if (response.stop_reason !== "tool_use") {
      const trailing = textBlocks.map((b) => b.text).join("\n").trim();
      if (trailing) return { reply: trailing, stage: newStage };
    }
  }

  return { reply: "Something got tangled on my end — say that again?", stage: newStage };
}
