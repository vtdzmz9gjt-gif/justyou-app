"use client";

export type View = "home" | "session" | "trail";

const VIEWS: { key: View; label: string }[] = [
  { key: "home", label: "Home" },
  { key: "session", label: "Session" },
  { key: "trail", label: "Trail" },
];

export default function Wayfind({
  current,
  onChange,
}: {
  current: View;
  onChange: (v: View) => void;
}) {
  return (
    <div className="wayfind">
      {VIEWS.map((v) => (
        <button
          key={v.key}
          className={current === v.key ? "active" : ""}
          title={v.label}
          aria-label={v.label}
          onClick={() => onChange(v.key)}
        />
      ))}
    </div>
  );
}
