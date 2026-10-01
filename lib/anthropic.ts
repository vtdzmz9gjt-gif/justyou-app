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
  recordSephirahTag,
  getGroundedNotes,
  getStoredTensionInsight,
  saveTensionInsight,
  getTreeState,
  recordFamilyPatternTag,
  getFamilyGroundedNotes,
  getSephirahTagCount,
  getFamilyTagCount,
  getStoredReflection,
  saveReflection,
  recordCrossLink,
  consumePendingCrossLinks,
  type StoredMessage,
  type Stage,
  type Element,
  type SephirahWeight,
} from "./db";
import { NODES, NODE_ORDER, TENSION_PAIRS, TIER_RANK, type SephirahKey, type TreeState } from "@/lib/tree";
import { THEMES, type FamilyTheme, type FamilyLine } from "@/lib/family";

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

// Same shape as tag_element -- its own forced, single-purpose call, not a
// tool competing for attention in the main loop. Judges ONE message
// against the ten sephirot. The tier (lightly touched / returned to /
// deeply worked) is never decided here -- that's derived later from the
// whole tag history in lib/db.ts's getTreeState. This call only judges
// how substantial THIS ONE disclosure is, on its own.
const SEPHIRAH_TAG_TOOL: Anthropic.Tool = {
  name: "tag_sephirah",
  description:
    "Classify whether this message genuinely reveals something real about one specific sephirah, and how substantial that single disclosure is.",
  input_schema: {
    type: "object",
    properties: {
      node: {
        type: "string",
        enum: [
          "keter",
          "chokhmah",
          "binah",
          "chesed",
          "gevurah",
          "tiferet",
          "netzach",
          "hod",
          "yesod",
          "malkuth",
          "none",
        ],
      },
      weight: {
        type: "string",
        enum: ["surface", "substantive", "confronted"],
        description: "Ignored when node is \"none\".",
      },
      grounded_in: {
        type: "string",
        description:
          "One short sentence paraphrasing exactly what in the message justifies this node and weight. Ignored when node is \"none\".",
      },
    },
    required: ["node"],
  },
};

const SEPHIRAH_TAG_SYSTEM = `You're judging a single message from someone in a reflective conversation app against the ten sephirot of the Tree of Life. Most messages genuinely reveal nothing about any of them -- use "none" freely; this should be your answer on most turns. Only pick a node when the message actually discloses something real about how this person operates, not because a topic was merely mentioned.

The ten nodes:
- keter: their deepest why -- purpose beneath every other purpose.
- chokhmah: raw force, drive, the paternal influence, what starts things in them.
- binah: depth, understanding, containment, the maternal influence.
- chesed: generosity -- how and why they give to others.
- gevurah: restraint, discipline, boundaries -- what they hold in check.
- tiferet: the balance point -- who they are underneath, their core self.
- netzach: endurance, ambition, the will that keeps pushing.
- hod: humility, self-doubt, real limits -- what actually holds them back.
- yesod: daily habits and patterns -- the ground they stand on, often without noticing.
- malkuth: the real world -- what they actually did, not what they planned or felt.

If more than one node seems to fit, pick the single best one -- never tag more than one node per message.

Once you've picked a node (not "none"), judge how substantial this ONE disclosure is, on its own:
- surface: stated as fact, no visible cost to saying it -- could have been said to a stranger.
- substantive: specific and personal, real stakes or vulnerability, genuine new information about how they operate.
- confronted: the language itself shows resistance or a shift while saying it -- hedging then pushing through, retracting or reframing their own prior self-description, catching themselves mid-thought. This is about friction visible IN THE WORDS, not about how the message is delivered.

Tone is not a signal. Humor, self-deprecation, and casualness are common, ordinary ways real friction gets voiced -- plenty of people confront something true about themselves while laughing, not just while being solemn. Do not downgrade a message to "surface" or "substantive" just because it's delivered lightly, and do not treat a joke as automatic evidence of "confronted" either. Judge weight only by what's actually admitted and whether the sentence itself contains resistance, retraction, or reframing -- never by how heavy or light it sounds.

A comfortable, well-worn self-label ("that's just classic me") is a signal AGAINST "confronted" even when what's being named is real and specific -- it reads as an already-settled story, not a live realization. Reserve "confronted" for a visible pivot: catching an excuse, contradicting how they'd usually put it, admitting something that undercuts their own prior framing.

This judgment is independent of whatever tag_family_pattern decides on the same message. A real internal-structure disclosure belongs here even when no family-origin connection was found or confirmed in the same conversation, and the reverse is equally true -- neither tool's answer should influence the other's.

Call tag_sephirah with your single best answer. When node is "none", you can omit weight and grounded_in.`;

