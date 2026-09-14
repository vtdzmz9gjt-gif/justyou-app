# The Return — working prototype

A minimal, real chat app that turns `system-prompt.md` (built from your
`the_return_system_prompt_spec.md`) into an actual Claude-backed
conversation, with the follow-up loop wired to a real database — not a
mock. This is meant to match the spec's own suggested build order, steps
1–3: the system prompt is live, there's a working chat, and the follow-up
loop stores one open commitment per person with a target date and a
check-in.

## What's actually in here

- **Next.js app** (App Router, TypeScript) — one page, two API routes.
- **`system-prompt.md`** — the literal system prompt, in second person,
  covering tone, the why→ask→how structure, source grounding, the
  follow-up loop, and crisis handling exactly as your spec described them.
- **Claude API chat** (`app/api/chat`) — calls the Messages API with that
  system prompt plus live context (today's date, any open commitment).
  Claude has two tools it can call mid-conversation: `record_commitment`
  and `resolve_open_commitment`. It decides when to use them — you don't
  have to parse its replies for intent.
- **SQLite** (`lib/db.ts`, via `better-sqlite3`) — stores messages and
  commitments per browser (a random ID is generated into `localStorage` on
  first visit — there's no login for this prototype).
- **Proactive check-ins** (`app/api/cron/check-ins`) — optional. If someone
  leaves an email (via the ⋯ menu in the app) and you wire this endpoint
  to a daily scheduler, it emails them the day before a commitment is due,
  matching the spec's "app reaches out first" behavior. Without that
  setup, the app still honors the spirit of it on the pull model: the
  moment someone opens the chat after their target date has passed,
  Claude raises it itself, unprompted — that's built into the system
  prompt's context, not the email path.

## Run it locally

```bash
npm install
cp .env.example .env.local
# edit .env.local and set ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000. That's the whole setup for testing it
yourself right now.

> This project was put together in a sandboxed environment without access
> to the npm registry, so `npm install` and `npm run build` haven't been
> run here — the code has been written and reviewed carefully, but treat
> the first `npm install` / `npm run dev` as the real first test. If a
> dependency's types shifted slightly (SDK versions move fast), the fix is
> almost always a one-line type adjustment in `lib/anthropic.ts`.

## Deploying so real people can use it

Two things matter for deployment: the app needs a persistent filesystem
(SQLite is a file), and it needs `ANTHROPIC_API_KEY` set as an environment
variable on the host.

- **Vercel**: works for the chat itself, but Vercel's serverless
  filesystem is not persistent between deploys/cold starts — commitments
  and message history can reset. Fine for a quick demo link, not for the
  multi-week test in the spec's step 5.
- **Railway, Render, Fly.io, or any small VPS** (recommended): these give
  you a persistent disk, so SQLite just works. Point the service at this
  repo, set `ANTHROPIC_API_KEY`, run `npm run build && npm start`.
- If you outgrow SQLite (multiple server instances, need real backups),
  swap `lib/db.ts` for Postgres — the rest of the app doesn't need to
  change, since everything else calls the exported functions, not SQL
  directly.

## Wiring up the proactive email nudge (optional)

1. Get a free API key at [resend.com](https://resend.com).
2. Set `RESEND_API_KEY` and `FROM_EMAIL` in your environment.
3. Point any scheduler at `GET /api/cron/check-ins` once a day — a Vercel
   Cron Job, a GitHub Action on a schedule, or a free pinger like
   cron-job.org all work. If you set `CRON_SECRET`, send it as
   `Authorization: Bearer <secret>`.

Skip all of this and the app still works — see "proactive check-ins"
above.

## Testing with real people (spec step 5)

Send people the deployed URL. Nothing to install. Each browser gets its
own thread and its own single open commitment. Worth watching for, per
your spec's own concerns: whether the tone actually reads as a friend and
not a therapist, whether the crisis-detection judgment call holds up
under real "heavy" messages, and whether the follow-up loop's check-in
feels like genuine care rather than a notification.
