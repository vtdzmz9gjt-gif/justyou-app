import { neon } from "@neondatabase/serverless";
import {
  EDGES,
  NODE_ORDER,
  TENSION_PAIRS,
  TIER_RANK,
  deriveTier,
  type SephirahKey,
  type SephirahState,
  type SephirahWeight,
  type TreeState,
} from "@/lib/tree";
import { THEME_ORDER, type FamilyTheme, type FamilyLine, type FamilyState } from "@/lib/family";

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
      // Tree of Life -- append-only, one row per genuine disclosure the AI
      // judged as belonging to a sephirah. The tier (lightly touched /
      // returned to / deeply worked) is always derived by reading this
      // history, never stored as a counter, so it can't drift.
      await sql`
        CREATE TABLE IF NOT EXISTS sephirah_tags (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          node TEXT NOT NULL CHECK (node IN (
            'keter','chokhmah','binah','chesed','gevurah',
            'tiferet','netzach','hod','yesod','malkuth'
          )),
          weight TEXT NOT NULL CHECK (weight IN ('surface','substantive','confronted')),
          grounded_in TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS sephirah_tags_user_idx ON sephirah_tags (user_id)`;
      // One row per path, the first (and only the first) time both of its
      // nodes are lit -- lets a "you're starting to see how X and Y
      // connect" line surface exactly once, ever, per person per path.
      await sql`
        CREATE TABLE IF NOT EXISTS sephirah_path_acks (
          user_id TEXT NOT NULL,
          edge TEXT NOT NULL,
          acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, edge)
        )
      `;
      // One generated insight per person per tension pair, ever -- written
      // once, then always reused rather than regenerated, so the wording
      // stays stable and no pair costs more than one model call in a
      // person's whole lifetime with the app.
      await sql`
        CREATE TABLE IF NOT EXISTS sephirah_pair_insights (
          user_id TEXT NOT NULL,
          pair TEXT NOT NULL,
          insight TEXT NOT NULL,
          generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, pair)
        )
      `;
      // Da'at, the hidden eleventh point -- one row the first (and only
      // the first) time it's earned, so the client knows to play its slow
      // fade-in only once and just show it plainly on every later visit.
      // The qualification itself (>=2 of 3 tension pairs both "returned
      // to" or deeper) is never stored -- always recomputed from the
      // sephirah_tags history, same as every other tier in this system.
      await sql`
        CREATE TABLE IF NOT EXISTS daat_reveals (
          user_id TEXT PRIMARY KEY,
          revealed_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      // Family Constellation -- append-only, one row per genuine disclosure
      // the AI judged as tracing a real pattern to a specific parent. Same
      // tiering shape as sephirah_tags (tier always derived by reading this
      // history), plus traces_to, which sephirah_tags has no equivalent of.
      await sql`
        CREATE TABLE IF NOT EXISTS family_pattern_tags (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          theme TEXT NOT NULL CHECK (theme IN ('money','love','work_life','body')),
          weight TEXT NOT NULL CHECK (weight IN ('surface','substantive','confronted')),
          traces_to TEXT NOT NULL CHECK (traces_to IN ('father','mother')),
          grounded_in TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS family_pattern_tags_user_idx ON family_pattern_tags (user_id)`;
      // The "pattern broken" milestone -- judged by the same
      // tag_family_pattern call, on the same row, not a separate tool or
      // table. Defaults false: most disclosures are recognition, not a
      // reported instance of actually acting differently.
      await sql`ALTER TABLE family_pattern_tags ADD COLUMN IF NOT EXISTS pattern_broken_instance BOOLEAN NOT NULL DEFAULT false`;
      // "Your pattern" -- a personal, AI-generated reflection shown in a
      // node/theme's detail panel, grounded in the full accumulated tag
      // history for it (shared shape for both the Tree and Family
      // Constellation, keyed by which system + node). Not regenerated on
      // every view -- tag_count_at_generation is compared against the
      // node's current tag count so it only regenerates once there's
      // actually something new to say.
      await sql`
        CREATE TABLE IF NOT EXISTS node_reflections (
          user_id TEXT NOT NULL,
          system TEXT NOT NULL CHECK (system IN ('tree','family')),
          node TEXT NOT NULL,
          reflection TEXT NOT NULL,
          tag_count_at_generation INT NOT NULL,
          generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, system, node)
        )
      `;
      // A same-turn double-tag (one message that lit both a Tree node and
      // a Family Constellation theme) queued for the NEXT reply to name
      // retroactively -- since tag_sephirah/tag_family_pattern run in
      // parallel with reply generation, the model has no way to know
      // about a same-turn match while composing that same reply. Consumed
      // (deleted) the moment the next turn reads it, whether or not the
      // model actually chose to use it -- same "surfaced once" simplicity
      // as sephirah_path_acks.
      await sql`
        CREATE TABLE IF NOT EXISTS pending_cross_links (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          sephirah_node TEXT NOT NULL,
          family_theme TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      // A person's own chosen time to talk, most days, plus the timezone
      // their browser detected for them -- never asked as a hard rule, just
      // so a future check-in nudge can land at a time that's actually
      // theirs instead of an arbitrary fixed hour. Both nullable: most
      // people won't set this, and the app works the same either way.
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_time TEXT`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT`;
      // The local calendar date (in the person's own timezone) a check-in
      // nudge last went out -- the only guard against sending the same
      // nudge more than once while the cron's 20-minute match window keeps
      // being true across several 15-minute runs.
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_checkin_sent_date DATE`;
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
      // Subscription -- subscribed_until is the single source of truth for
      // access (compare against now(), never a separate status enum), kept
      // in sync from Stripe's current_period_end by the webhook. billing_email
      // is the address Stripe Checkout collected, kept separate from the
      // existing (unrelated, check-in-reminder) email column so a
      // subscription can never silently start emailing someone who only
      // ever gave an email for reminders.
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscribed_until TIMESTAMPTZ`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_email TEXT`;
      // Restore-my-subscription -- a single-use, short-lived token proving
      // possession of the billing inbox, swapped in client-side for the
      // real userId. One column pair, not a separate token table: only one
      // restore can ever be in flight for a given person at a time, same
      // "one active thing" simplicity as the rest of this schema.
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS restore_token TEXT`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS restore_token_expires_at TIMESTAMPTZ`;
      // Free-tier conversation frequency gate (Stage 3) -- conversation_period
      // is the calendar month (UTC, "YYYY-MM") the count below is scoped to;
      // kept as a separate column rather than derived from last_conversation_date
      // so the count and its window can be widened independently later.
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS conversation_period TEXT`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS conversations_this_period INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_conversation_date TEXT`;
      await sql`CREATE INDEX IF NOT EXISTS idx_users_restore_token ON users(restore_token)`;
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

export async function setUserSchedule(userId: string, preferredTime: string, timezone: string) {
  await ensureUser(userId);
  await sql`UPDATE users SET preferred_time = ${preferredTime}, timezone = ${timezone} WHERE id = ${userId}`;
}

// Called once, right after Stripe Checkout confirms the subscription
// (checkout.session.completed) -- the first time this user's stripe_* /
// subscribed_until columns are ever populated.
export async function setStripeSubscription(
  userId: string,
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  billingEmail: string,
  subscribedUntil: Date
) {
  await ensureUser(userId);
  await sql`
    UPDATE users
    SET stripe_customer_id = ${stripeCustomerId},
        stripe_subscription_id = ${stripeSubscriptionId},
        billing_email = ${billingEmail},
        subscribed_until = ${subscribedUntil.toISOString()}
    WHERE id = ${userId}
  `;
}

// Called on every customer.subscription.updated webhook (a renewal, a plan
// change, Stripe's own dunning retries) to keep subscribed_until in sync
// with Stripe's current_period_end -- the single source of truth for
// access. Looked up by stripe_subscription_id since the webhook payload
// carries Stripe's ids, not this app's userId.
export async function updateSubscriptionPeriod(stripeSubscriptionId: string, subscribedUntil: Date) {
  await sql`
    UPDATE users
    SET subscribed_until = ${subscribedUntil.toISOString()}
    WHERE stripe_subscription_id = ${stripeSubscriptionId}
  `;
}

// Generates and stores a fresh single-use restore token for whichever
// subscriber (if any) owns this billing email -- overwrites any token
// already pending for them, so only the most recently requested link ever
// works. Returns null (and stores nothing) if no subscriber matches, so the
// caller can still send the same generic "if that email..." response
// either way without leaking which emails are real subscribers.
export async function issueRestoreToken(
  billingEmail: string,
  token: string,
  expiresAt: Date
): Promise<{ userId: string } | null> {
  await ensureSchema();
  const rows = await sql`
    UPDATE users
    SET restore_token = ${token}, restore_token_expires_at = ${expiresAt.toISOString()}
    WHERE billing_email = ${billingEmail} AND subscribed_until > now()
    RETURNING id
  `;
  const row = rows[0] as { id: string } | undefined;
  return row ? { userId: row.id } : null;
}

// Consumes a restore token -- one-shot: a matching, unexpired token is
// cleared in the same statement that reads it, so the link in the email
// can never be replayed even if the user's browser caches or refetches it.
export async function consumeRestoreToken(token: string): Promise<{ userId: string } | null> {
  await ensureSchema();
  const rows = await sql`
    UPDATE users
    SET restore_token = NULL, restore_token_expires_at = NULL
    WHERE restore_token = ${token} AND restore_token_expires_at > now()
    RETURNING id
  `;
  const row = rows[0] as { id: string } | undefined;
  return row ? { userId: row.id } : null;
}

// The free-tier frequency gate -- unlimited for an active subscriber,
// otherwise up to 3 separate UTC calendar days of conversation per UTC
// calendar month. Continuing the same day never counts twice (checked
// before the count), and the count itself resets the first time someone
// talks in a new month. A tiny race between two near-simultaneous requests
// from the same person could let one extra day through -- not worth a
// transaction for how rarely that could even happen.
export async function checkConversationGate(userId: string): Promise<{ allowed: boolean }> {
  await ensureUser(userId);
  const rows = await sql`
    SELECT subscribed_until, conversation_period, conversations_this_period, last_conversation_date
    FROM users WHERE id = ${userId}
  `;
  const row = rows[0] as {
    subscribed_until: string | null;
    conversation_period: string | null;
    conversations_this_period: number;
    last_conversation_date: string | null;
  };

  if (row.subscribed_until && new Date(row.subscribed_until) > new Date()) {
    return { allowed: true };
  }

  const today = new Date().toISOString().slice(0, 10); // UTC, "YYYY-MM-DD"
  if (row.last_conversation_date === today) {
    return { allowed: true };
  }

  // A pending open commitment is a narrow, self-bounding exception: only
  // one is ever tracked at a time, and it clears the moment the
  // follow-up actually happens -- so this can't become an indefinite
  // way around the limit, only protection for the one visit that's
  // actually closing something out.
  if (await getOpenCommitment(userId)) {
    return { allowed: true };
  }

  const month = today.slice(0, 7); // UTC, "YYYY-MM"
  const countThisMonth = row.conversation_period === month ? row.conversations_this_period : 0;
  if (countThisMonth >= 3) {
    return { allowed: false };
  }

  await sql`
    UPDATE users
    SET conversation_period = ${month},
        conversations_this_period = ${countThisMonth + 1},
        last_conversation_date = ${today}
    WHERE id = ${userId}
  `;
  return { allowed: true };
}

export async function getUser(userId: string) {
  await ensureSchema();
  const rows = await sql`SELECT * FROM users WHERE id = ${userId}`;
  return rows[0] as
    | {
        id: string;
        email: string | null;
        preferred_time: string | null;
        timezone: string | null;
        stripe_customer_id: string | null;
        stripe_subscription_id: string | null;
        subscribed_until: string | null;
        billing_email: string | null;
      }
    | undefined;
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

// Wins for the weekly recap -- the person's own browser clock decides when
// a week has turned over (Sunday 7pm local, no timezone stored server-side),
// so this just takes whatever "since" boundary the client already computed.
export async function getRecentWins(
  userId: string,
  since: Date
): Promise<{ action: string; resolved_at: string }[]> {
  await ensureSchema();
  const rows = await sql`
    SELECT action, resolved_at FROM commitments
    WHERE user_id = ${userId} AND status = 'landed' AND resolved_at >= ${since.toISOString()}
    ORDER BY resolved_at ASC
  `;
  return rows as unknown as { action: string; resolved_at: string }[];
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

// People whose own chosen check-in time (in their own timezone) is right
// now, per this run of the cron -- a 20-minute window against a cron that
// fires every 15 minutes, so a run landing a few minutes late still
// catches everyone. last_checkin_sent_date is the only thing stopping the
// same person being nudged again on a later run inside that same window,
// or again later the same day.
//
// Known limitation, not worth solving for now: a preferred time in the
// last ~20 minutes before local midnight won't match, since the window
// math doesn't wrap across a day boundary. Affects only people who
// specifically chose a time that late.
export async function getDueCheckIns(): Promise<{ id: string; email: string; local_date: string }[]> {
  await ensureSchema();
  const rows = await sql`
    SELECT id, email, (now() AT TIME ZONE timezone)::date::text AS local_date
    FROM users
    WHERE email IS NOT NULL
      AND preferred_time IS NOT NULL
      AND timezone IS NOT NULL
      AND (now() AT TIME ZONE timezone)::time >= preferred_time::time
      AND (now() AT TIME ZONE timezone)::time < (preferred_time::time + INTERVAL '20 minutes')
      AND (last_checkin_sent_date IS DISTINCT FROM (now() AT TIME ZONE timezone)::date)
  `;
  return rows as unknown as { id: string; email: string; local_date: string }[];
}

export async function markCheckInSent(userId: string, localDate: string) {
  await sql`UPDATE users SET last_checkin_sent_date = ${localDate} WHERE id = ${userId}`;
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

// --- Admin dashboard (private, aggregate-only) -------------------------
// Every field here is a count or a percentage of counts -- never message
// content, grounded_in text, or anything traceable to one specific
// person. See app/admin/page.tsx for the one place this is rendered,
// gated by ADMIN_SECRET, never linked from the regular app UI.

export interface AdminSignals {
  totalUsers: number;
  // "Real" = 2+ messages they actually typed (role='user'), not just the
  // opening mood chip -- that alone already sends one user message and
  // gets a reply, so a plain message-count>=1 threshold would count
  // someone who never typed anything themselves.
  usersWithRealConversation: number;
  active7d: number;
  active30d: number;
  // Distinct-calendar-days-with-a-message cohort, same definition as
  // Signals.returningUsers above (day 1 = everyone who ever showed up).
  // Capped at a "5+" bucket -- with a small user base, deeper buckets
  // are mostly single people and not worth a row each.
  retention: { day: number | "5+"; users: number; pct: number }[];
  commitments: {
    landed: number;
    tried: number;
    notLanded: number;
    pending: number;
    // Percentages of resolved commitments (landed+tried+notLanded) --
    // pending isn't an outcome yet, so it's excluded from the split.
    landedPct: number;
    triedPct: number;
    notLandedPct: number;
  };
  nodeDepth: {
    // Users with >=1 sephirah at "returned_to" or "deeply_worked".
    treeUsers: number;
    // Users with >=1 family theme at "returned_to" or "deeply_worked".
    familyUsers: number;
    // Union of the two above -- the headline "is the core mechanic
    // actually working" number.
    combinedUsers: number;
  };
}

export async function getAdminSignals(): Promise<AdminSignals> {
  await ensureSchema();

  const totalUsers = Number(
    ((await sql`SELECT COUNT(*) as count FROM users`) as unknown as { count: string | number }[])[0]
      .count
  );

  const realConvoRows = (await sql`
    SELECT COUNT(*) as count FROM (
      SELECT user_id FROM messages WHERE role = 'user' GROUP BY user_id HAVING COUNT(*) >= 2
    ) t
  `) as unknown as { count: string | number }[];
  const usersWithRealConversation = Number(realConvoRows[0].count);

  const active7dRows = (await sql`
    SELECT COUNT(DISTINCT user_id) as count FROM messages WHERE created_at >= now() - interval '7 days'
  `) as unknown as { count: string | number }[];
  const active30dRows = (await sql`
    SELECT COUNT(DISTINCT user_id) as count FROM messages WHERE created_at >= now() - interval '30 days'
  `) as unknown as { count: string | number }[];

  // Retention cohort: distinct active days per user, bucketed.
  const dayCountRows = (await sql`
    SELECT COUNT(DISTINCT created_at::date) as days FROM messages GROUP BY user_id
  `) as unknown as { days: string | number }[];
  const dayCounts = dayCountRows.map((r) => Number(r.days));
  const day1 = dayCounts.filter((d) => d >= 1).length;
  const retention: AdminSignals["retention"] = [1, 2, 3, 4].map((n) => {
    const users = dayCounts.filter((d) => d >= n).length;
    return { day: n, users, pct: day1 > 0 ? (users / day1) * 100 : 0 };
  });
  const day5plus = dayCounts.filter((d) => d >= 5).length;
  retention.push({ day: "5+", users: day5plus, pct: day1 > 0 ? (day5plus / day1) * 100 : 0 });

  const outcomeRows = (await sql`
    SELECT status, COUNT(*) as count FROM commitments GROUP BY status
  `) as unknown as { status: string; count: string | number }[];
  const outcomes = { landed: 0, tried: 0, not_landed: 0, pending: 0 };
  for (const r of outcomeRows) {
    if (r.status in outcomes) (outcomes as Record<string, number>)[r.status] = Number(r.count);
  }
  const resolvedTotal = outcomes.landed + outcomes.tried + outcomes.not_landed;
  const commitments: AdminSignals["commitments"] = {
    landed: outcomes.landed,
    tried: outcomes.tried,
    notLanded: outcomes.not_landed,
    pending: outcomes.pending,
    landedPct: resolvedTotal > 0 ? (outcomes.landed / resolvedTotal) * 100 : 0,
    triedPct: resolvedTotal > 0 ? (outcomes.tried / resolvedTotal) * 100 : 0,
    notLandedPct: resolvedTotal > 0 ? (outcomes.not_landed / resolvedTotal) * 100 : 0,
  };

  // Node depth: pull raw tags (small dataset -- one row per genuine
  // disclosure, nothing per-message) and run the exact same deriveTier
  // used everywhere else in the app, so this can never quietly drift
  // from what a user's own Tree/Family screen actually shows them.
  const sephirahRows = (await sql`
    SELECT user_id, node, weight, created_at::date as day FROM sephirah_tags
  `) as unknown as { user_id: string; node: SephirahKey; weight: SephirahWeight; day: string }[];
  const familyRows = (await sql`
    SELECT user_id, theme, weight, created_at::date as day FROM family_pattern_tags
  `) as unknown as { user_id: string; theme: FamilyTheme; weight: SephirahWeight; day: string }[];

  function usersWithDepth<R extends { user_id: string; weight: SephirahWeight; day: string }>(
    rows: R[],
    keyOf: (r: R) => string
  ): Set<string> {
    const grouped = new Map<string, { weight: SephirahWeight; day: string }[]>();
    for (const r of rows) {
      const key = `${r.user_id}::${keyOf(r)}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push({ weight: r.weight, day: r.day });
    }
    const deep = new Set<string>();
    for (const [key, tags] of grouped) {
      const tier = deriveTier(tags);
      if (tier === "returned_to" || tier === "deeply_worked") {
        deep.add(key.split("::")[0]);
      }
    }
    return deep;
  }

  const treeDeepUsers = usersWithDepth(sephirahRows, (r) => r.node);
  const familyDeepUsers = usersWithDepth(familyRows, (r) => r.theme);
  const combinedDeepUsers = new Set([...treeDeepUsers, ...familyDeepUsers]);

  return {
    totalUsers,
    usersWithRealConversation,
    active7d: Number(active7dRows[0].count),
    active30d: Number(active30dRows[0].count),
    retention,
    commitments,
    nodeDepth: {
      treeUsers: treeDeepUsers.size,
      familyUsers: familyDeepUsers.size,
      combinedUsers: combinedDeepUsers.size,
    },
  };
}