// Same forced, single-purpose, parallel shape as SEPHIRAH_TAG_TOOL. Judges
// which life theme a disclosure belongs to, which parent it traces to, and
// how substantial it is -- tier is derived later, same as the Tree, from
// the whole history in lib/db.ts's getFamilyState.
const FAMILY_TAG_TOOL: Anthropic.Tool = {
  name: "tag_family_pattern",
  description:
    "Classify whether this message reveals a specific inherited pattern that clearly traces to one parent -- which life theme it belongs to, which ancestral line it traces to, and how substantial this one disclosure is.",
  input_schema: {
    type: "object",
    properties: {
      theme: {
        type: "string",
        enum: ["money", "love", "work_life", "body", "none"],
      },
      traces_to: {
        type: "string",
        enum: ["father", "mother"],
        description:
          "Which parent this pattern traces to, per what was actually said -- never guessed or assumed. Ignored when theme is \"none\".",
      },
      weight: {
        type: "string",
        enum: ["surface", "substantive", "confronted"],
        description: "Ignored when theme is \"none\".",
      },
      grounded_in: {
        type: "string",
        description:
          "One short sentence paraphrasing exactly what in the message justifies this theme, trace, and weight. Ignored when theme is \"none\".",
      },
      pattern_broken_instance: {
        type: "boolean",
        description:
          "True only if this message describes a clear, specific, unambiguous PAST-TENSE instance of the person actually acting differently than this inherited pattern -- not a hope, plan, or self-assessment. Default false. Any real ambiguity defaults to false. Ignored when theme is \"none\".",
      },
    },
    required: ["theme"],
  },
};

