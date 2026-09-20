"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { STAGES, type StageKey } from "@/lib/stages";
import type { AssistantTurn, Turn } from "@/lib/types";
import { playChime } from "@/lib/sound";
import {
  addTrailEntry,
  dueTrailEntries,
  loadState,
  resolveTrailEntry,
  updateLastStageAndPhrase,
  type TrailEntry,
} from "@/lib/storage";

const OPENING_LINE =
  "You know exactly who you're not. You've just never asked who's left. This is where you meet the rest of it.";
const OPENING_QUESTION = "What's going on with you right now?";

const CHECK_IN_OPTIONS: { label: string; outcome: "did" | "tried" | "missed" }[] = [
  { label: "did it", outcome: "did" },
  { label: "tried, but it didn't stick", outcome: "tried" },
  { label: "didn't get to it", outcome: "missed" },
];

function flatten(turn: AssistantTurn): string {
  const parts = [turn.truth];
  if (turn.quote) parts.push(`"${turn.quote}"${turn.quoteSource ? ` — ${turn.quoteSource}` : ""}`);
  parts.push(turn.question);
  if (turn.ignition) parts.push(turn.ignition);
  return parts.join("\n\n");
}

export default function SessionView({ onExit }: { onExit: () => void }) {
  const [initial] = useState(() => {
    const stored = loadState();
    const due = dueTrailEntries(stored);
    return { stored, checkInEntry: due[0] as TrailEntry | undefined };
  });

  const [turns, setTurns] = useState<Turn[]>([]);
  const [stage, setStage] = useState<StageKey>(initial.stored.lastStage);
  const [input, setInput] = useState("");
  const [alivenessInput, setAlivenessInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const checkInEntry = initial.checkInEntry;
  // sessionCount is incremented at Threshold-clear, just before this mounts —
  // so a value of 1 means "this is their first ever visit."
  const isReturning = initial.stored.sessionCount > 1;
  const lastActionText = initial.stored.trail[0]?.actionText;
  const lastPhrase = initial.stored.lastPhrase;

  useEffect(() => {
    playChime();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, loading]);

  async function send(text: string, resolveOutcome?: "did" | "tried" | "missed") {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const isFirst = turns.length === 0;
    const nextTurns: Turn[] = [...turns, { role: "user", text: trimmed }];
    setTurns(nextTurns);
    setInput("");
    setLoading(true);
    setErrorText(null);
    setFailedMessage(null);

    if (isFirst && checkInEntry && resolveOutcome) {
      resolveTrailEntry(checkInEntry.id, resolveOutcome);
      track("action_outcome", { outcome: resolveOutcome });
    }

    const history = turns.map((t) =>
      t.role === "user" ? { role: "user" as const, content: t.text } : { role: "assistant" as const, content: flatten(t) },
    );
    const turnCount = turns.filter((t) => t.role === "assistant").length + 1;
    const alivenessAnswer = isFirst && !checkInEntry && alivenessInput.trim() ? alivenessInput.trim() : undefined;
    const checkInAction = isFirst && checkInEntry ? checkInEntry.actionText : undefined;

    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage, turnCount, history, message: trimmed, alivenessAnswer, checkInAction }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const data: AssistantTurn = await res.json();
      setTurns([...nextTurns, data]);
      setStage(data.stage);
      updateLastStageAndPhrase(data.stage, trimmed);
      if (data.committedAction) {
        addTrailEntry(data.committedAction, data.stage, data.checkInDays);
      }
    } catch (err) {
      setTurns(turns); // roll back to before the user's message
      setFailedMessage(trimmed);
      setErrorText(err instanceof Error ? err.message : "Something didn't load.");
    } finally {
      setLoading(false);
    }
  }

  const currentIdx = STAGES.findIndex((s) => s.key === stage);
  const lastAssistant = [...turns].reverse().find((t): t is AssistantTurn => t.role === "assistant");
  const branches = lastAssistant?.branches ?? [];

  const openingLine = checkInEntry
    ? `Last time, you said you'd ${checkInEntry.actionText}.`
    : isReturning && lastActionText
      ? `Last time, you said you'd ${lastActionText}.`
      : isReturning && lastPhrase
        ? `Last time you said: "${lastPhrase}"`
        : OPENING_LINE;

  const openingQuestion = checkInEntry ? "Did you get to it?" : OPENING_QUESTION;

  return (
    <div className="screen">
      {turns.length > 0 && (
        <>
          <div className="stage-track">
            {STAGES.map((s, i) => (
              <button
                key={s.key}
                className={`stage-mark ${i < currentIdx ? "done" : ""} ${i === currentIdx ? "current" : ""}`}
                aria-label={s.name}
              />
            ))}
          </div>
          <div className="stage-labels">
            {STAGES.map((s, i) => (
              <span key={s.key} className={i === currentIdx ? "on" : ""}>
                {s.name}
              </span>
            ))}
          </div>
        </>
      )}

      <div className="session" style={{ marginTop: turns.length > 0 ? 56 : 0, flex: 1 }}>
        {turns.length === 0 && (
          <div className="opening">
            <p className="opening-line">{openingLine}</p>
            <p className="opening-question">{openingQuestion}</p>
            {checkInEntry ? (
              <div className="branches" style={{ justifyContent: "center", marginTop: 8 }}>
                {CHECK_IN_OPTIONS.map((opt) => (
                  <button
                    key={opt.outcome}
                    className="branch"
                    onClick={() => send(opt.label, opt.outcome)}
                    disabled={loading}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="aliveness">
                <label htmlFor="aliveness" className="aliveness-label">
                  where did you feel most alive this week? <span>(optional)</span>
                </label>
                <input
                  id="aliveness"
                  className="aliveness-input"
                  value={alivenessInput}
                  onChange={(e) => setAlivenessInput(e.target.value)}
                  disabled={loading}
                />
              </div>
            )}
          </div>
        )}

        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <div className="user-line beat b1" key={i}>
              {turn.text}
            </div>
          ) : (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 34 }}>
              <div className="truth beat b1">{turn.truth}</div>
              {turn.styleAcknowledgment && (
                <div className="style-note beat b1">{turn.styleAcknowledgment}</div>
              )}
              {turn.quote && (
                <div className="quote beat b2">
                  {turn.quote}
                  {turn.quoteSource && <cite>{turn.quoteSource}</cite>}
                </div>
              )}
              <div className="question beat b3">{turn.question}</div>
              {turn.ignition && (
                <>
                  <div className="divider beat b4" />
                  <div className="ignition beat b4">{turn.ignition}</div>
                </>
              )}
            </div>
          ),
        )}

        {loading && <div className="thinking">held for a moment&hellip;</div>}

        {failedMessage && (
          <div className="error-row">
            <span>{errorText}</span>
            <button onClick={() => send(failedMessage)}>try again</button>
          </div>
        )}

        {!loading && branches.length > 0 && (
          <div className="branches">
            {branches.map((b, i) => (
              <button key={i} className="branch" onClick={() => send(b)}>
                {b}
              </button>
            ))}
          </div>
        )}

        <div className="composer">
          <textarea
            className="composer-input"
            placeholder="say what's true"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            disabled={loading}
          />
          <div className="composer-row">
            <button className="composer-submit" onClick={() => send(input)} disabled={loading || !input.trim()}>
              continue
            </button>
          </div>
        </div>

        <div ref={bottomRef} />

        {turns.length > 0 && (
          <button className="exit-hint" onClick={onExit}>
            leave this here for now
          </button>
        )}
      </div>
    </div>
  );
}