// --- Tree of Life -----------------------------------------------------
// Judged by tag_sephirah in lib/anthropic.ts, one row per genuine
// disclosure. Never a quiz, never announced. See TreeOfLife.tsx for the
// node/tier types this shares.

export type { SephirahWeight };

export async function recordSephirahTag(
  userId: string,
  node: SephirahKey,
  weight: SephirahWeight,
  groundedIn: string
) {
  await ensureUser(userId);
  await sql`
    INSERT INTO sephirah_tags (user_id, node, weight, grounded_in)
    VALUES (${userId}, ${node}, ${weight}, ${groundedIn})
  `;
}

// Tier is always derived from the full tag history, never a stored
// counter -- see lib/tree.ts's deriveTier for the actual rule, shared
// with Family Constellation's getFamilyState below.
export async function getTreeState(userId: string): Promise<TreeState> {
  await ensureSchema();
  const rows = (await sql`
    SELECT node, weight, grounded_in, created_at::date as day
    FROM sephirah_tags
    WHERE user_id = ${userId}
    ORDER BY created_at ASC
  `) as unknown as { node: SephirahKey; weight: SephirahWeight; grounded_in: string; day: string }[];

  const byNode = new Map<SephirahKey, typeof rows>();
  for (const row of rows) {
    const list = byNode.get(row.node) ?? [];
    list.push(row);
    byNode.set(row.node, list);
  }

  const state: TreeState = {};
  for (const [node, tags] of byNode) {
    const tier: SephirahState["tier"] = deriveTier(tags);
    const latest = tags[tags.length - 1];
    state[node] = { tier, groundedIn: latest.grounded_in };
  }
  return state;
}