const FAMILY_TAG_SYSTEM = `You're judging a single message from someone in a reflective conversation app against the Family Constellation system -- four life themes (money, love, work_life, body), each one either untouched or traced to a specific parent (father or mother). Most messages reveal nothing here -- use "none" freely; this should be your answer on most turns.

Only pick a theme when BOTH of these are true from what was actually said:
1. The message discloses a real, specific pattern in one of the four themes -- not a topic merely mentioned.
2. That pattern is actually connected, in the person's own words, to a specific parent -- something they modeled, taught, or passed down, stated or clearly implied by what's actually said.

If a real pattern is disclosed but nothing connects it to a specific parent, do NOT guess which line it's from -- use "none". A pattern with no stated ancestral connection isn't this system's material, even if it's genuinely something real about the person (it may belong to a different part of this app instead -- not your concern here).

The same applies when the conversation explicitly explored a family-origin angle and the person denied it or didn't confirm it ("my parents were pretty steady, actually") -- that's a real, informative answer, not a prompt to guess anyway. Use "none" here even when a different, unrelated pattern lands well elsewhere in the same conversation -- a lens that was tried and came up empty is never tagged just because another lens succeeded.

The four themes:
- money: their relationship to money -- scarcity, safety, proof, what it means to have or not have it.
- love: the shape love took in the home they grew up in, and what shape they now look for or run from.
- work_life: how they learned to treat rest, ambition, and their own worth through work.
- body: what they learned about listening to pain, rest, and their own physical limits.

If more than one theme seems to fit, pick the single best one -- never tag more than one theme per message.

Once you've picked a theme (not "none"), judge how substantial this ONE disclosure is, on its own -- same three tiers, same rules, as everywhere else in this app:
- surface: stated as fact, no visible cost to saying it -- could have been said to a stranger. A purely parent-focused observation with no stated effect on the person yet is still surface, not "none" -- the trace itself is real content.
- substantive: specific and personal, real stakes or vulnerability, genuine new information about how they operate.
- confronted: the language itself shows resistance or a shift while saying it -- hedging then pushing through, retracting or reframing their own prior self-description, catching themselves mid-thought. This is about friction visible IN THE WORDS, not about how the message is delivered.

Tone is not a signal. Humor, self-deprecation, and casualness are common, ordinary ways real friction gets voiced -- plenty of people confront something true about themselves while laughing, not just while being solemn. Do not downgrade a message to "surface" or "substantive" just because it's delivered lightly, and do not treat a joke as automatic evidence of "confronted" either. Judge weight only by what's actually admitted and whether the sentence itself contains resistance, retraction, or reframing -- never by how heavy or light it sounds.

A comfortable, well-worn self-label ("that's just classic me") is a signal AGAINST "confronted" even when what's being named is real and specific -- it reads as an already-settled story, not a live realization. Reserve "confronted" for a visible pivot: catching an excuse, contradicting how they'd usually put it, admitting something that undercuts their own prior framing.

Separately, also judge pattern_broken_instance: true only if this message describes a clear, specific, unambiguous PAST-TENSE instance of the person actually acting differently than the inherited pattern they just named -- something that already happened, not a hope, plan, or self-assessment. The bar is deliberately high: is this clearly and specifically an instance of breaking THIS pattern, not just adjacent to it or mentioned in passing? Any real ambiguity means false -- never credit a near-miss. Four calibration cases:
- "Yeah I definitely got that from my dad -- I guess I do the same thing." -> false. Recognition only, no reported instance.
- "My rent was late and instead of hiding it and scrambling alone like I always do, I actually told my roommate before she asked. First time I've done that." -> true. Concrete, specific, past-tense.
- "I think I'm finally starting to get better about this." -> false. Intention/hope, no actual instance.
- "lol ok this is dumb but I actually told my boss no to extra hours last week, which never happens." -> true. Joking delivery, but a real specific instance underneath -- same tone-is-not-a-signal rule as weight above.

Call tag_family_pattern with your single best answer. When theme is "none", you can omit traces_to, weight, grounded_in, and pattern_broken_instance.`;

// Same parallel, non-blocking shape as tagElement -- fired alongside the
// whole conversational loop, awaited only at the return points.
async function tagSephirah(
  userMessage: string
): Promise<{ node: SephirahKey; weight: SephirahWeight; groundedIn: string } | undefined> {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: SEPHIRAH_TAG_SYSTEM,
      tools: [SEPHIRAH_TAG_TOOL],
      tool_choice: { type: "tool", name: "tag_sephirah" },
      messages: [{ role: "user", content: `Judge this message:\n\n"${userMessage}"` }],
    });
    const call = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "tag_sephirah"
    );
    const input = call?.input as
      | { node?: string; weight?: string; grounded_in?: string }
      | undefined;
    const node = input?.node;
    if (
      node === "keter" ||
      node === "chokhmah" ||
      node === "binah" ||
      node === "chesed" ||
      node === "gevurah" ||
      node === "tiferet" ||
      node === "netzach" ||
      node === "hod" ||
      node === "yesod" ||
      node === "malkuth"
    ) {
      const weight = input?.weight;
      const groundedIn = input?.grounded_in;
      if (
        (weight === "surface" || weight === "substantive" || weight === "confronted") &&
        typeof groundedIn === "string" &&
        groundedIn.trim()
      ) {
        return { node, weight, groundedIn: groundedIn.trim() };
      }
    }
    return undefined;
  } catch (err) {
    console.error("tagSephirah error", err);
    return undefined;
  }
}

// Same shape as tagSephirah.
async function tagFamilyPattern(userMessage: string): Promise<
  | {
      theme: FamilyTheme;
      tracesTo: FamilyLine;
      weight: SephirahWeight;
      groundedIn: string;
      patternBrokenInstance: boolean;
    }
  | undefined
