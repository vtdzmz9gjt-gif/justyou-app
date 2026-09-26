"use client";

import { useState } from "react";
import {
  NODE_ORDER,
  NODES,
  EDGES,
  type SephirahKey,
  type SephirahTier,
  type SephirahState,
  type TreeState,
} from "@/lib/tree";

export type { SephirahKey, SephirahTier, SephirahState, TreeState };

const WISDOM: Record<SephirahKey, { essence: string; shadow: string; next: string }> = {
  keter: {
    essence: "The why beneath every other why — purpose that doesn't need permission or an audience.",
    shadow: "Either grandiosity, or total disconnection from purpose — the sense that nothing actually matters.",
    next: "Name, in one sentence, what you'd still do even if no one ever found out you did it.",
  },
  chokhmah: {
    essence: "Raw force. The spark that actually starts things, before anyone's asked permission.",
    shadow: "Force without direction — action for its own sake, proving instead of building.",
    next: "Pick one thing you're driving hard right now, and ask honestly what it's actually for.",
  },
  binah: {
    essence: "Depth. The capacity to hold and truly understand something before you act on it.",
    shadow: "Endless understanding with no action — analysis used as a hiding place.",
    next: "Take the thing you've \"understood\" for the longest, and do one small piece of it today.",
  },
  chesed: {
    essence: "Generosity. The impulse to build others up, expansively, without keeping score.",
    shadow: "Giving until you disappear — generosity that's actually self-erasure.",
    next: "Say no to one reasonable request this week, on purpose, and notice what it costs you.",
  },
  gevurah: {
    essence: "Discipline. The strength to hold a real line, even when it isn't easy.",
    shadow: "Rigidity and control — punishing yourself or others just to feel safe.",
    next: "Find one boundary you're enforcing out of fear rather than actual value, and loosen it.",
  },
  tiferet: {
    essence: "The balance point. Beauty as harmony between force and restraint, not the absence of either.",
    shadow: "A \"balanced\" self that's actually just numb — avoiding both poles entirely.",
    next: "Notice which pole you retreat to when things get hard, then deliberately do the opposite once.",
  },
  netzach: {
    essence: "Endurance. The will that doesn't quit when things get long and unglamorous.",
    shadow: "Compulsive momentum — mistaking motion for meaning.",
    next: "Stop one thing you're only still doing out of momentum, not actual desire.",
  },
  hod: {
    essence: "Humility. The honesty to see your own real limits, without collapsing into them.",
    shadow: "Self-doubt worn as a permanent identity, instead of used as information.",
    next: "Take the thing you're most sure you \"can't\" do, and do the smallest possible version of it.",
  },
  yesod: {
    essence: "Foundation. The habits and patterns that actually carry you day to day, whether you notice them or not.",
    shadow: "Autopilot — patterns running you, instead of the other way around.",
    next: "Name one daily pattern you've never actually chosen — only inherited.",
  },
  malkuth: {
    essence: "The real world. Where everything above finally has to become true, or it was only ever an idea.",
    shadow: "Insight without action — knowing without ever doing, indefinitely.",
    next: "Take the last thing you understood about yourself, and do one physical thing because of it today.",
  },
};

const TIER_LABEL: Record<SephirahTier, string> = {
  lightly_touched: "lightly touched",
  returned_to: "returned to",
  deeply_worked: "deeply worked",
};

// Brightness/size step per tier -- depth, not a tap count.
const TIER_DEPTH: Record<SephirahTier, number> = {
  lightly_touched: 0.35,
  returned_to: 0.68,
  deeply_worked: 1,
};

