// Shared Family Constellation data -- no "use client", safe to import from
// both FamilyConstellation.tsx (rendering) and server code. Same tiering
// shape as the Tree of Life (see lib/tree.ts) -- both systems share one
// definition of "lightly touched" / "returned to" / "deeply worked" so
// they can never quietly drift apart on what those words mean.

import type { SephirahTier } from "@/lib/tree";

export type FamilyTheme = "money" | "love" | "work_life" | "body";
export type FamilyLine = "father" | "mother";

// null/absent tracesTo = disclosed but the AI hasn't yet judged which
// ancestral line it traces to -- shouldn't normally happen (tag_family_pattern
// judges both at once) but kept optional rather than assumed.
//
// broken = the long-term milestone: 2+ distinct calendar days where a
// concrete, unambiguous instance of acting differently than the
// inherited pattern was reported -- not just recognized. Absent/false
// means either untouched or not yet earned; there's no in-between state.
export type FamilyPatternState = {
  tier: SephirahTier;
  groundedIn?: string;
  tracesTo?: FamilyLine;
  broken?: boolean;
};
export type FamilyState = Partial<Record<FamilyTheme, FamilyPatternState>>;

export const THEME_ORDER: FamilyTheme[] = ["money", "love", "work_life", "body"];

export const THEMES: Record<FamilyTheme, { title: string; x: number; y: number }> = {
  money: { title: "Money", x: 45, y: 260 },
  love: { title: "Love", x: 118, y: 260 },
  work_life: { title: "Work / Life", x: 191, y: 260 },
  body: { title: "Body", x: 264, y: 260 },
};

// Structural anchors -- always visible, never dark, never tappable for
// their own detail panel. "You" is where every lit theme's solid line
// lands; Father/Mother are where a lit theme's dashed trace-line lands.
export const YOU_POSITION = { x: 155, y: 140 };
export const FATHER_POSITION = { x: 95, y: 42 };
export const MOTHER_POSITION = { x: 215, y: 42 };
