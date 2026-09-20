"use client";

import { useState } from "react";
import { STAGES } from "@/lib/stages";
import { loadState } from "@/lib/storage";

export default function Home({ onContinue }: { onContinue: () => void }) {
  const [state] = useState(() => loadState());

  const stageInfo = STAGES.find((s) => s.key === state.lastStage) ?? STAGES[0];
  // sessionCount is incremented at Threshold-clear, just before Home mounts —
  // so a value of 1 means "this is their first ever visit."
  const isReturning = state.sessionCount > 1;
  const lastAction = state.trail[0]?.actionText;
  const showStageAwareness = state.sessionCount >= 3;

  return (
    <div className="screen" style={{ justifyContent: "center", gap: 24 }}>
      <div className="home-eyebrow">{isReturning ? `session ${state.sessionCount}` : "just you"}</div>
      <div className="home-stage">{stageInfo.line}</div>
      <div className="home-sub">
        {isReturning && lastAction ? `Last time, you said you'd ${lastAction}.` : `To move forward: ${stageInfo.moveForward}`}
      </div>
      {showStageAwareness && (
        <div className="home-sub" style={{ opacity: 0.75, fontStyle: "italic" }}>
          You seem to be in {stageInfo.name} right now.
        </div>
      )}
      <button className="home-continue" onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}
