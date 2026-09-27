"use client";

import { useState, useEffect } from "react";
import type { SephirahTier } from "@/lib/tree";
import {
  THEME_ORDER,
  THEMES,
  YOU_POSITION,
  FATHER_POSITION,
  MOTHER_POSITION,
  type FamilyTheme,
  type FamilyPatternState,
  type FamilyState,
} from "@/lib/family";

export type { FamilyTheme, FamilyPatternState, FamilyState };

// Static, same for every person -- what a theme means in general, not this
// person's specific story. The personal, accumulated read on what THIS
// person has actually disclosed is a separate "your pattern" section
// (Stage 5), grounded in their own history and regenerated as it grows.
const PATTERN_WISDOM: Record<FamilyTheme, { pattern: string; cost: string; choice: string }> = {
  money: {
    pattern:
      "A stance toward money that was modeled for you before you ever earned a cent of your own — money as scarcity, as safety, as proof, before it was ever just a tool.",
    cost: "This can quietly run every financial decision you make, long after the original reason for it stopped applying.",
    choice:
      "You get to decide whether this belief about money is still true for you, or whether it was only ever true for whoever taught it to you.",
  },
  love: {
    pattern:
      "The shape love took in the home you grew up in — who gave it, who withheld it, what it cost to receive it — often becomes the shape you keep looking for, or keep running from.",
    cost: "You may find yourself repeating the exact dynamic you swore you'd never repeat, without ever choosing to.",
    choice: "This one is genuinely yours to keep or end. The pattern doesn't require your participation forever.",
  },
  work_life: {
    pattern:
      "How you learned to treat rest, ambition, and your own worth through work — usually absorbed by watching how the adults around you treated theirs, not by anything they actually said.",
    cost:
      "This can turn into either constant overextension or constant self-doubt about whether you're doing enough — neither of which you actually chose.",
    choice: "Rest, ambition, and worth don't have to keep the exact shape they were handed to you in.",
  },
  body: {
    pattern:
      "What you learned about listening to pain, rest, and your own physical limits — often taught less by words than by what was modeled in silence.",
    cost: "This can mean real signals go ignored until they're loud enough to be impossible to miss.",
    choice: "You can choose to listen earlier than you were ever taught to.",
  },
};

const TIER_LABEL: Record<SephirahTier, string> = {
  lightly_touched: "lightly touched",
  returned_to: "returned to",
  deeply_worked: "deeply worked",
};

// Brightness/size step per tier -- depth, not a tap count. Same shape as
// TreeOfLife.tsx's TIER_DEPTH; kept separate rather than shared since
// each is a tiny, purely presentational constant local to its own diagram.
const TIER_DEPTH: Record<SephirahTier, number> = {
  lightly_touched: 0.35,
  returned_to: 0.68,
  deeply_worked: 1,
};

function ThemeDetail({
  theme,
  state,
  userId,
  lang,
  onClose,
  closeLabel,
}: {
  theme: FamilyTheme;
  state: FamilyPatternState;
  userId: string | null;
  lang: string;
  onClose: () => void;
  closeLabel: string;
}) {
  const wisdom = PATTERN_WISDOM[theme];
  const [reflection, setReflection] = useState<string | null>(null);
  const [loadingReflection, setLoadingReflection] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoadingReflection(false);
      return;
    }
    setLoadingReflection(true);
    fetch(
      `/api/reflection?userId=${encodeURIComponent(userId)}&system=family&node=${theme}&lang=${encodeURIComponent(lang)}`
    )
      .then((r) => r.json())
      .then((data) => setReflection(typeof data.reflection === "string" ? data.reflection : null))
      .catch(() => setReflection(null))
      .finally(() => setLoadingReflection(false));
  }, [userId, theme, lang]);

  return (
    <div className="tree-detail-overlay" onClick={onClose}>
      <div className="tree-detail-card" onClick={(e) => e.stopPropagation()}>
        <p className="tree-detail-name">{THEMES[theme].title}</p>
        <p className="tree-detail-tier">{TIER_LABEL[state.tier]} so far</p>
        <div className="tree-detail-block">
          <p className="tree-detail-label">What was likely inherited</p>
          <p className="tree-detail-text">{wisdom.pattern}</p>
        </div>
        <div className="tree-detail-block">
          <p className="tree-detail-label">What it&rsquo;s costing you now</p>
          <p className="tree-detail-text">{wisdom.cost}</p>
        </div>
        <div className="tree-detail-block">
          <p className="tree-detail-label">Yours to decide</p>
          <p className="tree-detail-text">{wisdom.choice}</p>
        </div>
        {(loadingReflection || reflection) && (
          <div className="tree-detail-block">
            <p className="tree-detail-label">Your pattern</p>
            <p className="tree-detail-text tree-detail-reflection">
              {loadingReflection ? "···" : reflection}
            </p>
          </div>
        )}
        <button type="button" className="tree-detail-close" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}