// --- Family Constellation -----------------------------------------------
// Judged by tag_family_pattern in lib/anthropic.ts, one row per genuine
// disclosure that actually traced to a specific parent. Same tiering
// shape and rules as the Tree of Life above -- see getTreeState.

export async function recordFamilyPatternTag(
  userId: string,
  theme: FamilyTheme,
  weight: SephirahWeight,
  tracesTo: FamilyLine,
  groundedIn: string,
  patternBrokenInstance = false
) {
  await ensureUser(userId);
  await sql`
    INSERT INTO family_pattern_tags (user_id, theme, weight, traces_to, grounded_in, pattern_broken_instance)
    VALUES (${userId}, ${theme}, ${weight}, ${tracesTo}, ${groundedIn}, ${patternBrokenInstance})
  `;
}

export async function getFamilyState(userId: string): Promise<FamilyState> {
  await ensureSchema();
  const rows = (await sql`
    SELECT theme, weight, traces_to, grounded_in, pattern_broken_instance, created_at::date as day
    FROM family_pattern_tags
    WHERE user_id = ${userId}
    ORDER BY created_at ASC
  `) as unknown as {
    theme: FamilyTheme;
    weight: SephirahWeight;
    traces_to: FamilyLine;
    grounded_in: string;
    pattern_broken_instance: boolean;
    day: string;
  }[];

  const byTheme = new Map<FamilyTheme, typeof rows>();
  for (const row of rows) {
    const list = byTheme.get(row.theme) ?? [];
    list.push(row);
    byTheme.set(row.theme, list);
  }

  const state: FamilyState = {};
  for (const [theme, tags] of byTheme) {
    const tier = deriveTier(tags);
    const latest = tags[tags.length - 1];
    // The milestone -- 2+ distinct calendar days with a genuine reported
    // instance. Unlike deriveTier's tiers above (which no longer need a
    // second day), this one stays day-gated on purpose: it claims actual
    // real-world behavior change, which can't honestly be demonstrated
    // twice inside a single conversation. One dramatic report alone
    // never qualifies.
    const brokenDays = new Set(tags.filter((t) => t.pattern_broken_instance).map((t) => t.day));
    const broken = brokenDays.size >= 2;
    state[theme] = { tier, groundedIn: latest.grounded_in, tracesTo: latest.traces_to, broken };
  }
  return state;
}