function NodeDetail({
  sephirah,
  state,
  onClose,
  closeLabel,
}: {
  sephirah: SephirahKey;
  state: SephirahState;
  onClose: () => void;
  closeLabel: string;
}) {
  const node = NODES[sephirah];
  const wisdom = WISDOM[sephirah];
  return (
    <div className="tree-detail-overlay" onClick={onClose}>
      <div className="tree-detail-card" onClick={(e) => e.stopPropagation()}>
        <p className="tree-detail-name">{node.title}</p>
        <p className="tree-detail-sub">{node.subtitle}</p>
        <p className="tree-detail-tier">{TIER_LABEL[state.tier]} so far</p>
        <div className="tree-detail-block">
          <p className="tree-detail-label">Essence</p>
          <p className="tree-detail-text">{wisdom.essence}</p>
        </div>
        <div className="tree-detail-block">
          <p className="tree-detail-label">Shadow</p>
          <p className="tree-detail-text">{wisdom.shadow}</p>
        </div>
        <div className="tree-detail-block">
          <p className="tree-detail-label">Next step</p>
          <p className="tree-detail-text">{wisdom.next}</p>
        </div>
        <button type="button" className="tree-detail-close" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}

// The Tree of Life: a long-arc, cross-session symbol that never resets --
// unlike the per-session elemental avatar, nothing here disappears when a
// conversation ends. A dark node means genuinely unspoken, not missing or
// broken; tapping one does nothing, same as an empty node should. Da'at
// (the hidden eleventh point) isn't part of this yet -- it depends on the
// tension-pair logic this component doesn't know about.
export default function TreeOfLife({
  state,
  tensionInsights,
  eyebrowLabel,
  closeLabel,
  onClose,
}: {
  state: TreeState;
  tensionInsights?: { pair: string; insight: string }[];
  eyebrowLabel: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const [openNode, setOpenNode] = useState<SephirahKey | null>(null);

  return (
    <div className="tree-overlay">
      <div className="tree-eyebrow">{eyebrowLabel}</div>
      <div className="tree-card">
        <p className="tree-heading">The pattern, so far</p>
        <svg viewBox="0 0 300 420" className="tree-svg" aria-hidden="true">
          {EDGES.map(([a, b], i) => {
            const lit = Boolean(state[a] && state[b]);
            const na = NODES[a];
            const nb = NODES[b];
            return (
              <line
                key={i}
                x1={na.x}
                y1={na.y}
                x2={nb.x}
                y2={nb.y}
                className="tree-path"
                stroke={lit ? "var(--accent)" : "var(--border)"}
                strokeOpacity={lit ? 0.85 : 0.4}
                strokeWidth={lit ? 1.4 : 0.7}
              />
            );
          })}
          {NODE_ORDER.map((key) => {
            const node = NODES[key];
            const nodeState = state[key];
            const depth = nodeState ? TIER_DEPTH[nodeState.tier] : 0;
            return (
              <g key={key}>
                {nodeState && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={11 + depth * 9}
                    fill="var(--accent)"
                    opacity={0.08 + depth * 0.2}
                  />
                )}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={nodeState ? 5 + depth * 2.5 : 5}
                  className="tree-node-dot"
                  fill={nodeState ? "var(--accent-strong)" : "var(--surface-raised)"}
                  fillOpacity={nodeState ? 0.55 + depth * 0.45 : 1}
                  stroke={nodeState ? "var(--accent)" : "var(--border)"}
                  strokeWidth={1}
                  onClick={() => nodeState && setOpenNode(key)}
                />
                <text
                  x={node.x}
                  y={node.y + (node.y < 100 ? -14 : 20)}
                  textAnchor="middle"
                  className="tree-node-label"
                >
                  {node.title}
                </text>
              </g>
            );
          })}
        </svg>
        {tensionInsights && tensionInsights.length > 0 && (
          <div className="tree-insights">
            {tensionInsights.map((t) => (
              <p key={t.pair} className="tree-insight">
                {t.insight}
              </p>
            ))}
          </div>
        )}
        <p className="tree-hint">
          Dark points are things you haven&rsquo;t spoken yet — that&rsquo;s information too, not something
          missing. This carries across every conversation; the shape you just saw does not.
        </p>
        <button type="button" className="tree-close" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
      {openNode && state[openNode] && (
        <NodeDetail
          sephirah={openNode}
          state={state[openNode]!}
          onClose={() => setOpenNode(null)}
          closeLabel={closeLabel}
        />
      )}
    </div>
  );
}
