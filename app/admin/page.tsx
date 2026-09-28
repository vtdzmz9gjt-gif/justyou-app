import { notFound } from "next/navigation";
import { getAdminSignals } from "@/lib/db";

// Private, aggregate-only signals -- never linked from the regular app
// UI, never indexed, gated by a ?key= match against ADMIN_SECRET. A
// wrong or missing key renders an ordinary 404, indistinguishable from
// any other unmapped path, rather than a page that visibly exists but
// says "wrong password" -- that would confirm to anyone probing that
// something's here at all.
export const dynamic = "force-dynamic";

function pct(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : "—";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "2.25rem" }}>
      <h2
        style={{
          fontSize: "0.78rem",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#8a8474",
          marginBottom: "0.75rem",
          fontWeight: 600,
        }}
      >
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "1.5rem",
        borderBottom: "1px solid #2a271f",
        padding: "0.4rem 0",
      }}
    >
      <span style={{ color: "#c9c3b4" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  const secret = process.env.ADMIN_SECRET;
  if (!secret || key !== secret) {
    notFound();
  }

  const s = await getAdminSignals();
  const resolvedCommitments = s.commitments.landed + s.commitments.tried + s.commitments.notLanded;
  const day1Users = s.retention.find((r) => r.day === 1)?.users ?? 0;

  return (
    <div
      style={{
        background: "#14120f",
        color: "#e8e3d8",
        minHeight: "100vh",
        padding: "2.5rem 1.5rem",
        fontFamily:
          "ui-monospace, SFMono-Regular, 'IBM Plex Mono', Menlo, monospace",
        fontSize: "0.92rem",
        maxWidth: "36rem",
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "1.15rem", marginBottom: "0.25rem" }}>Just You — Admin</h1>
      <p style={{ color: "#8a8474", fontSize: "0.78rem", marginBottom: "2rem" }}>
        Aggregate counts and percentages only. No message content, no grounded_in
        notes, no per-user transcripts are shown or queried here.
      </p>

      <Section title="Users">
        <Row label="Total signed up" value={s.totalUsers} />
        <Row
          label="Had a real conversation (2+ typed messages)"
          value={`${s.usersWithRealConversation} of ${s.totalUsers} (${pct(s.usersWithRealConversation, s.totalUsers)})`}
        />
        <Row
          label="Active, last 7 days"
          value={`${s.active7d} of ${s.totalUsers} (${pct(s.active7d, s.totalUsers)})`}
        />
        <Row
          label="Active, last 30 days"
          value={`${s.active30d} of ${s.totalUsers} (${pct(s.active30d, s.totalUsers)})`}
        />
      </Section>

      <Section title="Retention — distinct days with a message">
        {s.retention.map((r) => (
          <Row
            key={String(r.day)}
            label={r.day === 1 ? "Day 1 (ever showed up)" : `Returned for day ${r.day}`}
            value={r.day === 1 ? r.users : `${r.users} of ${day1Users} (${Math.round(r.pct)}%)`}
          />
        ))}
      </Section>

      <Section title="Commitment follow-through">
        <Row
          label="Landed"
          value={`${s.commitments.landed} of ${resolvedCommitments} (${pct(s.commitments.landed, resolvedCommitments)})`}
        />
        <Row
          label="Tried, didn't land"
          value={`${s.commitments.tried} of ${resolvedCommitments} (${pct(s.commitments.tried, resolvedCommitments)})`}
        />
        <Row
          label="Didn't try"
          value={`${s.commitments.notLanded} of ${resolvedCommitments} (${pct(s.commitments.notLanded, resolvedCommitments)})`}
        />
        <Row label="Still pending (not counted above)" value={s.commitments.pending} />
      </Section>

      <Section title="Node depth — returned to or deeply worked">
        <Row label="Tree of Life" value={`${s.nodeDepth.treeUsers} of ${s.totalUsers}`} />
        <Row label="Family Constellation" value={`${s.nodeDepth.familyUsers} of ${s.totalUsers}`} />
        <Row label="Either (combined)" value={`${s.nodeDepth.combinedUsers} of ${s.totalUsers}`} />
      </Section>

      <p style={{ color: "#5c5849", fontSize: "0.75rem", marginTop: "2.5rem" }}>
        Subscriber count and MRR will appear here once subscriptions ship.
      </p>
    </div>
  );
}
