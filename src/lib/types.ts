import type { StageKey } from "./stages";

export interface AssistantTurn {
  role: "assistant";
  truth: string;
  quote?: string;
  quoteSource?: string;
  question: string;
  branches: string[];
  ignition?: string;
  stage: StageKey;
  weighted: boolean;
}

export interface UserTurn {
  role: "user";
  text: string;
}

export type Turn = UserTurn | AssistantTurn;

export interface SessionRequestBody {
  stage: StageKey;
  turnCount: number;
  history: { role: "user" | "assistant"; content: string }[];
  message: string;
}
