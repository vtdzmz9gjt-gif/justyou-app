# Just You — build progress & spec reconciliation

This file exists so any AI tool (not just the one that wrote it) can pick up
this project with full context, without re-deriving decisions that were
already made. Read this alongside `docs/just-you-spec-v2.md` (the original
product spec) and `README.md` (how to run/deploy). If you're an AI assistant
starting fresh on this repo: read all three before changing anything.

**Live at:** justyou.fyi, deployed on Vercel from this repo's `main` branch.

## Architecture, in one paragraph

Next.js (App Router, TypeScript), one page (`app/page.tsx`) driving a
single-thread chat UI, backed by Postgres (Neon, via `lib/db.ts`) for
messages/commitments/stage/shape-family/mirror-line storage, and the Claude
API (`lib/anthropic.ts`) for the actual conversation. The AI's behavior is
governed almost entirely by `system-prompt.md` (read as a plain string at
runtime) plus a small set of **tools** the model can call mid-reply to
record structured state — there is no separate "backend logic" deciding
stage progression, commitments, etc.; the model decides, and the tool
handlers in `lib/anthropic.ts` just persist what it decides.

No accounts. A random ID is generated into `localStorage`
(`the_return_user_id` — yes, still that key name, see "Deliberately not
changed" below) on first visit and is the only identity a person has.

## File map

- `app/page.tsx` — the entire UI. One component. Handles onboarding,
  language detection/switching, the mood picker + depth check, the
  transcript, the composer, branches, the settings panel (mirror card,
  artwork card, email opt-in), and the shape-family artwork rendering
  (`ShapeArt`, `RevealOverlay`).
- `system-prompt.md` — the actual system prompt, read fresh on cold start
  via `fs.readFileSync`. This is where almost all "product decisions" about
  tone, pacing, and behavior actually live. Edit this file, not code, for
  most behavioral changes.
- `lib/anthropic.ts` — builds the full system prompt (base file + live
  context: today's date, open commitment, depth choice, UI language,
  aliveness answer, current stage, current shape-family status), defines
  the tool schemas, and runs the tool-use loop (`runChat`). Also has
  `generateMirrorLine`, a separate one-off Claude call for the weekly
  mirror line.
- `lib/db.ts` — all Postgres access. `ensureSchema()` runs
  `CREATE TABLE IF NOT EXISTS` (and a couple of `ALTER TABLE` migrations)
  on cold start — there's no separate migration system.
- `app/api/chat/route.ts` — POST (send a message, get a reply) and GET
  (load a person's message history).
- `app/api/shape/route.ts` — GET a person's `{family, stage}` so the
  client can restore the artwork/ambient-color state on a fresh page load
  (needed because the tools that set these only fire once, not every turn).
- `app/api/mirror/route.ts` — GET the weekly mirror line, generating a new
  one if eligible (see `shouldGenerateMirrorLine`-equivalent logic inline).
- `app/api/stats/route.ts` — GET aggregate-only signals (return-visit
  count, commitment outcome breakdown). Optionally gated by `STATS_SECRET`.
- `app/api/cron/check-ins/route.ts` — hit daily by Vercel Cron
  (`vercel.json`) to email people whose commitment is due, if
  `RESEND_API_KEY` is set. Optional; the app works without it.
- `app/api/user/route.ts` — POST to save an email for the above.

## The tools the model can call

Defined in `lib/anthropic.ts`, described in full in their own
`description` fields (read those for the exact calling rules — this is
just a map):

1. **`record_commitment`** — pin one committed action + target date, once
   real clarity is reached.
2. **`resolve_open_commitment`** — resolve a previously open commitment as
   `landed` / `tried` / `not_landed` (three-way, not two — this was
   widened from an earlier two-value version; there's an idempotent
   `ALTER TABLE` in `lib/db.ts` handling the migration for existing rows).
3. **`signal_depth`** — advance the person's stage
   (mystery/safety/recognition/courage/return), gated by strict
   per-transition criteria in `system-prompt.md`, not a scripted ladder.
4. **`assign_shape_family`** — called at most once per person, ever, to
   invisibly match them to Tree/Flame/River/Constellation/Mountain for the
   personalized artwork. Inferred from how they express themselves, not
   from scripted symbolic questions.
5. **`offer_branches`** — occasionally offer 2-3 clickable next-step
   options at a real conversational fork. Free text is always still
   available; this is a rare addition, not the default.

## Spec vs. reality

The product spec (`docs/just-you-spec-v2.md`) was written before this real
codebase was known to exist in this working session — it describes an
aspirational build, some of which predates real, deliberate refinements
made during actual development. Where they conflict, **the live app's
existing behavior generally won**, on the reasoning that a shipped,
user-facing decision outweighs an earlier planning doc unless there's a
good reason to override it. Section numbers below refer to spec v2.

**Matches spec, or close to it:**
- §1–2, constitution — matches well: truth-first, no manipulation, no
  comparison-as-comfort, discovery before improvement.
- §3.1 direct register — implemented, though grounded in Robert Greene /
  Machiavelli / Sun Tzu / psychology rather than spec's exact
  Greene+Stoic+Kabbalah list. No Kabbalah material is used anywhere.
- §3.2 metaphor/layered mode — **implemented** (added this session).
  Auto-detected, no manual picker, uses spec's exact calibration example.
- §6 follow-up loop — implemented, and more robust than spec describes:
  real Postgres-backed commitments, tool-based, with an optional email
  nudge (`RESEND_API_KEY`) and a pull-model fallback when that's unset.
- §7 state-of-mind / processing-style detection — both auto-detected, no
  manual picker, matching spec's explicit "out of scope: manual pickers."
- §8 depth-ladder — **partially implemented, deliberately scoped down**.
  Added per-stage example questions as reference material for the *one*
  honest re-ask when someone stalls — but the live app's existing
  response to a *second* dodge (call it out directly, don't coddle) was
  kept as-is rather than replaced with spec's full progressive-fallback
  ladder. See "When someone stays on the surface" in `system-prompt.md`.
- §9 stage descriptions — **deliberately not implemented as spec
  describes.** The live onboarding copy explicitly promises users their
  stage stays hidden while they're in it ("naming it too soon turns a
  real process into a personality test"). That's a real, live promise to
  users and a better fit for the constitution's "never defines who
  someone is" than a persistent visible stage label would be. Kept as-is;
  the only stage-awareness signal is the one-time AI-spoken line the
  first time a stage is newly reached.
- §10 personalized artwork — **implemented** (added this session):
  `assign_shape_family` tool, real Postgres storage, the fragment→whole
  `ShapeArt` renderer, and the exact approved Return-stage reveal sequence
  in `RevealOverlay`. Matching is inferred by the model organically, not
  via spec's specific symbolic questions (there's no scripted onboarding
  question flow to fold them into). Artwork is **not** currently
  saveable/screenshot-able as a keepsake — spec's own open question on
  this was never resolved.
- §11 Trail — **not implemented as a real screen.** There's no dedicated
  view listing past committed actions/outcomes. The weekly mirror line is
  the closest thing to the "occasional reflective line" spec wants, but
  it's not backed by a visible history list.
- §12 visual language — **partially matches.** No chat bubbles as of this
  session (alignment + border + color distinguish speakers instead).
  Branches exist. Typography differs by role (serif for AI, sans for the
  person) but doesn't structurally distinguish truth/quote/ignition within
  one reply — replies are flowing prose, not the mockups' discrete typed
  blocks. No dedicated Threshold screen, no Home screen, no five-mark
  stage-track UI (ties back to §9's stage-hiding decision above). Palette
  is close in spirit (dark, warm, ember accent) but not spec's exact hex
  values. Sound-on-threshold/session-entry is not implemented.
- §13 multilingual — **launch languages far exceed spec's four**
  (22 languages currently, vs. spec's English/Italian/German/Greek). The
  three non-English "approved opening lines" spec names are now used
  verbatim (added this session). Every other language's opening line is a
  translated fallback of a *different* English question, not a
  "compose-fresh" line — spec's own scope call ("its own project") applies
  to all of them, not just the original four. The Greek line in
  particular carries spec's own flagged caveat: not native-verified.
- §14 out-of-scope items — respected: no engagement optimization, no
  comparison-as-comfort, diagnostic-only 48-Laws framing, no manual
  pickers, no upfront announcement of detected style/shape-family.

**Branding:** the project is "Just You" everywhere in the live app as of
this session (was "The Return" until tonight) — see the rebrand commit for
the full list of what changed and what was deliberately left alone.

## Deliberately not changed, and why

- **`localStorage` key names** (`the_return_user_id`, `the_return_onboarded`,
  `the_return_lang`) still carry the old brand prefix. Renaming them would
  silently orphan every existing person's data — the app would generate a
  fresh random ID under a new key instead of finding their real one. Leave
  these alone unless you have a real migration plan (e.g., read both the
  old and new key names, one time, and migrate).
- **`package.json`'s `name` field** is still `"the-return"`. Zero
  end-user visibility; not worth the lockfile churn to change.
- **Stage names** (Mystery/Safety/Recognition/Courage/Return) are
  unrelated to the brand and stay as-is under the "Just You" name — this
  matches the spec's own usage, which keeps "Return" as a stage name even
  in the doc that renames the *project* to "Just You."

## What's genuinely still open

- A real Trail screen (§11).
- Exact spec palette (cosmetic only).
- Artwork save/share as a keepsake (§10's own open question).
- Native-speaker verification for the Greek opening line, and for the
  non-Western-script languages' settings-text brand-name insertions from
  the rebrand (Hebrew, Arabic, Hindi, Chinese, Japanese, Armenian, and the
  Slavic languages) — these were best-effort substitutions, not verified.
- Nothing in this file has been checked against a **live** AI response —
  every change this session was verified by build/typecheck and, where a
  UI change was involved, a dev server with mocked API responses. The
  environment this was built in has no real `ANTHROPIC_API_KEY` or
  `DATABASE_URL`. Actually talking to the deployed app and reading real
  replies is the one thing that hasn't been done yet.
