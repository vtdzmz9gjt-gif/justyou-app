import type { StageKey } from "./stages";

export type TrailOutcome = "pending" | "did" | "tried" | "missed";

export interface TrailEntry {
  id: string;
  actionText: string;
  stage: StageKey;
  committedAt: string;
  checkInAt?: string;
  outcome: TrailOutcome;
  resolvedAt?: string;
}

export interface StoredState {
  sessionCount: number;
  lastVisitAt?: string;
  lastStage: StageKey;
  lastPhrase?: string;
  trail: TrailEntry[];
}

const KEY = "justyou.state.v1";

const DEFAULT_STATE: StoredState = {
  sessionCount: 0,
  lastStage: "mystery",
  trail: [],
};

export function loadState(): StoredState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed, trail: Array.isArray(parsed.trail) ? parsed.trail : [] };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: StoredState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // private browsing, quota, or storage disabled — sessions still work, just not remembered
  }
}

export function dueTrailEntries(state: StoredState): TrailEntry[] {
  const now = Date.now();
  return state.trail.filter(
    (e) => e.outcome === "pending" && e.checkInAt && new Date(e.checkInAt).getTime() <= now,
  );
}

export function recordSessionStart(): StoredState {
  const state = loadState();
  const next: StoredState = {
    ...state,
    sessionCount: state.sessionCount + 1,
    lastVisitAt: new Date().toISOString(),
  };
  saveState(next);
  return next;
}

export function addTrailEntry(actionText: string, stage: StageKey, checkInDays?: number): TrailEntry {
  const state = loadState();
  const checkInAt =
    typeof checkInDays === "number" && checkInDays > 0
      ? new Date(Date.now() + Math.max(1, checkInDays - 1) * 86400000).toISOString()
      : undefined;
  const entry: TrailEntry = {
    id: Math.random().toString(36).slice(2),
    actionText,
    stage,
    committedAt: new Date().toISOString(),
    checkInAt,
    outcome: "pending",
  };
  saveState({ ...state, trail: [entry, ...state.trail] });
  return entry;
}

export function resolveTrailEntry(id: string, outcome: Exclude<TrailOutcome, "pending">) {
  const state = loadState();
  saveState({
    ...state,
    trail: state.trail.map((e) => (e.id === id ? { ...e, outcome, resolvedAt: new Date().toISOString() } : e)),
  });
}

export function updateLastStageAndPhrase(stage: StageKey, phrase?: string) {
  const state = loadState();
  saveState({ ...state, lastStage: stage, ...(phrase ? { lastPhrase: phrase } : {}) });
}
