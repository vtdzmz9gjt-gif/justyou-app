import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

let schemaReady: Promise<void> | null = null;

// A migration step that's safe to skip if it fails -- widening/refreshing a
// constraint that (almost certainly) already matches production data. One
// bad row or a transient DDL conflict here should never take down every
// query on this connection; log it and move on rather than rejecting the
// whole schemaReady promise over it.
async function nonFatal(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[schema] non-fatal migration step failed: ${label}`, err);
  }
}

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('user','assistant')),
          content TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS commitments (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          action TEXT NOT NULL,
          target_date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','landed','tried','not_landed')),
          reminder_sent INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          resolved_at TIMESTAMPTZ
        )
      `;
      // Widen the status check constraint for databases created before
      // 'tried' existed as a distinct outcome from 'not_landed'. Meant to
      // be a one-time no-op once it's already run successfully -- made
      // non-fatal because a stale row or concurrent cold start hitting
      // this at the same time as another instance must never break every
      // other query on this connection.
      await nonFatal("drop commitments_status_check", () =>
        sql`ALTER TABLE commitments DROP CONSTRAINT IF EXISTS commitments_status_check`
      );
      await nonFatal("add commitments_status_check", () =>
        sql`ALTER TABLE commitments ADD CONSTRAINT commitments_status_check CHECK (status IN ('pending','landed','tried','not_landed'))`
      );
      await sql`
        CREATE TABLE IF NOT EXISTS user_stage (
          user_id TEXT PRIMARY KEY,
          stage TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS user_shape (
          user_id TEXT PRIMARY KEY,
          family TEXT NOT NULL CHECK (family IN ('tree','flame','river','constellation','mountain')),
          assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS mirror_lines (
          user_id TEXT PRIMARY KEY,
          line TEXT NOT NULL,
          generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      // Elemental orb (Fire/Earth/Air/Water) -- per-session, tagged on the
      // person's own messages only, never the AI's reply. Nullable: most
      // messages (administrative, ambiguous, or the assistant's own turns)
      // never get tagged at all.
      await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS element TEXT`;
      await nonFatal("drop messages_element_check", () =>
        sql`ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_element_check`
      );
      await nonFatal("add messages_element_check", () =>
        sql`ALTER TABLE messages ADD CONSTRAINT messages_element_check CHECK (element IS NULL OR element IN ('fire','earth','air','water'))`
      );
      await sql`CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_commitments_user ON commitments(user_id, status)`;
    })();
    // If schema setup itself fails (not one of the non-fatal steps above,
    // but a real CREATE TABLE/INDEX failure), don't leave every future call
    // on this container permanently stuck replaying the same rejection --
    // clear it so the next request gets a fresh attempt.
    schemaReady.catch(() => {
      schemaReady = null;
    });
  }
  return schemaReady;
}

export type Role = "user" | "assistant";

export type Element = "fire" | "earth" | "air" | "water";

export interface StoredMessage {
  id: number;
  user_id: string;
  role: Role;
  content: string;
  element: Element | null;
  created_at: string;
}

export interface Commitment {
  id: number;
  user_id: string;
  action: string;
  target_date: string;
  status: "pending" | "landed" | "tried" | "not_landed";
  reminder_sent: number;
  created_at: string;
  resolved_at: string | null;
}

export async function ensureUser(userId: string) {
  await ensureSchema();
  await sql`INSERT INTO users (id) VALUES (${userId}) ON CONFLICT (id) DO NOTHING`;
}

export async function setUserEmail(userId: string, email: string) {
  await ensureUser(userId);
  await sql`UPDATE users SET email = ${email} WHERE id = ${userId}`;
}

export async function getUser(userId: string) {
  await ensureSchema();
  const rows = await sql`SELECT * FROM users WHERE id = ${userId}`;
  return rows[0] as { id: string; email: string | null } | undefined;
}

export async function getMessages(userId: string): Promise<StoredMessage[]> {
  await ensureSchema();
  const rows = await sql`
    SELECT * FROM messages WHERE user_id = ${userId} ORDER BY id ASC
  `;
  return rows as unknown as StoredMessage[];
}

export async function addMessage(
  userId: string,
  role: Role,
  content: string,
  element?: Element | null
): Promise<number> {
  await ensureSchema();
  const rows = await sql`
    INSERT INTO messages (user_id, role, content, element)
    VALUES (${userId}, ${role}, ${content}, ${element ?? null})
    RETURNING id
  `;
  return (rows as unknown as { id: number }[])[0].id;
}