> {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      // ~1,266 tokens -- comfortably over this model's 1,024-token
      // minimum cacheable prefix, unlike ELEMENT_TAG_SYSTEM (~232) and
      // SEPHIRAH_TAG_SYSTEM (~795), which are left uncached below since
      // a marker under the minimum silently creates no cache entry.
      system: [{ type: "text", text: FAMILY_TAG_SYSTEM, cache_control: { type: "ephemeral", ttl: "1h" } }],
      tools: [FAMILY_TAG_TOOL],
      tool_choice: { type: "tool", name: "tag_family_pattern" },
      messages: [{ role: "user", content: `Judge this message:\n\n"${userMessage}"` }],
    });
    const call = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "tag_family_pattern"
    );
    const input = call?.input as
      | {
          theme?: string;
          traces_to?: string;
          weight?: string;
          grounded_in?: string;
          pattern_broken_instance?: boolean;
        }
      | undefined;
    const theme = input?.theme;
    if (theme === "money" || theme === "love" || theme === "work_life" || theme === "body") {
      const tracesTo = input?.traces_to;
      const weight = input?.weight;
      const groundedIn = input?.grounded_in;
      if (
        (tracesTo === "father" || tracesTo === "mother") &&
        (weight === "surface" || weight === "substantive" || weight === "confronted") &&
        typeof groundedIn === "string" &&
        groundedIn.trim()
      ) {
        return {
          theme,
          tracesTo,
          weight,
          groundedIn: groundedIn.trim(),
          patternBrokenInstance: input?.pattern_broken_instance === true,
        };
      }
    }
    return undefined;
  } catch (err) {
    console.error("tagFamilyPattern error", err);
    return undefined;
  }
}

function todayContext(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `Today's date is ${today}.`;
}

// There's no session/day boundary in the schema (one continuous thread per
// person, by design -- see the pattern-review route for the same note) so
// "this sitting" is computed on the fly: walk the history backward from the
// most recent message, and the first gap bigger than SESSION_GAP_MS marks
// where the current, continuous back-and-forth actually started.
const SESSION_GAP_MS = 30 * 60 * 1000;
const PACING_THRESHOLD_MS = 40 * 60 * 1000;

