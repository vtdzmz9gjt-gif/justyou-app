"use client";

import { useEffect, useRef, useState } from "react";
import { STAGES, type StageKey } from "@/lib/stages";
import type { AssistantTurn, Turn } from "@/lib/types";
import { playChime } from "@/lib/sound";

const OPENING_LINE =
  "You know exactly who you're not. You've just never asked who's left. This is where you meet the rest of it.";
const OPENING_QUESTION = "What's going on with you right now?";

function flatten(turn: AssistantTurn): string {
  const parts = [turn.truth];
  if (turn.quote) parts.push(`"${turn.quote}"${turn.quoteSource ? ` — ${turn.quoteSource}` : ""}`);
  parts.push(turn.question);
  if (turn.ignition) parts.push(turn.ignition);
  return parts.join("\n\n");
}

export default function SessionView({ onExit }: { onExit: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [stage, setStage] = useState<StageKey>("mystery");
  const [input, setInput] = useState("");
  const [alivenessInput, setAlivenessInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    playChime();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const isFirst = turns.length === 0;
    const nextTurns: Turn[] = [...turns, { role: "user", text: trimmed }];
    setTurns(nextTurns);
    setInput("");
    setLoading(true);
    setErrorText(null);
    setFailedMessage(null);

    const history = turns.map((t) =>
      t.role === "user" ? { role: "user" as const, content: t.text } : { role: "assistant" as const, content: flatten(t) },
    );
    const turnCount = turns.filter((t) => t.role === "assistant").length + 1;
    const alivenessAnswer = isFirst && alivenessInput.trim() ? alivenessInput.trim() : undefined;

    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage, turnCount, history, message: trimmed, alivenessAnswer }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const data: AssistantTurn = await res.json();
      setTurns([...nextTurns, data]);
      setStage(data.stage);
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
            <p className="opening-line">{OPENING_LINE}</p>
            <p className="opening-question">{OPENING_QUESTION}</p>
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
