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
  getUserShape,
  setUserShape,
  type StoredMessage,
  type Stage,
  type ShapeFamily,
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
          enum: ["landed", "tried", "not_landed"],
          description:
            "\"landed\" if they followed through. \"tried\" if they made a real attempt but it didn't land. \"not_landed\" if they didn't engage with it at all.",
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
  {
    name: "assign_shape_family",
    description:
      "Call this AT MOST ONCE per person, ever -- only if the context below says no shape family is assigned yet, and only once you have a real feel for how they express themselves (never on the very first message alone; wait until Mystery or Safety has given you something to go on). Quietly match them to whichever family fits the actual shape of how they're moving through this, not what they say they want to be. Never ask them directly, never mention this choice or these categories to them -- it is entirely invisible.\n\n- tree: grounding, patience, roots -- someone building slowly, staying planted through pressure.\n- flame: transformation, intensity -- someone burning through a change, urgent and consuming.\n- river: adaptability, emotional flow -- someone moving around obstacles, shaped by what they pass through.\n- constellation: meaning, direction, big-picture -- someone oriented by a distant point, connecting scattered things into a pattern.\n- mountain: stillness, endurance -- someone unmoved under real weight, holding rather than reacting.",
    input_schema: {
      type: "object",
      properties: {
        family: {
          type: "string",
          enum: ["tree", "flame", "river", "constellation", "mountain"],
        },
      },
      required: ["family"],
    },
  },
  {
    name: "offer_branches",
    description:
      "Call this AT MOST ONCE per reply, and only when it genuinely fits -- not on ordinary exchanges. Use it when the conversation has arrived at a real fork: 2-3 concrete, different directions it could go from here, grounded in exactly what was just said. These are never the only option -- free text is always still there underneath -- just something concrete to tap when someone doesn't know what to say next. Use their own words and specifics, never generic labels like 'tell me more.' Skip this on most turns.",
    input_schema: {
      type: "object",
      properties: {
        options: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 3,
          description: "2-3 short phrases, each a real next-step direction, in the person's own register.",
        },
      },
      required: ["options"],
    },
  },
];

function todayContext(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `Today's date is ${today}.`;
}

async function openCommitmentContext(userId: string): Promise<string> {
  const open = await getOpenCommitment(userId);
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

// Optional answer to "Where did you feel most alive this week?", asked
// alongside the mood picker on a fresh visit. Private context only — never
// a topic to raise on its own, just a signal for telling apart someone
// pursuing a goal with real fire from someone losing themselves in it.
function alivenessContext(alivenessAnswer: string | null | undefined): string {
  if (!alivenessAnswer || !alivenessAnswer.trim()) return "";
  return `At the start of this visit they were also optionally asked "Where did you feel most alive this week?" and answered: "${alivenessAnswer.trim()}". Use this only to privately judge whether they're moving through life with real fire or losing themselves in the pursuit of something — don't bring it up directly unless it's genuinely relevant to what they say.`;
}

async function stageContext(userId: string): Promise<string> {
  const currentStage = await getUserStage(userId);
  const percentages = await getStagePercentages();
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

async function shapeContext(userId: string): Promise<string> {
  const family = await getUserShape(userId);
  return family
    ? `A shape family is already assigned ("${family}") — do not call assign_shape_family again.`
    : "No shape family assigned yet. Once you have a real feel for them (not on the first message alone), call assign_shape_family.";
}

export interface ChatResult {
  reply: string;
  stage?: Stage;
  shapeFamily?: ShapeFamily;
  branches?: string[];
}

export async function runChat(
  userId: string,
  history: StoredMessage[],
  userMessage: string,
  depth?: string | null,
  uiLang?: string | null,
  alivenessAnswer?: string | null
): Promise<ChatResult> {
  const [openCommitment, stageInfo, shapeInfo] = await Promise.all([
    openCommitmentContext(userId),
    stageContext(userId),
    shapeContext(userId),
  ]);
  const system = `${BASE_SYSTEM_PROMPT}\n\n---\n\nCONTEXT (not visible to the person, never repeat it back verbatim):\n${todayContext()}\n${openCommitment}\n${depthContext(
    depth
  )}\n${uiLanguageContext(uiLang)}\n${alivenessContext(alivenessAnswer)}\n${stageInfo}\n${shapeInfo}`;

  const messages: Anthropic.MessageParam[] = [
    ...toApiMessages(history),
    { role: "user", content: userMessage },
  ];

  let newStage: Stage | undefined;
  let newShape: ShapeFamily | undefined;
  let newBranches: string[] | undefined;

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
      return {
        reply: textBlocks.map((b) => b.text).join("\n").trim(),
        stage: newStage,
        shapeFamily: newShape,
        branches: newBranches,
      };
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUses) {
      try {
        if (call.name === "record_commitment") {
          const input = call.input as { action: string; target_date: string };
          await recordCommitment(userId, input.action, input.target_date);
          toolResults.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: "Recorded.",
          });
        } else if (call.name === "resolve_open_commitment") {
          const input = call.input as { outcome: "landed" | "tried" | "not_landed" };
          await resolveCommitment(userId, input.outcome);
          const landedCount = await countLandedCommitments(userId);
          toolResults.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: `Recorded. Total landed commitments for this person: ${landedCount}.`,
          });
        } else if (call.name === "signal_depth") {
          const input = call.input as { stage: Stage };
          await setUserStage(userId, input.stage);
          newStage = input.stage;
          toolResults.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: "Recorded.",
          });
        } else if (call.name === "assign_shape_family") {
          const input = call.input as { family: ShapeFamily };
          await setUserShape(userId, input.family);
          newShape = input.family;
          toolResults.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: "Recorded.",
          });
        } else if (call.name === "offer_branches") {
          const input = call.input as { options: string[] };
          newBranches = input.options.filter((o) => typeof o === "string" && o.trim()).slice(0, 3);
          toolResults.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: "Shown to the person.",
          });
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: "Unknown tool.",
            is_error: true,
          });
        }
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: "Failed to record.",
          is_error: true,
        });
      }
    }

    messages.push({ role: "user", content: toolResults });

    if (response.stop_reason !== "tool_use") {
      const trailing = textBlocks.map((b) => b.text).join("\n").trim();
      if (trailing)
        return { reply: trailing, stage: newStage, shapeFamily: newShape, branches: newBranches };
    }
  }

  return {
    reply: "Something got tangled on my end — say that again?",
    stage: newStage,
    shapeFamily: newShape,
    branches: newBranches,
  };
}