function pacingContext(history: StoredMessage[]): string {
  if (history.length === 0) return "";
  let sittingStart = new Date(history[history.length - 1].created_at).getTime();
  for (let i = history.length - 1; i > 0; i--) {
    const cur = new Date(history[i].created_at).getTime();
    const prev = new Date(history[i - 1].created_at).getTime();
    if (cur - prev > SESSION_GAP_MS) break;
    sittingStart = prev;
  }
  const elapsedMs = Date.now() - sittingStart;
  if (elapsedMs < PACING_THRESHOLD_MS) return "";
  const minutes = Math.round(elapsedMs / 60000);
  return `This sitting has been going for about ${minutes} minutes straight. Let your tone start naturally drifting toward finding a good closing point if the conversation allows it -- see "Pacing over a long sitting" above for how, and its limits.`;
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

// Quiet awareness of the person's own Tree of Life so far -- gives the
// model a real read of which parts are dark or barely touched, so it can
// let a genuine opening steer toward one of those instead of only ever
// reflecting back what's already been said. This is guidance, never a
// checklist: the model decides if/when a natural opening exists, at most
// once per conversation, and never names the mechanism ("Tree,"
// "sephirah," a node's name) to the person -- same "recognition without
// announcement" principle as everything else in the Tree of Life system.
// Skipped entirely for a still-blank tree: with nothing touched yet,
// there's no real pattern to react to, just an ordinary early
// conversation.
async function treeContext(userId: string): Promise<string> {
  const state = await getTreeState(userId);
  const touchedCount = NODE_ORDER.filter((n) => state[n]).length;
  if (touchedCount === 0) return "";

  const lines = NODE_ORDER.map((n) => {
    const label = `${NODES[n].title} (${NODES[n].subtitle})`;
    const s = state[n];
    return `${label}: ${s ? s.tier.replace(/_/g, " ") : "unspoken"}`;
  });

  return `This person's Tree of Life so far -- their own private long-arc pattern, never named or listed back to them, never a checklist to march through:
${lines.join("\n")}
If a real opening comes up naturally, you can let an unspoken or barely-touched area inform which question you ask next -- but only when that's genuinely where the conversation is already headed, never forced, never more than once in a conversation, and never by naming the mechanism to the person.`;
}

// A same-turn double-tag from the PREVIOUS message, queued for this reply
// to name retroactively -- see the pending_cross_links table comment in
// lib/db.ts for why this has to be a turn late rather than same-turn.
// Consumed the moment this runs, regardless of whether the model actually
// uses it -- same one-shot simplicity as everything else surfaced here.
async function crossLinkContext(userId: string): Promise<string> {
  const links = await consumePendingCrossLinks(userId);
  if (links.length === 0) return "";
  const lines = links.map(
    (l) =>
      `Their last message connected both "${NODES[l.sephirahNode].title} (${NODES[l.sephirahNode].subtitle})" from the Tree of Life and "${THEMES[l.familyTheme].title}" from Family Constellation -- the same underlying thing showing up in both.`
  );
  return `${lines.join("\n")}\nIf it fits naturally, you can name that connection now, retroactively, in your own words -- only if it's a genuine fit by the time you're replying, never forced, never more than once.`;
}

function toApiMessages(history: StoredMessage[]): Anthropic.MessageParam[] {
  return history.map((m) => ({ role: m.role, content: m.content }));
}

export interface ChatResult {
  reply: string;
  stage?: Stage;
  branches?: string[];
  element?: Element;
  sephirah?: SephirahKey;
  familyTheme?: FamilyTheme;
  committed?: boolean;
  win?: { action: string; reflection: string };
}

// Awaits the classification and, if it named a real node, writes it --
// same fire-now/await-later shape as elementPromise, just with a DB
// write folded in once the judgment lands. Logged, not thrown, on
// failure: a missed tag should never break the actual reply.
async function resolveSephirahTag(
  userId: string,
  promise: ReturnType<typeof tagSephirah>
): Promise<SephirahKey | undefined> {
  const tag = await promise;
  if (!tag) return undefined;
  try {
    await recordSephirahTag(userId, tag.node, tag.weight, tag.groundedIn);
  } catch (err) {
    console.error("recordSephirahTag error", err);
  }
  return tag.node;
}

// Same shape as resolveSephirahTag.
async function resolveFamilyPatternTag(
  userId: string,
  promise: ReturnType<typeof tagFamilyPattern>
): Promise<FamilyTheme | undefined> {
  const tag = await promise;
  if (!tag) return undefined;
  try {
    await recordFamilyPatternTag(
      userId,
      tag.theme,
      tag.weight,
      tag.tracesTo,
      tag.groundedIn,
      tag.patternBrokenInstance
    );
  } catch (err) {
    console.error("recordFamilyPatternTag error", err);
  }
  return tag.theme;
}

// Queues a same-turn double-tag for the NEXT reply to name retroactively
// -- see crossLinkContext and the pending_cross_links table comment for
// why this can't be handled in the same turn it happens.
async function recordCrossLinkIfBoth(
  userId: string,
  sephirah: SephirahKey | undefined,
  familyTheme: FamilyTheme | undefined
) {
  if (!sephirah || !familyTheme) return;
  try {
    await recordCrossLink(userId, sephirah, familyTheme);
  } catch (err) {
    console.error("recordCrossLink error", err);
  }
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
  const sephirahPromise = resolveSephirahTag(userId, tagSephirah(userMessage));
  const familyPromise = resolveFamilyPatternTag(userId, tagFamilyPattern(userMessage));

  const [openCommitment, stageInfo, treeInfo, crossLinkInfo] = await Promise.all([
    openCommitmentContext(userId),
    stageContext(userId),
    treeContext(userId),
    crossLinkContext(userId),
  ]);
  // Split into a frozen block (cached -- identical for every user, every
  // turn, forever) and a dynamic block (never cached -- today's date,
  // stage, Tree state, etc. change per user/turn and would invalidate a
  // shared breakpoint if mixed into the same block). See prompt-caching
  // notes below the tools array for why this split exists.
  const contextText = `CONTEXT (not visible to the person, never repeat it back verbatim):\n${todayContext()}\n${openCommitment}\n${depthContext(
    depth
  )}\n${uiLanguageContext(uiLang)}\n${alivenessContext(alivenessAnswer)}\n${pacingContext(history)}\n${stageInfo}\n${treeInfo}\n${crossLinkInfo}`;

  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: BASE_SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } },
    { type: "text", text: contextText },
  ];

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
      // Automatic caching for the growing message history -- the SDK
      // places the breakpoint on the last cacheable block and moves it
      // forward as the conversation grows, so prior turns become cache
      // reads instead of full-price resends. Same 1h TTL as the system
      // breakpoint above -- a longer-TTL entry must appear before any
      // shorter one, and this app's per-user reply gaps can easily
      // exceed 5 minutes.
      cache_control: { type: "ephemeral", ttl: "1h" },
    });
    console.log(
      `[cache] round=${round} input=${response.usage.input_tokens} cache_write=${response.usage.cache_creation_input_tokens ?? 0} cache_read=${response.usage.cache_read_input_tokens ?? 0}`
    );

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );

    if (toolUses.length === 0) {
      const sephirah = await sephirahPromise;
      const familyTheme = await familyPromise;
      await recordCrossLinkIfBoth(userId, sephirah, familyTheme);
      return {
        reply: textBlocks.map((b) => b.text).join("\n").trim(),
        stage: newStage,
        branches: newBranches,
        element: await elementPromise,
        sephirah,
        familyTheme,
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
      if (trailing) {
        const sephirah = await sephirahPromise;
        const familyTheme = await familyPromise;
        await recordCrossLinkIfBoth(userId, sephirah, familyTheme);
        return {
          reply: trailing,
          stage: newStage,
          branches: newBranches,
          element: await elementPromise,
          sephirah,
          familyTheme,
          committed,
          win: newWin,
        };
      }
    }
  }

  {
    const sephirah = await sephirahPromise;
    const familyTheme = await familyPromise;
    await recordCrossLinkIfBoth(userId, sephirah, familyTheme);
    return {
      reply: "Something got tangled on my end — say that again?",
      stage: newStage,
      branches: newBranches,
      element: await elementPromise,
      sephirah,
      familyTheme,
      committed,
      win: newWin,
    };
  }
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

