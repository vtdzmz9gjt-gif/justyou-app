"use client";

import { useState } from "react";
import { loadState, type TrailEntry } from "@/lib/storage";
import { STAGES } from "@/lib/stages";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.round(diffMs / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function markClass(entry: TrailEntry): string {
  if (entry.outcome === "pending") return "pending";
  return entry.outcome;
}

export default function Trail() {
  const [state] = useState(() => loadState());

  return (
    <div className="screen" style={{ alignItems: "center" }}>
      <div className="trail-title">What you&rsquo;ve carried out.</div>
      <div className="trail-sub">
        Not a task list &mdash; a record of what you did with what you
        learned.
      </div>
      {state.trail.length === 0 ? (
        <div className="trail-empty">
          Nothing here yet. It starts after your first committed action.
        </div>
      ) : (
        <div className="trail-list">
          {state.trail.map((entry) => {
            const stageInfo = STAGES.find((s) => s.key === entry.stage);
            return (
              <div className="trail-item" key={entry.id}>
                <div className={`trail-mark ${markClass(entry)}`} />
                <div className="trail-body">
                  <div className="trail-action">{entry.actionText}</div>
                  <div className="trail-when">
                    {relativeTime(entry.committedAt)}
                    {stageInfo ? ` · ${stageInfo.name}` : ""}
                    {entry.outcome === "pending" ? " · not yet checked in" : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
