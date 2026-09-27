# Just You — working prototype

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
- **Postgres** (`lib/db.ts`, via `@neondatabase/serverless`) — stores
  messages and commitments per browser (a random ID is generated into
  `localStorage` on first visit — there's no login for this prototype).
  Needs `DATABASE_URL` set; on Vercel this is populated automatically once
  a Postgres database (Neon, from the Vercel Marketplace) is connected to
  the project.
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
vercel env pull   # pulls DATABASE_URL and ANTHROPIC_API_KEY from Vercel
npm run dev
```

Open http://localhost:3000. If you're not using Vercel's CLI, copy
`.env.example` to `.env.local` and fill in `ANTHROPIC_API_KEY` and
`DATABASE_URL` (any Postgres instance) yourself instead.

## Deploying so real people can use it

Deployed on Vercel, aliased to the production domain. Needs
`ANTHROPIC_API_KEY` and `DATABASE_URL` set as environment variables —
`DATABASE_URL` is populated automatically once a Postgres database is
connected to the project (Storage tab → connect a Postgres/Neon
database), so persistence isn't tied to the serverless filesystem the
way it would be with SQLite.

## Wiring up the proactive email nudge (optional)

1. Get a free API key at [resend.com](https://resend.com).
2. Set `RESEND_API_KEY` (and optionally `FROM_EMAIL`) as an environment
   variable on Vercel.
3. That's it — `vercel.json` already schedules a Vercel Cron Job to hit
   `GET /api/cron/check-ins` once a day. If you set `CRON_SECRET`, Vercel
   automatically sends it as the `Authorization: Bearer <secret>` header
   on its own scheduled requests.

Skip all of this and the app still works — see "proactive check-ins"
above.

## Testing with real people (spec step 5)

Send people the deployed URL. Nothing to install. Each browser gets its
own thread and its own single open commitment. Worth watching for, per
your spec's own concerns: whether the tone actually reads as a friend and
not a therapist, whether the crisis-detection judgment call holds up
under real "heavy" messages, and whether the follow-up loop's check-in
feels like genuine care rather than a notification.