// Tally of tagged elements since a boundary message id -- the same
// boundary "start fresh" already tracks, so a session's tally naturally
// empties out the moment someone starts fresh, with no separate cleanup.
export async function getElementTally(
  userId: string,
  sinceMessageId: number
): Promise<Record<Element, number>> {
  await ensureSchema();
  const rows = await sql`
    SELECT element, COUNT(*)::int AS count FROM messages
    WHERE user_id = ${userId} AND id > ${sinceMessageId} AND element IS NOT NULL
    GROUP BY element
  `;
  const tally: Record<Element, number> = { fire: 0, earth: 0, air: 0, water: 0 };
  for (const row of rows as unknown as { element: Element; count: number }[]) {
    tally[row.element] = row.count;
  }
  return tally;
}

export async function getOpenCommitment(userId: string): Promise<Commitment | undefined> {
  await ensureSchema();
  const rows = await sql`
    SELECT * FROM commitments WHERE user_id = ${userId} AND status = 'pending' ORDER BY id DESC LIMIT 1
  `;
  return rows[0] as unknown as Commitment | undefined;
}

// Unlike getOpenCommitment, not filtered to pending -- used for the quiet
// returning-visitor callback, which should reference the last commitment
// regardless of whether it's since been resolved.
export async function getMostRecentCommitment(userId: string): Promise<Commitment | undefined> {
  await ensureSchema();
  const rows = await sql`
    SELECT * FROM commitments WHERE user_id = ${userId} ORDER BY id DESC LIMIT 1
  `;
  return rows[0] as unknown as Commitment | undefined;
}

export async function recordCommitment(
  userId: string,
  action: string,
  targetDate: string
): Promise<Commitment> {
  await ensureSchema();
  // Only one open loop at a time — superseding an old pending one is a
  // deliberate simplification for this prototype, not a silent bug.
  await sql`
    UPDATE commitments SET status = 'not_landed', resolved_at = now()
    WHERE user_id = ${userId} AND status = 'pending'
  `;

  const rows = await sql`
    INSERT INTO commitments (user_id, action, target_date)
    VALUES (${userId}, ${action}, ${targetDate})
    RETURNING *
  `;

  return rows[0] as unknown as Commitment;
}

export async function resolveCommitment(
  userId: string,
  outcome: "landed" | "tried" | "not_landed"
): Promise<Commitment | undefined> {
  await ensureSchema();
  const open = await getOpenCommitment(userId);
  if (!open) return undefined;
  const rows = await sql`
    UPDATE commitments SET status = ${outcome}, resolved_at = now()
    WHERE id = ${open.id}
    RETURNING *
  `;
  return rows[0] as unknown as Commitment;
}

// How many of this user's commitments have ever landed. Used to gate the
// Courage -> Return transition, which requires proof across more than
// one conversation, not just a single follow-through.
export async function countLandedCommitments(userId: string): Promise<number> {
  await ensureSchema();
  const rows = await sql`
    SELECT COUNT(*) as count FROM commitments WHERE user_id = ${userId} AND status = 'landed'
  `;
  return Number((rows[0] as { count: string | number }).count);
}

export async function getDueReminders(): Promise<(Commitment & { email: string })[]> {
  await ensureSchema();
  const rows = await sql`
    SELECT c.*, u.email as email
    FROM commitments c
    JOIN users u ON u.id = c.user_id
    WHERE c.status = 'pending'
      AND c.reminder_sent = 0
      AND u.email IS NOT NULL
      AND c.target_date::date <= (CURRENT_DATE + 1)
  `;
  return rows as unknown as (Commitment & { email: string })[];
}

export async function markReminderSent(commitmentId: number) {
  await ensureSchema();
  await sql`UPDATE commitments SET reminder_sent = 1 WHERE id = ${commitmentId}`;
}

// --- Stage tracking (Mystery / Safety / Recognition / Courage / Return) ---

export type Stage = "mystery" | "safety" | "recognition" | "courage" | "return";

export async function setUserStage(userId: string, stage: Stage) {
  await ensureUser(userId);
  await sql`
    INSERT INTO user_stage (user_id, stage, updated_at)
    VALUES (${userId}, ${stage}, now())
    ON CONFLICT (user_id) DO UPDATE SET stage = excluded.stage, updated_at = excluded.updated_at
  `;
}

export async function getUserStage(userId: string): Promise<Stage | undefined> {
  await ensureSchema();
  const rows = await sql`SELECT stage FROM user_stage WHERE user_id = ${userId}`;
  return (rows[0] as { stage: Stage } | undefined)?.stage;
}

