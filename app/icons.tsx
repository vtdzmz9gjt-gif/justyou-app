// Small, thin-line icons for key action buttons -- same stroke weight
// (1.6) and rounded joins as the one icon already in the app
// (WinCelebration's checkmark), so a new icon set doesn't introduce a
// second visual language.
const STROKE = "1.6";

export function ArrowIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="key-action-icon"
    >
      <path
        d="M5 12H19M19 12L13 6M19 12L13 18"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EyeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="key-action-icon"
    >
      <path
        d="M2 12C2 12 5.5 6 12 6C18.5 6 22 12 22 12C22 12 18.5 18 12 18C5.5 18 2 12 2 12Z"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth={STROKE} />
    </svg>
  );
}

export function UnlockIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="key-action-icon"
    >
      <rect x="5" y="11" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth={STROKE} />
      <path
        d="M8 11V7.5C8 5 9.8 3.5 12 3.5C13.6 3.5 15 4.3 15.7 5.6"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </svg>
  );
}
