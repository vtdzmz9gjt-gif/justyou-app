"use client";

import { useEffect, useState } from "react";
import { playChime } from "@/lib/sound";

const LINES = [
  "Take a breath. This is yours.",
  "Nothing here needs performing.",
  "You can be honest here.",
];

export default function Threshold({ onClear }: { onClear: () => void }) {
  const [line] = useState(() => LINES[Math.floor(Math.random() * LINES.length)]);

  useEffect(() => {
    const timer = setTimeout(() => {
      playChime();
      onClear();
    }, 2600);
    return () => clearTimeout(timer);
  }, [onClear]);

  function clearNow() {
    playChime();
    onClear();
  }

  return (
    <div className="threshold" onClick={clearNow}>
      <p className="threshold-line">{line}</p>
    </div>
  );
}