// --- Tree of Life: tension-pair insight ---
// Fresh generation grounded in real content, same principle as everything
// else in this build -- no fixed phrase bank. Called at most once per
// person per pair, ever; see getTensionInsights.
async function generateTensionInsight(
  engagedLabel: string,
  quietLabel: string,
  groundedNotes: string[],
  uiLang?: string | null
): Promise<string> {
  const notes = groundedNotes.map((n) => `- ${n}`).join("\n");
  const langLine =
    uiLang && uiLang !== "en"
      ? `Reply in the language this person has been using (UI language: "${uiLang}").`
      : "Reply in English.";

  const system = `You are the voice of Just You. Across real conversations, this person has substantively engaged with "${engagedLabel}" -- specifically:
${notes}

They have said little or nothing, by comparison, about its counterpart in the Tree of Life, "${quietLabel}".

Write one or two short, direct sentences naming this specific imbalance -- grounded only in the actual pattern above, never inventing detail beyond it. Match the voice already established: direct, warm, a close friend who sees clearly, truth over comfort -- never therapy language, never a diagnosis or a label, no exclamation points. Direction only, not a template to copy: "You know how to push. You haven't learned how to accept a limit, and that's costing you something specific."

${langLine}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    system,
    messages: [{ role: "user", content: "Name it." }],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
}

// Checks the three structurally significant pairs against the Tree's
// current state. A pair only qualifies once one side is genuinely
// "returned to" or deeper while the other is absent or only lightly
// touched -- never from a single session, never from raw mention counts.
// Once generated for a pair, the wording is permanent: this returns the
// stored insight on every later call rather than asking the model again.
export async function getTensionInsights(
  userId: string,
  state: TreeState,
  uiLang?: string | null
): Promise<{ pair: string; insight: string }[]> {
  const results: { pair: string; insight: string }[] = [];
  for (const p of TENSION_PAIRS) {
    const existing = await getStoredTensionInsight(userId, p.key);
    if (existing) {
      results.push({ pair: p.key, insight: existing });
      continue;
    }

    const aRank = state[p.a] ? TIER_RANK[state[p.a]!.tier] : -1;
    const bRank = state[p.b] ? TIER_RANK[state[p.b]!.tier] : -1;

    let engaged: SephirahKey | undefined;
    let quiet: SephirahKey | undefined;
    if (aRank >= 1 && bRank <= 0) {
      engaged = p.a;
      quiet = p.b;
    } else if (bRank >= 1 && aRank <= 0) {
      engaged = p.b;
      quiet = p.a;
    }
    if (!engaged || !quiet) continue;

    const notes = await getGroundedNotes(userId, engaged);
    if (notes.length === 0) continue;

    try {
      const insight = await generateTensionInsight(
        `${NODES[engaged].title} (${NODES[engaged].subtitle})`,
        `${NODES[quiet].title} (${NODES[quiet].subtitle})`,
        notes,
        uiLang
      );
      if (insight) {
        await saveTensionInsight(userId, p.key, insight);
        results.push({ pair: p.key, insight });
      }
    } catch (err) {
      console.error("generateTensionInsight error", err);
    }
  }
  return results;
}

// "Your pattern" -- a personal reflection for one node/theme's detail
// panel, grounded in the accumulated real disclosures for it (capped at
// the most recent 10 -- see getNodeReflection below for why that bound
// doesn't need to be smarter than that yet). Explicit specificity rule:
// every sentence must tie to something actually said, never a
// restatement of the static archetype text in different words and never
// generic language that could apply to any user of this node -- if
// there's nothing specific enough to ground a sentence in, leave it out.
// One real sentence beats three padded ones.
async function generateNodeReflection(
  label: string,
  groundedNotes: string[],
  uiLang?: string | null
): Promise<string> {
  const notes = groundedNotes.map((n) => `- ${n}`).join("\n");
  const langLine =
    uiLang && uiLang !== "en"
      ? `Reply in the language this person has been using (UI language: "${uiLang}").`
      : "Reply in English.";

  const system = `You are the voice of Just You. Across real conversations, this person has said the following about "${label}", most recent first:
${notes}

Write a short, private reflection on THEIR OWN specific pattern here -- not a restatement of what this theme generally means, and not generic language that could apply to anyone. Every sentence must reference or closely paraphrase something they actually said above; if you can't ground a sentence in something real from the notes, leave it out rather than padding with generic phrasing -- a single sentence tied to something real is better than three vague ones. If the notes show they've returned to this more than once, let that recurrence show -- whether it's deepened, shifted, or simply repeated -- rather than just restating one note. Match the voice already established: direct, warm, a close friend who sees clearly -- never therapy language, no exclamation points.

${langLine}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    system,
    messages: [{ role: "user", content: "Reflect it back." }],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
}

