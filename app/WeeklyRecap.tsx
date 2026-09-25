"use client";

// Shown once a week -- the person's own browser clock decided their local
// Sunday 7pm already passed and this week hasn't been shown yet (see the
// boundary logic in page.tsx). A compilation, not a replacement for the
// per-win celebration: the same wins already got their own moment when
// they happened.
export default function WeeklyRecap({
  eyebrowLabel,
  headline,
  summary,
  wins,
  closeLabel,
  onClose,
}: {
  eyebrowLabel: string;
  headline: string;
  summary: string | null;
  wins: { action: string }[];
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="weekly-recap-overlay" onClick={onClose}>
      <div className="weekly-recap-card" onClick={(e) => e.stopPropagation()}>
        <div className="weekly-recap-eyebrow">{eyebrowLabel}</div>
        <h2 className="weekly-recap-headline">{headline}</h2>
        {summary && <p className="weekly-recap-summary">{summary}</p>}
        <ul className="weekly-recap-list">
          {wins.map((w, i) => (
            <li key={i} className="weekly-recap-item">
              {w.action}
            </li>
          ))}
        </ul>
        <button type="button" className="weekly-recap-close" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}