// --- Weekly mirror line ---
// One earned sentence, in the destiny-mirror register, about who this
// person is becoming — grounded only in their resolved commitments and
// current stage, never in raw conversation content, so it stays safe to
// put on a small shareable card.
export async function generateMirrorLine(
  stage: Stage | undefined,
  resolved: { action: string; status: "landed" | "tried" | "not_landed" }[]
): Promise<string> {
  const list = resolved
    .map((r) => `- ${r.action} — ${r.status === "landed" ? "did it" : r.status === "tried" ? "tried, didn't land" : "didn't engage"}`)
    .join("\n");

  const system = `You are the voice of Just You, writing in the earned "destiny mirror" register: a line specific to what someone has actually done, reflecting who they're becoming. Never generic, never flattery, never a label or category.

Write exactly ONE sentence, under 25 words, about who this person is becoming — grounded in the real pattern below, not in feelings they haven't demonstrated through action.

This line will be shown on a small shareable card someone might screenshot. Do NOT include names, employers, or any other identifying detail, even if implied below — stay in the register of character and pattern.

Their resolved commitments, most recent first:
${list}

Current stage: ${stage || "mystery"}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    system,
    messages: [{ role: "user", content: "Write the line." }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();

  return text;
}

// --- Pattern review ---
// An on-demand, private end-of-conversation read -- not a recap of what was
// said, a read on the pattern someone was actually operating from in it.
// Unlike the mirror line, this may draw on real conversation content since
// it's never meant to be shared or screenshotted -- just for them, in the
// moment they ask for it.
export async function generatePatternReview(
  stage: Stage | undefined,
  recentMessages: StoredMessage[],
  uiLang?: string | null
): Promise<string> {
  const transcript = recentMessages
    .map((m) => `${m.role === "user" ? "Them" : "You"}: ${m.content}`)
    .join("\n");

  const langLine =
    uiLang && uiLang !== "en"
      ? `Reply in the language this conversation is mostly in (UI language: "${uiLang}").`
      : "Reply in English unless the conversation below is clearly in another language.";

  const system = `You are the voice of Just You, offering a private read on the conversation that just happened -- not a summary of what was said, a read on the pattern the person was actually operating from.

Write 3-4 short sentences, as flowing prose -- no headers, no bullet points, no "In this conversation..." framing:
1. Name the real pattern they were operating from -- specific to what they actually said, not a generic label ("anxious," "avoidant") and not a diagnosis.
2. One clear, plain reminder that this pattern is not the whole of who they are -- it's where they're operating from right now, not a permanent identity.
3. Close forward-looking: they're leaving this pattern for one that actually gets them where they want to go -- earned by what specifically happened here, never generic motivation.

Match the voice already established for this app: direct, warm, a close friend who sees clearly -- never therapy language, never clinical, never a list.

${langLine}

Stage reached in this conversation: ${stage || "mystery"}

The conversation:
${transcript}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    system,
    messages: [{ role: "user", content: "Give the read." }],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
}
