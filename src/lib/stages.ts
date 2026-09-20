export type StageKey = "mystery" | "safety" | "recognition" | "courage" | "return";

export interface Stage {
  key: StageKey;
  name: string;
  line: string;
  moveForward: string;
}

export const STAGES: Stage[] = [
  {
    key: "mystery",
    name: "Mystery",
    line: "You're here because something's unfinished.",
    moveForward: "say the thing you've been circling without saying it.",
  },
  {
    key: "safety",
    name: "Safety",
    line: "You're learning this place won't use what you give it against you.",
    moveForward: "tell the truth even when it's not flattering.",
  },
  {
    key: "recognition",
    name: "Recognition",
    line: "You're starting to see the pattern, not just the moment.",
    moveForward: "name it out loud — the thing that keeps happening.",
  },
  {
    key: "courage",
    name: "Courage",
    line: "You know what's true. The gap now is only action.",
    moveForward: "do the one thing you've been avoiding.",
  },
  {
    key: "return",
    name: "Return",
    line: "You're not who you were when this started.",
    moveForward: "carry it somewhere it can be tested — a room, a person, a choice.",
  },
];

export function stageIndex(key: StageKey): number {
  return STAGES.findIndex((s) => s.key === key);
}