// Regenerates only when the node's tag count has actually grown since
// the last generation -- an unchanged count serves the cached reflection
// instantly, no model call. Capped at the 10 most recent grounded notes
// regardless of total history length, which bounds cost/context
// indefinitely; if a real user's history ever outgrows what that recency
// window can represent well, the next step would be periodic
// summarization, not attempted here since it isn't a real problem yet.
export async function getNodeReflection(
  userId: string,
  system: "tree" | "family",
  node: string,
  uiLang?: string | null
): Promise<string> {
  const currentCount =
    system === "tree"
      ? await getSephirahTagCount(userId, node as SephirahKey)
      : await getFamilyTagCount(userId, node as FamilyTheme);

  if (currentCount === 0) return "";

  const stored = await getStoredReflection(userId, system, node);
  if (stored && stored.tagCountAtGeneration === currentCount) {
    return stored.reflection;
  }

  const notes =
    system === "tree"
      ? await getGroundedNotes(userId, node as SephirahKey, 10)
      : await getFamilyGroundedNotes(userId, node as FamilyTheme, 10);
  if (notes.length === 0) return "";

  const label =
    system === "tree"
      ? `${NODES[node as SephirahKey].title} (${NODES[node as SephirahKey].subtitle})`
      : THEMES[node as FamilyTheme].title;

  try {
    const reflection = await generateNodeReflection(label, notes, uiLang);
    if (!reflection) return "";
    await saveReflection(userId, system, node, reflection, currentCount);
    return reflection;
  } catch (err) {
    console.error("generateNodeReflection error", err);
    return stored?.reflection ?? "";
  }
}

