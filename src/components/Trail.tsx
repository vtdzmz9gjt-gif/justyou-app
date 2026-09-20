"use client";

const EXAMPLE_ENTRIES = [
  {
    mark: "did",
    action: "Brought up the project lead role in the team meeting, directly.",
    when: "3 days ago · Recognition",
  },
  {
    mark: "tried",
    action:
      "Tried to set a boundary with your manager about weekend messages — said something, but softened it at the last second.",
    when: "8 days ago · Safety",
  },
  {
    mark: "missed",
    action:
      "Was going to write down what you actually want from this job, not what you think you should want.",
    when: "12 days ago · Mystery",
  },
];

export default function Trail() {
  return (
    <div className="screen" style={{ alignItems: "center" }}>
      <div className="trail-title">What you&rsquo;ve carried out.</div>
      <div className="trail-sub">
        Not a task list &mdash; a record of what you did with what you
        learned.
      </div>
      <div className="trail-list">
        {EXAMPLE_ENTRIES.map((e, i) => (
          <div className="trail-item" key={i}>
            <div className={`trail-mark ${e.mark}`} />
            <div className="trail-body">
              <div className="trail-action">{e.action}</div>
              <div className="trail-when">{e.when}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="meta" style={{ marginTop: 24 }}>
        example entries &mdash; real trail data arrives in phase 4
      </div>
    </div>
  );
}