// --- Personalized shape family (Tree / Flame / River / Constellation / Mountain) ---
// Quietly matched once, early on, from the feel of how someone expresses
// themselves -- never a quiz, never announced. See lib/anthropic.ts's
// assign_shape_family tool.

export type ShapeFamily = "tree" | "flame" | "river" | "constellation" | "mountain";

export async function getUserShape(userId: string): Promise<ShapeFamily | undefined> {
  await ensureSchema();
  const rows = await sql`SELECT family FROM user_shape WHERE user_id = ${userId}`;
  return (rows[0] as { family: ShapeFamily } | undefined)?.family;
}

export async function setUserShape(userId: string, family: ShapeFamily) {
  await ensureUser(userId);
  await sql`
    INSERT INTO user_shape (user_id, family) VALUES (${userId}, ${family})
    ON CONFLICT (user_id) DO NOTHING
  `;
}

// Real, current percentage of all users sitting at each stage right now —
// not a fabricated or hardcoded number. Used only for the empathetic
// "this is where most people are" framing, never for ranking one user
// against another.
export async function getStagePercentages(): Promise<Record<string, number>> {
  await ensureSchema();
  const rows = (await sql`
    SELECT stage, COUNT(*) as count FROM user_stage GROUP BY stage
  `) as unknown as { stage: string; count: string | number }[];

  const counts = rows.map((r) => ({ stage: r.stage, count: Number(r.count) }));
  const total = counts.reduce((sum, r) => sum + r.count, 0);
  if (total === 0) return {};

  const result: Record<string, number> = {};
  for (const r of counts) {
    result[r.stage] = Math.round((r.count / total) * 100);
  }
  return result;
}

// --- Weekly mirror line ---

export interface CommitmentSummary {
  action: string;
  status: "landed" | "tried" | "not_landed";
}

export async function getDistinctActiveDays(userId: string): Promise<number> {
  await ensureSchema();
  const rows = await sql`
    SELECT COUNT(DISTINCT created_at::date) as count FROM messages WHERE user_id = ${userId}
  `;
  return Number((rows[0] as { count: string | number }).count);
}

export async function getResolvedCommitments(
  userId: string,
  limit = 10
): Promise<CommitmentSummary[]> {
  await ensureSchema();
  const rows = await sql`
    SELECT action, status FROM commitments
    WHERE user_id = ${userId} AND status IN ('landed','tried','not_landed')
    ORDER BY resolved_at DESC LIMIT ${limit}
  `;
  return rows as unknown as CommitmentSummary[];
}

export async function getMirrorLine(
  userId: string
): Promise<{ line: string; generated_at: string } | undefined> {
  await ensureSchema();
  const rows = await sql`SELECT line, generated_at FROM mirror_lines WHERE user_id = ${userId}`;
  return rows[0] as { line: string; generated_at: string } | undefined;
}

export async function saveMirrorLine(userId: string, line: string) {
  await ensureUser(userId);
  await sql`
    INSERT INTO mirror_lines (user_id, line, generated_at) VALUES (${userId}, ${line}, now())
    ON CONFLICT (user_id) DO UPDATE SET line = excluded.line, generated_at = excluded.generated_at
  `;
}

// --- Minimal signals: do people come back, and what happens to committed actions ---

export interface Signals {
  totalUsers: number;
  returningUsers: number;
  commitmentOutcomes: { landed: number; tried: number; not_landed: number; pending: number };
}

export async function getSignals(): Promise<Signals> {
  await ensureSchema();
  const totalRows = (await sql`SELECT COUNT(*) as count FROM users`) as unknown as {
    count: string | number;
  }[];
  const returningRows = (await sql`
    SELECT COUNT(*) as count FROM (
      SELECT user_id FROM messages GROUP BY user_id HAVING COUNT(DISTINCT created_at::date) > 1
    ) t
  `) as unknown as { count: string | number }[];
  const outcomeRows = (await sql`
    SELECT status, COUNT(*) as count FROM commitments GROUP BY status
  `) as unknown as { status: string; count: string | number }[];

  const commitmentOutcomes = { landed: 0, tried: 0, not_landed: 0, pending: 0 };
  for (const r of outcomeRows) {
    if (r.status in commitmentOutcomes) {
      (commitmentOutcomes as Record<string, number>)[r.status] = Number(r.count);
    }
  }

  return {
    totalUsers: Number(totalRows[0].count),
    returningUsers: Number(returningRows[0].count),
    commitmentOutcomes,
  };
}
