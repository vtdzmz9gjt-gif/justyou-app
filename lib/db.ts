import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dataDir = process.env.VERCEL
  ? path.join("/tmp", "the-return-data")
  : path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "return.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user','assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS commitments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','landed','not_landed')),
    reminder_sent INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  );

  CREATE TABLE IF NOT EXISTS user_stage (
    user_id TEXT PRIMARY KEY,
    stage TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, id);
  CREATE INDEX IF NOT EXISTS idx_commitments_user ON commitments(user_id, status);
`);

export type Role = "user" | "assistant";

export interface StoredMessage {
  id: number;
  user_id: string;
  role: Role;
  content: string;
  created_at: string;
}

export interface Commitment {
  id: number;
  user_id: string;
  action: string;
  target_date: string;
  status: "pending" | "landed" | "not_landed";
  reminder_sent: number;
  created_at: string;
  resolved_at: string | null;
}

export function ensureUser(userId: string) {
  db.prepare("INSERT OR IGNORE INTO users (id) VALUES (?)").run(userId);
}

export function setUserEmail(userId: string, email: string) {
  ensureUser(userId);
  db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email, userId);
}

export function getUser(userId: string) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as
    | { id: string; email: string | null }
    | undefined;
}

export function getMessages(userId: string): StoredMessage[] {
  return db
    .prepare("SELECT * FROM messages WHERE user_id = ? ORDER BY id ASC")
    .all(userId) as StoredMessage[];
}

export function addMessage(userId: string, role: Role, content: string) {
  db.prepare(
    "INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)"
  ).run(userId, role, content);
}

export function getOpenCommitment(userId: string): Commitment | undefined {
  return db
    .prepare(
      "SELECT * FROM commitments WHERE user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1"
    )
    .get(userId) as Commitment | undefined;
}

export function recordCommitment(
  userId: string,
  action: string,
  targetDate: string
): Commitment {
  // Only one open loop at a time — superseding an old pending one is a
  // deliberate simplification for this prototype, not a silent bug.
  db.prepare(
    "UPDATE commitments SET status = 'not_landed', resolved_at = datetime('now') WHERE user_id = ? AND status = 'pending'"
  ).run(userId);

  const info = db
    .prepare(
      "INSERT INTO commitments (user_id, action, target_date) VALUES (?, ?, ?)"
    )
    .run(userId, action, targetDate);

  return db
    .prepare("SELECT * FROM commitments WHERE id = ?")
    .get(info.lastInsertRowid) as Commitment;
}

export function resolveCommitment(
  userId: string,
  outcome: "landed" | "not_landed"
): Commitment | undefined {
  const open = getOpenCommitment(userId);
  if (!open) return undefined;
  db.prepare(
    "UPDATE commitments SET status = ?, resolved_at = datetime('now') WHERE id = ?"
  ).run(outcome, open.id);
  return db.prepare("SELECT * FROM commitments WHERE id = ?").get(open.id) as Commitment;
}

// How many of this user's commitments have ever landed. Used to gate the
// Courage -> Return transition, which requires proof across more than
// one conversation, not just a single follow-through.
export function countLandedCommitments(userId: string): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) as count FROM commitments WHERE user_id = ? AND status = 'landed'"
    )
    .get(userId) as { count: number };
  return row.count;
}

export function getDueReminders(): (Commitment & { email: string })[] {
  return db
    .prepare(
      `SELECT c.*, u.email as email
       FROM commitments c
       JOIN users u ON u.id = c.user_id
       WHERE c.status = 'pending'
         AND c.reminder_sent = 0
         AND u.email IS NOT NULL
         AND date(c.target_date) <= date('now', '+1 day')`
    )
    .all() as (Commitment & { email: string })[];
}

export function markReminderSent(commitmentId: number) {
  db.prepare("UPDATE commitments SET reminder_sent = 1 WHERE id = ?").run(
    commitmentId
  );
}

// --- Stage tracking (Mystery / Safety / Recognition / Courage / Return) ---

export type Stage = "mystery" | "safety" | "recognition" | "courage" | "return";

export function setUserStage(userId: string, stage: Stage) {
  ensureUser(userId);
  db.prepare(
    `INSERT INTO user_stage (user_id, stage, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET stage = excluded.stage, updated_at = excluded.updated_at`
  ).run(userId, stage);
}

export function getUserStage(userId: string): Stage | undefined {
  const row = db
    .prepare("SELECT stage FROM user_stage WHERE user_id = ?")
    .get(userId) as { stage: Stage } | undefined;
  return row?.stage;
}

// Real, current percentage of all users sitting at each stage right now —
// not a fabricated or hardcoded number. Used only for the empathetic
// "this is where most people are" framing, never for ranking one user
// against another.
export function getStagePercentages(): Record<string, number> {
  const rows = db
    .prepare(`SELECT stage, COUNT(*) as count FROM user_stage GROUP BY stage`)
    .all() as { stage: string; count: number }[];

  const total = rows.reduce((sum, r) => sum + r.count, 0);
  if (total === 0) return {};

  const result: Record<string, number> = {};
  for (const r of rows) {
    result[r.stage] = Math.round((r.count / total) * 100);
  }
  return result;
}

export default db;
