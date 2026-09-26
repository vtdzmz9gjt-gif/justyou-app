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
  type Element,
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

// tag_element used to live in the shared `tools` array above, competing for
// the model's attention against five other tools on every single turn --
// in production it essentially never got called (confirmed via logging: a
// whole real conversation, substantial enough to land a commitment, tagged
// zero messages). Pulled out into its own forced, single-purpose call
// instead: no competing priorities, no "should I bother" judgment call.
const ELEMENT_TAG_TOOL: Anthropic.Tool = {
  name: "tag_element",
  description: "Classify which element (or none) this message leans toward.",
  input_schema: {
    type: "object",
    properties: {
      element: {
        type: "string",
        enum: ["fire", "earth", "air", "water", "none"],
      },
    },
    required: ["element"],
  },
};

const ELEMENT_TAG_SYSTEM = `You're classifying a single message from someone in a reflective conversation app, by which of four elements it most carries -- fire, earth, air, water, or none.

Most genuine, substantive messages lean toward one of the four; use "none" only for messages that are truly empty of that -- pure logistics, a bare "ok"/"yes"/"thanks", or scheduling with nothing else in it.

- fire: drive, ambition, action, anger -- pushing to do something, wanting to win, frustration aimed at moving.
- earth: stability, loyalty, groundedness -- steadiness, commitment to people or routines, staying planted.
- air: thought, clarity, ideas, detachment -- reasoning something through, stepping back to see it clearly, intellectualizing.
- water: emotion, intuition, relationships, flow -- feeling something directly, sensing rather than deciding, moving with what's happening rather than against it.

Call tag_element with your single best answer.`;

// Runs in parallel with the main reply, not blocking it -- a small, cheap,
// forced call (tool_choice leaves the model no way to skip it) dedicated
// entirely to this one judgment.
async function tagElement(userMessage: string): Promise<Element | undefined> {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 50,
      system: ELEMENT_TAG_SYSTEM,
      tools: [ELEMENT_TAG_TOOL],
      tool_choice: { type: "tool", name: "tag_element" },
      messages: [{ role: "user", content: `Classify this message:\n\n"${userMessage}"` }],
    });
    const call = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "tag_element"
    );
    const element = (call?.input as { element?: string } | undefined)?.element;
    if (element === "fire" || element === "earth" || element === "air" || element === "water") {
      return element;
    }
    return undefined;
  } catch (err) {
    console.error("tagElement error", err);
    return undefined;
  }
}

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

export interface ChatResult {
  reply: string;
  stage?: Stage;
  branches?: string[];
  element?: Element;
  committed?: boolean;
  win?: { action: string; reflection: string };
}

