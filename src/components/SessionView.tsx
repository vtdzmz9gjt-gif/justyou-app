"use client";

import { useEffect } from "react";
import { STAGES, type StageKey } from "@/lib/stages";
import { playChime } from "@/lib/sound";

const CURRENT: StageKey = "recognition";

export default function SessionView({ onExit }: { onExit: () => void }) {
  useEffect(() => {
    playChime();
  }, []);

  const currentIdx = STAGES.findIndex((s) => s.key === CURRENT);

  return (
    <div className="screen">
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
          <button key={s.key} className={i === currentIdx ? "on" : ""}>
            {s.name}
          </button>
        ))}
      </div>

      <div className="session" style={{ marginTop: 56 }}>
        <div className="user-line beat b1">
          I&rsquo;ve been passed over for a promotion again. I work harder than
          everyone on my team. It&rsquo;s not fair.
        </div>

        <div className="truth beat b2">
          <span className="lede">You&rsquo;re not wrong to be angry.</span> But
          don&rsquo;t let &ldquo;unfair&rdquo; be where this ends &mdash; that
          word has a way of putting people to sleep right when they should be
          waking up.
          <br />
          <br />
          You weren&rsquo;t passed over by accident. Something in how you&rsquo;re
          seen hasn&rsquo;t caught up to how hard you work. That&rsquo;s not
          injustice &mdash; it&rsquo;s information most people never study
          until it&rsquo;s cost them twice.
        </div>

        <div className="quote beat b3">
          Everyone sees what you appear to be, few experience what you really
          are.
          <cite>Machiavelli</cite>
        </div>

        <div className="question beat b4">
          What do you actually want &mdash; to be seen in this room, or the
          clarity to know if this room even deserves you?
        </div>

        <div className="branches beat b4">
          <button className="branch">Show me how to be seen</button>
          <button className="branch">Help me see clearly if I should stay</button>
        </div>

        <div className="divider beat b5" />

        <div className="ignition beat b5">
          Every person who&rsquo;s ever risen did it through exactly this kind
          of friction. Yours is not the exception. It&rsquo;s the proof.
        </div>
        <div className="meta beat b5">held, not answered</div>
        <div className="meta beat b5" style={{ marginTop: 20 }}>
          example exchange &mdash; live sessions arrive in phase 2
        </div>

        <button className="exit-hint" onClick={onExit}>
          leave this here for now
        </button>
      </div>
    </div>
  );
}
