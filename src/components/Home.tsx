"use client";

import { STAGES } from "@/lib/stages";

export default function Home({ onContinue }: { onContinue: () => void }) {
  const stage = STAGES[0];

  return (
    <div className="screen" style={{ justifyContent: "center", gap: 24 }}>
      <div className="home-eyebrow">just you</div>
      <div className="home-stage">{stage.line}</div>
      <div className="home-sub">
        To move forward: {stage.moveForward}
      </div>
      <button className="home-continue" onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}
