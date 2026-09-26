// Shared Tree of Life data -- no "use client", safe to import from both
// TreeOfLife.tsx (rendering) and server code (lib/db.ts's tier + first-
// connection logic, lib/anthropic.ts's tag_sephirah). Keeping this in one
// place means the server and the UI can never disagree about which paths
// exist.

export type SephirahKey =
  | "keter"
  | "chokhmah"
  | "binah"
  | "chesed"
  | "gevurah"
  | "tiferet"
  | "netzach"
  | "hod"
  | "yesod"
  | "malkuth";

export type SephirahTier = "lightly_touched" | "returned_to" | "deeply_worked";

// null/absent = genuinely unspoken -- that's information too, not a
// placeholder or an error state.
export type SephirahState = { tier: SephirahTier; groundedIn?: string };
export type TreeState = Partial<Record<SephirahKey, SephirahState>>;

export const NODE_ORDER: SephirahKey[] = [
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
];

export const NODES: Record<SephirahKey, { title: string; subtitle: string; x: number; y: number }> = {
  keter: { title: "Keter", subtitle: "Crown", x: 150, y: 28 },
  chokhmah: { title: "Chokhmah", subtitle: "Father-line", x: 224, y: 78 },
  binah: { title: "Binah", subtitle: "Mother-line", x: 76, y: 78 },
  chesed: { title: "Chesed", subtitle: "Giving", x: 224, y: 168 },
  gevurah: { title: "Gevurah", subtitle: "Boundaries", x: 76, y: 168 },
  tiferet: { title: "Tiferet", subtitle: "Self", x: 150, y: 210 },
  netzach: { title: "Netzach", subtitle: "Drive", x: 224, y: 268 },
  hod: { title: "Hod", subtitle: "Self-doubt", x: 76, y: 268 },
  yesod: { title: "Yesod", subtitle: "Foundation", x: 150, y: 320 },
  malkuth: { title: "Malkuth", subtitle: "Real world", x: 150, y: 385 },
};

// The traditional paths -- not all 22 debated ones, the ~20 that are widely
// agreed on.
export const EDGES: [SephirahKey, SephirahKey][] = [
  ["keter", "chokhmah"],
  ["keter", "binah"],
  ["keter", "tiferet"],
  ["chokhmah", "binah"],
  ["chokhmah", "tiferet"],
  ["chokhmah", "chesed"],
  ["binah", "tiferet"],
  ["binah", "gevurah"],
  ["chesed", "gevurah"],
  ["chesed", "tiferet"],
  ["chesed", "netzach"],
  ["gevurah", "tiferet"],
  ["gevurah", "hod"],
  ["tiferet", "netzach"],
  ["tiferet", "hod"],
  ["tiferet", "yesod"],
  ["netzach", "hod"],
  ["netzach", "yesod"],
  ["hod", "yesod"],
  ["yesod", "malkuth"],
];

// The three structurally significant tensions worth naming when
// lopsided -- not all pairs, just these.
export const TENSION_PAIRS: { key: string; a: SephirahKey; b: SephirahKey }[] = [
  { key: "chesed_gevurah", a: "chesed", b: "gevurah" },
  { key: "netzach_hod", a: "netzach", b: "hod" },
  { key: "chokhmah_binah", a: "chokhmah", b: "binah" },
];

export const TIER_RANK: Record<SephirahTier, number> = {
  lightly_touched: 0,
  returned_to: 1,
  deeply_worked: 2,
};