export type AvoidancePattern = {
  system: "tree" | "family";
  node: SephirahKey | FamilyTheme;
  distinctSurfaceDays: number;
};

// A different read of the same tag history deriveTier already uses: a
// node/theme with 3+ distinct calendar days of a surface tag and NEVER
// once anything deeper is the data signature of approaching something
// and pulling back, every time -- not a topic that just hasn't come up.
// Disqualified the moment a single substantive-or-deeper tag exists
// anywhere in its history, even on an otherwise-qualifying node -- that's
// real progress, not avoidance. When more than one node qualifies, the
// one with the most distinct surface days wins (same unit the threshold
// itself is measured in); ties break on total surface-tag count, then on
// a fixed order (every Tree node before any Family theme, then each
// system's own established order) so the choice never flip-flops between
// otherwise-identical candidates.
export async function getAvoidancePattern(userId: string): Promise<AvoidancePattern | undefined> {
  await ensureSchema();
  const [treeRows, familyRows] = (await Promise.all([
    sql`SELECT node, weight, created_at::date as day FROM sephirah_tags WHERE user_id = ${userId}`,
    sql`SELECT theme, weight, created_at::date as day FROM family_pattern_tags WHERE user_id = ${userId}`,
  ])) as unknown as [
    { node: SephirahKey; weight: SephirahWeight; day: string }[],
    { theme: FamilyTheme; weight: SephirahWeight; day: string }[]
  ];

  type Candidate = {
    system: "tree" | "family";
    node: SephirahKey | FamilyTheme;
    distinctSurfaceDays: number;
    totalSurfaceTags: number;
    orderIndex: number;
  };
  const candidates: Candidate[] = [];

  function evaluate(
    node: SephirahKey | FamilyTheme,
    tags: { weight: SephirahWeight; day: string }[],
    system: "tree" | "family",
    orderIndex: number
  ) {
    if (tags.some((t) => t.weight !== "surface")) return; // already progressed -- not avoidance
    const distinctSurfaceDays = new Set(tags.map((t) => t.day)).size;
    if (distinctSurfaceDays < 3) return;
    candidates.push({ system, node, distinctSurfaceDays, totalSurfaceTags: tags.length, orderIndex });
  }

  const byNode = new Map<SephirahKey, { weight: SephirahWeight; day: string }[]>();
  for (const row of treeRows) {
    const list = byNode.get(row.node) ?? [];
    list.push(row);
    byNode.set(row.node, list);
  }
  for (const [node, tags] of byNode) {
    evaluate(node, tags, "tree", NODE_ORDER.indexOf(node));
  }

  const byTheme = new Map<FamilyTheme, { weight: SephirahWeight; day: string }[]>();
  for (const row of familyRows) {
    const list = byTheme.get(row.theme) ?? [];
    list.push(row);
    byTheme.set(row.theme, list);
  }
  for (const [theme, tags] of byTheme) {
    evaluate(theme, tags, "family", NODE_ORDER.length + THEME_ORDER.indexOf(theme));
  }

  if (candidates.length === 0) return undefined;

  candidates.sort((a, b) => {
    if (b.distinctSurfaceDays !== a.distinctSurfaceDays) return b.distinctSurfaceDays - a.distinctSurfaceDays;
    if (b.totalSurfaceTags !== a.totalSurfaceTags) return b.totalSurfaceTags - a.totalSurfaceTags;
    return a.orderIndex - b.orderIndex;
  });

  const best = candidates[0];
  return { system: best.system, node: best.node, distinctSurfaceDays: best.distinctSurfaceDays };
}

