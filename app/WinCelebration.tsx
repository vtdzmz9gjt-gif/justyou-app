"use client";

// The moment a real commitment actually lands -- resolve_open_commitment
// fired with outcome "landed". No three.js here on purpose: unlike the
// elemental avatar (which resolves out of an ongoing visual), this is a
// single, still moment marking something that already happened.
export default function WinCelebration({
  eyebrowLabel,
  headline,
  reflection,
  closeLabel,
  onClose,
}: {
  eyebrowLabel: string;
  headline: string;
  reflection: string;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="win-overlay">
      <div className="win-eyebrow">{eyebrowLabel}</div>
      <div className="win-ring">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 12.5L10 17.5L19 7.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2 className="win-headline">{headline}</h2>
      <p className="win-reflection">{reflection}</p>
      <button type="button" className="win-close" onClick={onClose}>
        {closeLabel}
      </button>
    </div>
  );
}