// --- Aliveness Compass (standalone exercise) ---
// A short, separate, fixed-sequence exercise (its own entry point, not the
// main conversation) -- distinct from "Aliveness as compass" above, which
// fires on its own judgment mid-conversation and is untouched by this.
// Two answers in, five fresh lines and a closing line out. Nothing here is
// stored: no messages row, no tag, no tree/family contamination -- this
// is scripted exercise content, not organic conversation, and the two
// systems must never mix.
const ALIVENESS_EXERCISE_TOOL: Anthropic.Tool = {
  name: "give_aliveness_exercise",
  description:
    "Return the five-part reveal and the closing line for the Aliveness Compass exercise, composed fresh from the person's two answers.",
  input_schema: {
    type: "object",
    properties: {
      signs: {
        type: "array",
        description:
          "Exactly five short lines, one per idea-seed, each composed fresh and grounded in the person's two specific answers -- never the idea-seed wording verbatim, never generic.",
        items: { type: "string" },
        minItems: 5,
        maxItems: 5,
      },
      closing: {
        type: "string",
        description:
          "One closing line, also composed fresh, tying the five together and grounded in their specific answers.",
      },
    },
    required: ["signs", "closing"],
  },
};

export async function generateAlivenessExercise(
  alivenessAnswer: string,
  stuckAnswer: string,
  uiLang?: string | null
): Promise<{ signs: string[]; closing: string }> {
  const langLine =
    uiLang && uiLang !== "en"
      ? `Reply in the language these answers are written in (UI language: "${uiLang}").`
      : "Reply in English unless the answers below are clearly in another language.";

  const system = `You are the voice of Just You, running a short standalone reflective exercise. Someone has answered two questions:

1. "Where did you feel most alive this week?" -- ${JSON.stringify(alivenessAnswer)}
2. "What's the thing you keep going back and forth on?" -- ${JSON.stringify(stuckAnswer)}

Call give_aliveness_exercise with five short lines and one closing line, all composed fresh and grounded specifically in what they actually wrote above -- never generic, never reusable for someone else's answers.

Draw each of the five lines from one of these ideas -- as inspiration for what to say, never phrasing to reuse verbatim:
- What lit them up wasn't random -- it's information their thinking hasn't caught up to yet.
- Full commitment beats rationing -- giving something everything, past the point it feels sensible, tells them more than a cautious taste of it does.
- Needing to know how it turns out is often the same grip that's keeping them from moving at all.
- Difficulty isn't proof of wrongness -- it's just the shape truth takes before it's familiar.
- Ask whether the hesitation is actually theirs, or an inherited rule they never checked.

Never suggest that belief alone rewrites what's actually true -- an inherited pattern, a hard fact, the real structural position someone is in. What's given is never talked away or reframed as something to simply think or feel your way past. What's genuinely free is only what someone does with it: keep carrying it, or consciously set it down. "Give it everything" always means full presence and effort, never "believe hard enough and the facts change."

Each line: one sentence, short, direct -- a close friend who sees clearly, never therapy language, never a list read aloud. The closing line ties the five together and should feel like the one thing worth carrying out of this, not a summary.

${langLine}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    system,
    tools: [ALIVENESS_EXERCISE_TOOL],
    tool_choice: { type: "tool", name: "give_aliveness_exercise" },
    messages: [{ role: "user", content: "Give the exercise." }],
  });

  const call = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "give_aliveness_exercise"
  );
  const input = call?.input as { signs?: unknown; closing?: unknown } | undefined;
  const signs = Array.isArray(input?.signs)
    ? input.signs.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];
  const closing = typeof input?.closing === "string" ? input.closing.trim() : "";

  if (signs.length !== 5 || !closing) {
    throw new Error("Malformed aliveness exercise response.");
  }

  return { signs: signs.map((s) => s.trim()), closing };
}
