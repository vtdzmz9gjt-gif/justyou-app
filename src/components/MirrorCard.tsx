"use client";

export default function MirrorCard({ line }: { line: string }) {
  return (
    <div className="mirror-card">
      <div className="mirror-card-label">just you</div>
      <div className="mirror-card-line">{line}</div>
    </div>
  );
}