// Family Constellation: a second, separate long-arc symbol alongside the
// Tree of Life -- literal/biographical where the Tree is abstract. "You"
// and the two ancestral lines (Father/Mother) are fixed structural
// anchors, always visible, never tappable for their own detail. A theme
// lights up once a real pattern is disclosed, connecting two ways: a
// solid line back to "You", and a dashed line back to whichever
// ancestral line the AI judged it traces to -- never a fixed lookup.
export default function FamilyConstellation({
  state,
  userId,
  lang,
  eyebrowLabel,
  closeLabel,
  onClose,
}: {
  state: FamilyState;
  userId: string | null;
  lang: string;
  eyebrowLabel: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const [openTheme, setOpenTheme] = useState<FamilyTheme | null>(null);

  return (
    <div className="tree-overlay">
      <div className="tree-eyebrow">{eyebrowLabel}</div>
      <div className="tree-card">
        <p className="tree-heading">Where it comes from</p>
        <svg viewBox="0 0 310 300" className="tree-svg" aria-hidden="true">
          {/* Once broken, the ancestral trace-line is gone -- the pattern
              no longer needs to be explained by where it came from. */}
          {THEME_ORDER.map((theme) => {
            const s = state[theme];
            if (!s || !s.tracesTo || s.broken) return null;
            const anchor = s.tracesTo === "father" ? FATHER_POSITION : MOTHER_POSITION;
            const node = THEMES[theme];
            return (
              <line
                key={`trace-${theme}`}
                x1={node.x}
                y1={node.y}
                x2={anchor.x}
                y2={anchor.y}
                className="tree-path"
                stroke="var(--accent)"
                strokeOpacity={0.5}
                strokeWidth={0.9}
                strokeDasharray="3 3"
              />
            );
          })}
          {THEME_ORDER.map((theme) => {
            const s = state[theme];
            if (!s) return null;
            const node = THEMES[theme];
            return (
              <line
                key={`you-${theme}`}
                x1={YOU_POSITION.x}
                y1={YOU_POSITION.y}
                x2={node.x}
                y2={node.y}
                className="tree-path"
                stroke={s.broken ? "#e8b83c" : "var(--accent)"}
                strokeOpacity={s.broken ? 1 : 0.85}
                strokeWidth={s.broken ? 1.8 : 1.4}
              />
            );
          })}

          <circle
            cx={FATHER_POSITION.x}
            cy={FATHER_POSITION.y}
            r={5}
            className="tree-node-dot"
            fill="var(--surface-raised)"
            stroke="var(--border)"
            strokeWidth={1}
          />
          <text x={FATHER_POSITION.x} y={FATHER_POSITION.y - 12} textAnchor="middle" className="tree-node-label">
            Father
          </text>

          <circle
            cx={MOTHER_POSITION.x}
            cy={MOTHER_POSITION.y}
            r={5}
            className="tree-node-dot"
            fill="var(--surface-raised)"
            stroke="var(--border)"
            strokeWidth={1}
          />
          <text x={MOTHER_POSITION.x} y={MOTHER_POSITION.y - 12} textAnchor="middle" className="tree-node-label">
            Mother
          </text>

          <circle cx={YOU_POSITION.x} cy={YOU_POSITION.y} r={9} fill="var(--accent)" opacity={0.18} />
          <circle
            cx={YOU_POSITION.x}
            cy={YOU_POSITION.y}
            r={6}
            className="tree-node-dot"
            fill="var(--accent-strong)"
            fillOpacity={0.9}
            stroke="var(--accent)"
            strokeWidth={1}
          />
          <text x={YOU_POSITION.x} y={YOU_POSITION.y - 14} textAnchor="middle" className="tree-node-label">
            You
          </text>

          {THEME_ORDER.map((theme) => {
            const node = THEMES[theme];
            const s = state[theme];
            const depth = s ? TIER_DEPTH[s.tier] : 0;
            return (
              <g key={theme}>
                {s && (
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
                  r={s ? 5 + depth * 2.5 : 5}
                  className="tree-node-dot"
                  fill={s ? "var(--accent-strong)" : "var(--surface-raised)"}
                  fillOpacity={s ? 0.55 + depth * 0.45 : 1}
                  stroke={s ? "var(--accent)" : "var(--border)"}
                  strokeWidth={1}
                  onClick={() => s && setOpenTheme(theme)}
                />
                <text x={node.x} y={node.y + 20} textAnchor="middle" className="tree-node-label">
                  {node.title}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="tree-hint">
          Dark themes are things you haven&rsquo;t spoken yet — that&rsquo;s information too, not something missing.
          This carries across every conversation.
        </p>
        <button type="button" className="tree-close" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
      {openTheme && state[openTheme] && (
        <ThemeDetail
          theme={openTheme}
          state={state[openTheme]!}
          userId={userId}
          lang={lang}
          onClose={() => setOpenTheme(null)}
          closeLabel={closeLabel}
        />
      )}
    </div>
  );
}