export async function recordCrossLink(userId: string, sephirahNode: SephirahKey, familyTheme: FamilyTheme) {
  await ensureUser(userId);
  await sql`
    INSERT INTO pending_cross_links (user_id, sephirah_node, family_theme)
    VALUES (${userId}, ${sephirahNode}, ${familyTheme})
  `;
}

// Fetches and deletes in one query -- surfaced to the very next turn's
// context exactly once, whether or not the model chose to use it.
export async function consumePendingCrossLinks(
  userId: string
): Promise<{ sephirahNode: SephirahKey; familyTheme: FamilyTheme }[]> {
  await ensureSchema();
  const rows = (await sql`
    DELETE FROM pending_cross_links WHERE user_id = ${userId}
    RETURNING sephirah_node, family_theme
  `) as unknown as { sephirah_node: SephirahKey; family_theme: FamilyTheme }[];
  return rows.map((r) => ({ sephirahNode: r.sephirah_node, familyTheme: r.family_theme }));
}

function edgeKey(a: SephirahKey, b: SephirahKey): string {
  return [a, b].sort().join("-");
}

// Finds the first currently-lit path (both ends tagged) that's never been
// acknowledged before, and marks it acknowledged in the same call -- so
// it surfaces exactly once, ever, per person per path. Not a popup, just
// a fact the client can choose to say quietly once.
export async function claimNewConnection(
  userId: string,
  state: TreeState
): Promise<{ a: SephirahKey; b: SephirahKey } | null> {
  await ensureSchema();
  const litEdges = EDGES.filter(([a, b]) => state[a] && state[b]);
  if (litEdges.length === 0) return null;

  const existing = (await sql`
    SELECT edge FROM sephirah_path_acks WHERE user_id = ${userId}
  `) as unknown as { edge: string }[];
  const acked = new Set(existing.map((r) => r.edge));

  for (const [a, b] of litEdges) {
    const key = edgeKey(a, b);
    if (!acked.has(key)) {
      await ensureUser(userId);
      await sql`
        INSERT INTO sephirah_path_acks (user_id, edge) VALUES (${userId}, ${key})
        ON CONFLICT (user_id, edge) DO NOTHING
      `;
      return { a, b };
    }
  }
  return null;
}

