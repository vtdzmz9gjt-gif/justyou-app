"use client";

import { useState } from "react";
import { ArrowIcon } from "./icons";

// A short, standalone guided exercise -- its own entry point (Settings),
// its own fixed two-question sequence, its own generation call. Entirely
// separate from the organic "Aliveness as compass" behavior that already
// lives inside the main conversation: that one fires on the AI's own
// judgment mid-chat and is untouched by this file. Nothing here is
// persisted -- no message row, no tag, no tree/family state -- by design,
// so this scripted content can never contaminate those systems.

// English-only for now, same call made for subscriptions -- this is new
// enough that translating all 22 languages up front isn't worth blocking
// the build on.
const COPY = {
  entryLabel: "Aliveness Compass",
  eyebrow: "Aliveness Compass",
  step1Label: "1 of 2",
  step2Label: "2 of 2",
  question1: "Where did you feel most alive this week?",
  question2: "What's the thing you keep going back and forth on?",
  placeholder: "Take a moment with it...",
  continueLabel: "Continue",
  hint: "A few more words would help this mean something.",
  loadingLabel: "Putting it together",
  charge: "to carry into the day",
  doneLabel: "Done",
  tryAgainLabel: "Try again",
  startOverLabel: "start over with different answers",
  dismissLabel: "close",
};

const MIN_WORDS = 3;

function hasEnoughWords(value: string): boolean {
  return value.trim().split(/\s+/).filter(Boolean).length >= MIN_WORDS;
}

export default function AlivenessCompass({
  lang,
  onClose,
}: {
  lang: string;
  // Hands back the first answer (if any real one was given) so the
  // conversation can treat it the same way an opening-sequence answer
  // used to be treated -- forwarded as context on the next real message,
  // not persisted anywhere by this component itself.
  onClose: (alivenessAnswer?: string) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [alivenessAnswer, setAlivenessAnswer] = useState("");
  const [stuckAnswer, setStuckAnswer] = useState("");
  const [showHint1, setShowHint1] = useState(false);
  const [showHint2, setShowHint2] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ signs: string[]; closing: string } | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/aliveness-exercise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alivenessAnswer, stuckAnswer, lang }),
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.signs) || typeof data.closing !== "string") {
        throw new Error(data.error || "Couldn't put that together.");
      }
      setResult({ signs: data.signs, closing: data.closing });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't put that together just now.");
    } finally {
      setLoading(false);
    }
  }

  function handleStep1Continue() {
    if (!hasEnoughWords(alivenessAnswer)) {
      setShowHint1(true);
      return;
    }
    setShowHint1(false);
    setStep(2);
  }

  function handleStep2Continue() {
    if (!hasEnoughWords(stuckAnswer)) {
      setShowHint2(true);
      return;
    }
    setShowHint2(false);
    setStep(3);
    generate();
  }

  function startOver() {
    setStep(1);
    setAlivenessAnswer("");
    setStuckAnswer("");
    setShowHint1(false);
    setShowHint2(false);
    setError(null);
    setResult(null);
  }

  return (
    <div
      className="aliveness-compass-overlay"
      onClick={() => onClose(alivenessAnswer.trim() || undefined)}
    >
      <div className="aliveness-compass-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="aliveness-compass-dismiss"
          onClick={() => onClose(alivenessAnswer.trim() || undefined)}
        >
          {COPY.dismissLabel}
        </button>

        <div className="aliveness-compass-eyebrow">{COPY.eyebrow}</div>

        {step === 1 && (
          <>
            <div className="aliveness-compass-step-label">{COPY.step1Label}</div>
            <p className="aliveness-compass-question">{COPY.question1}</p>
            <textarea
              className="aliveness-compass-input"
              rows={2}
              placeholder={COPY.placeholder}
              value={alivenessAnswer}
              onChange={(e) => {
                setAlivenessAnswer(e.target.value);
                if (showHint1) setShowHint1(false);
              }}
              autoFocus
            />
            {showHint1 && <p className="aliveness-compass-hint">{COPY.hint}</p>}
            <button type="button" className="aliveness-compass-continue key-action" onClick={handleStep1Continue}>
              <ArrowIcon />
              {COPY.continueLabel}
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="aliveness-compass-step-label">{COPY.step2Label}</div>
            <p className="aliveness-compass-question">{COPY.question2}</p>
            <textarea
              className="aliveness-compass-input"
              rows={2}
              placeholder={COPY.placeholder}
              value={stuckAnswer}
              onChange={(e) => {
                setStuckAnswer(e.target.value);
                if (showHint2) setShowHint2(false);
              }}
              autoFocus
            />
            {showHint2 && <p className="aliveness-compass-hint">{COPY.hint}</p>}
            <button type="button" className="aliveness-compass-continue key-action" onClick={handleStep2Continue}>
              <ArrowIcon />
              {COPY.continueLabel}
            </button>
          </>
        )}

        {step === 3 && (
          <>
            {loading && (
              <p className="aliveness-compass-loading">
                {COPY.loadingLabel}
                <span className="typing-dots">
                  <span />
                  <span />
                  <span />
                </span>
              </p>
            )}

            {!loading && error && (
              <>
                <p className="aliveness-compass-error">{error}</p>
                <button type="button" className="aliveness-compass-continue key-action" onClick={generate}>
                  <ArrowIcon />
                  {COPY.tryAgainLabel}
                </button>
              </>
            )}

            {!loading && !error && result && (
              <>
                <ol className="aliveness-compass-signs">
                  {result.signs.map((line, i) => (
                    <li
                      key={i}
                      className="sign-item"
                      style={{ animationDelay: `${0.4 + i * 0.9}s` }}
                    >
                      <span className="sign-num">{i + 1} / 5</span>
                      <span className="sign-text">{line}</span>
                    </li>
                  ))}
                </ol>
                <div
                  className="aliveness-compass-charge"
                  style={{ animationDelay: `${0.4 + result.signs.length * 0.9 + 0.4}s` }}
                >
                  <p className="aliveness-compass-charge-text">{result.closing}</p>
                  <div className="aliveness-compass-charge-label">{COPY.charge}</div>
                </div>
                <div className="aliveness-compass-done-row">
                  <button type="button" className="aliveness-compass-start-over" onClick={startOver}>
                    {COPY.startOverLabel}
                  </button>
                  <button
                    type="button"
                    className="aliveness-compass-close"
                    onClick={() => onClose(alivenessAnswer.trim() || undefined)}
                  >
                    {COPY.doneLabel}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