export async function runChat(
  userId: string,
  history: StoredMessage[],
  userMessage: string,
  depth?: string | null,
  uiLang?: string | null,
  alivenessAnswer?: string | null
): Promise<ChatResult> {
  // Fired now, awaited later -- runs alongside the whole conversational
  // loop below rather than adding its own sequential round-trip.
  const elementPromise = tagElement(userMessage);

  const [openCommitment, stageInfo] = await Promise.all([
    openCommitmentContext(userId),
    stageContext(userId),
  ]);
  const system = `${BASE_SYSTEM_PROMPT}\n\n---\n\nCONTEXT (not visible to the person, never repeat it back verbatim):\n${todayContext()}\n${openCommitment}\n${depthContext(
    depth
  )}\n${uiLanguageContext(uiLang)}\n${alivenessContext(alivenessAnswer)}\n${stageInfo}`;

  const messages: Anthropic.MessageParam[] = [
    ...toApiMessages(history),
    { role: "user", content: userMessage },
  ];

  let newStage: Stage | undefined;
  let newBranches: string[] | undefined;
  let newWin: { action: string; reflection: string } | undefined;
  let committed = false;

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
        branches: newBranches,
        element: await elementPromise,
        committed,
        win: newWin,
      };
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUses) {
      try {
        if (call.name === "record_commitment") {
          const input = call.input as { action: string; target_date: string };
          await recordCommitment(userId, input.action, input.target_date);
          committed = true;
          toolResults.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: "Recorded.",
          });
        } else if (call.name === "resolve_open_commitment") {
          const input = call.input as { outcome: "landed" | "tried" | "not_landed" };
          const resolved = await resolveCommitment(userId, input.outcome);
          const landedCount = await countLandedCommitments(userId);
          if (input.outcome === "landed" && resolved) {
            const reflection = await generateWinReflection(
              resolved.action,
              [...history, { role: "user", content: userMessage }] as StoredMessage[],
              uiLang
            );
            newWin = { action: resolved.action, reflection };
          }
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
        return {
          reply: trailing,
          stage: newStage,
          branches: newBranches,
          element: await elementPromise,
          committed,
          win: newWin,
        };
    }
  }

  return {
    reply: "Something got tangled on my end — say that again?",
    stage: newStage,
    branches: newBranches,
    element: await elementPromise,
    committed,
    win: newWin,
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

// --- Elemental orb reflection ---
// Shown once, alongside the avatar reveal, at the genuine close of a
// session (record_commitment fired, with enough tagged exchanges behind
// it to mean something -- see the 4-tag floor in the chat route). Unlike
// the shape-family reveal (long-arc, invisible, no numbers), this one is
// explicitly quantified -- that's the whole point of the orb.
export async function generateElementReflection(
  dominant: Element,
  dominantPct: number,
  weakest: Element,
  weakestPct: number,
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

  const system = `You are the voice of Just You, giving a short reflection on the elemental mix of tonight's session -- Fire (drive, ambition, action, anger), Earth (stability, loyalty, groundedness), Air (thought, clarity, ideas, detachment), Water (emotion, intuition, relationships, flow).

Write 3-4 short sentences, flowing prose -- no headers, no bullet points:
1. Name the dominant element and its share plainly (e.g. "Fire carried tonight -- ${dominantPct}% of it").
2. Name the weakest element and its share -- not as a flaw, just what was quiet.
3. Give ONE or two concrete next steps aimed specifically at that gap -- grounded in what they actually said tonight, not generic advice. A fitting line from the same wisdom traditions already grounding this app (Stoic thought, Kabbalah, Greene, Machiavelli, Sun Tzu) is welcome here if it genuinely earns its place.

Match the voice already established: direct, warm, a close friend who sees clearly -- never therapy language, never clinical.

${langLine}

Dominant element: ${dominant} (${dominantPct}%)
Weakest element: ${weakest} (${weakestPct}%)

Tonight's conversation:
${transcript}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    system,
    messages: [{ role: "user", content: "Give the reflection." }],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
}

// --- Weekly wins recap ---
// Shown once a week, client-triggered (their own browser clock, Sunday
// 7pm local) -- a short line tying the week's landed commitments together,
// grounded only in the actions themselves (no raw conversation content,
// same boundary as the mirror line).
export async function generateWeeklyRecapLine(
  wins: { action: string }[],
  uiLang?: string | null
): Promise<string> {
  const list = wins.map((w) => `- ${w.action}`).join("\n");

  const langLine =
    uiLang && uiLang !== "en"
      ? `Reply in the language this conversation is mostly in (UI language: "${uiLang}").`
      : "Reply in English.";

  const system = `You are the voice of Just You, closing out a week of real follow-through. Write ONE short sentence, under 25 words, marking the pattern across this week's actual wins below -- specific to what they did, not generic motivation ("Keep it up!", "Amazing week!"). Match the voice already established: direct, warm, a close friend who sees clearly.

${langLine}

This week's landed commitments:
${list}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 150,
    system,
    messages: [{ role: "user", content: "Write the line." }],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
}

// --- Win celebration ---
// Fires the moment resolve_open_commitment lands with outcome "landed" --
// an actual accomplishment, not a passive reflection like the pattern
// review or mirror line. Grounded in the specific action and whatever
// they just said about how it went, never generic praise.
export async function generateWinReflection(
  action: string,
  recentMessages: { role: "user" | "assistant"; content: string }[],
  uiLang?: string | null
): Promise<string> {
  const transcript = recentMessages
    .slice(-12)
    .map((m) => `${m.role === "user" ? "Them" : "You"}: ${m.content}`)
    .join("\n");

  const langLine =
    uiLang && uiLang !== "en"
      ? `Reply in the language this conversation is mostly in (UI language: "${uiLang}").`
      : "Reply in English unless the conversation below is clearly in another language.";

  const system = `You are the voice of Just You. Someone just told you they actually followed through on a real commitment: "${action}".

Write 1-2 short sentences marking it -- specific to what they actually said about how it went (a detail, a timing, something that shows this was real and not just checked off), never generic congratulations ("Great job!", "Way to go!", "Amazing!"). Match the voice already established: direct, warm, a close friend who sees clearly -- never cheerleader-y, never therapy language, no exclamation points unless one is genuinely earned.

${langLine}

Recent conversation:
${transcript}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    system,
    messages: [{ role: "user", content: "Mark it." }],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
}