// The most recent substantive-or-deeper disclosures for one node -- used
// as grounding material for a tension-pair insight, so the model has real
// content to reflect from rather than just a node name.
export async function getGroundedNotes(
  userId: string,
  node: SephirahKey,
  limit = 6
): Promise<string[]> {
  await ensureSchema();
  const rows = (await sql`
    SELECT grounded_in FROM sephirah_tags
    WHERE user_id = ${userId} AND node = ${node} AND weight != 'surface'
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as unknown as { grounded_in: string }[];
  return rows.map((r) => r.grounded_in);
}

// Same shape as getGroundedNotes, for Family Constellation.
export async function getFamilyGroundedNotes(
  userId: string,
  theme: FamilyTheme,
  limit = 6
): Promise<string[]> {
  await ensureSchema();
  const rows = (await sql`
    SELECT grounded_in FROM family_pattern_tags
    WHERE user_id = ${userId} AND theme = ${theme} AND weight != 'surface'
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as unknown as { grounded_in: string }[];
  return rows.map((r) => r.grounded_in);
}

export async function getSephirahTagCount(userId: string, node: SephirahKey): Promise<number> {
  await ensureSchema();
  const rows = await sql`
    SELECT COUNT(*)::int as count FROM sephirah_tags WHERE user_id = ${userId} AND node = ${node}
  `;
  return (rows[0] as { count: number }).count;
}

export async function getFamilyTagCount(userId: string, theme: FamilyTheme): Promise<number> {
  await ensureSchema();
  const rows = await sql`
    SELECT COUNT(*)::int as count FROM family_pattern_tags WHERE user_id = ${userId} AND theme = ${theme}
  `;
  return (rows[0] as { count: number }).count;
}

// "Your pattern" -- see the node_reflections table comment in
// ensureSchema for the caching rule this is part of.
export async function getStoredReflection(
  userId: string,
  system: "tree" | "family",
  node: string
): Promise<{ reflection: string; tagCountAtGeneration: number } | undefined> {
  await ensureSchema();
  const rows = await sql`
    SELECT reflection, tag_count_at_generation FROM node_reflections
    WHERE user_id = ${userId} AND system = ${system} AND node = ${node}
  `;
  const row = rows[0] as { reflection: string; tag_count_at_generation: number } | undefined;
  return row ? { reflection: row.reflection, tagCountAtGeneration: row.tag_count_at_generation } : undefined;
}

export async function saveReflection(
  userId: string,
  system: "tree" | "family",
  node: string,
  reflection: string,
  tagCount: number
) {
  await ensureUser(userId);
  await sql`
    INSERT INTO node_reflections (user_id, system, node, reflection, tag_count_at_generation)
    VALUES (${userId}, ${system}, ${node}, ${reflection}, ${tagCount})
    ON CONFLICT (user_id, system, node)
    DO UPDATE SET
      reflection = excluded.reflection,
      tag_count_at_generation = excluded.tag_count_at_generation,
      generated_at = now()
  `;
}

export async function getStoredTensionInsight(
  userId: string,
  pair: string
): Promise<string | undefined> {
  await ensureSchema();
  const rows = await sql`
    SELECT insight FROM sephirah_pair_insights WHERE user_id = ${userId} AND pair = ${pair}
  `;
  return (rows[0] as { insight: string } | undefined)?.insight;
}

export async function saveTensionInsight(userId: string, pair: string, insight: string) {
  await ensureUser(userId);
  await sql`
    INSERT INTO sephirah_pair_insights (user_id, pair, insight) VALUES (${userId}, ${pair}, ${insight})
    ON CONFLICT (user_id, pair) DO NOTHING
  `;
}

// Da'at earns itself once at least two of the three tension pairs have
// both sides at "returned to" or deeper -- never a tap count, and never
// something a person can see coming: no partial progress is exposed
// anywhere. "justNow" tells the client whether this is the first time
// it's ever been claimed (play the slow fade-in) or it's already been
// seen before (just show it, no animation).
export async function claimDaatReveal(
  userId: string,
  state: TreeState
): Promise<{ revealed: boolean; justNow: boolean }> {
  await ensureSchema();
  const resolvedPairs = TENSION_PAIRS.filter((p) => {
    const a = state[p.a];
    const b = state[p.b];
    return a && b && TIER_RANK[a.tier] >= TIER_RANK.returned_to && TIER_RANK[b.tier] >= TIER_RANK.returned_to;
  }).length;

  if (resolvedPairs < 2) {
    return { revealed: false, justNow: false };
  }

  const existing = await sql`SELECT 1 FROM daat_reveals WHERE user_id = ${userId}`;
  if (existing.length > 0) {
    return { revealed: true, justNow: false };
  }

  await ensureUser(userId);
  await sql`
    INSERT INTO daat_reveals (user_id) VALUES (${userId})
    ON CONFLICT (user_id) DO NOTHING
  `;
  return { revealed: true, justNow: true };
}
