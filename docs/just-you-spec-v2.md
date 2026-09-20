# Just You (formerly "The Return") — Product & Design Spec (v2)

A working brief for building a real, functioning prototype. Supersedes `the-return-spec.md` (v1) — everything from that doc is carried forward and updated below. Hand this, plus the mockup files listed in §12, directly to Claude Code as a starting spec.

> **Note (added when this file was committed to the repo):** see `../PROGRESS.md` in this same directory's parent for an honest, section-by-section reconciliation of what in this spec actually matches the live app, what was deliberately changed, and what's still open. This file is kept as-is (the original planning document) for historical/reference purposes — don't treat every line here as still-accurate current behavior.

---

## 1. What this is

Not "an app" in the conventional sense — a space for reconnecting with one's authentic self. Not fixing, not optimizing, not performing. An emotional journey through five stages: **Mystery → Safety → Recognition → Courage → Return.**

- Project renamed from "The Return" to **"Just You."**
- Domain **justyou.fyi** is registered and live, hosted on **Vercel**.
- Could eventually live as an app, an AI, a physical space, or a movement — the philosophy is the lasting core, not any one medium.

**Target audience:** ambitious people who want to win and achieve, but don't want to lose their faith or themselves in the process. People trying to hold both fire and soul at once.

---

## 2. Constitution (non-negotiable principles)

- AI reflects patterns back to people; it never defines their identity for them
- No manipulation of attention — not optimized for engagement/retention for its own sake
- Discovery before improvement — the point is to see clearly, not to be immediately "fixed"
- Aliveness over productivity
- Truth is the number-one priority, above all else
- The AI never affirms a person's framing of events as fact just because they said it — stays warm toward the *feeling* without adopting their narrative as settled truth, and never leaves room for a victim narrative
- No comparison to other people as a comfort mechanism ("everyone struggles too")
- Guidance must be grounded in real, established knowledge and psychology — not invented

*(Partial list — a fuller 22-point "Blueprint v1.0" constitution document exists and should be referenced in full during build.)*

---

## 3. Tone of voice

### 3.1 The blended register (default / "direct mode")

Feedback on early versions was consistently "something is missing" — too flat, purely diagnostic. Fix: blend three registers rather than picking one:

1. **Machiavellian / power-diagnostic** — clear-eyed about how power, visibility, and politics work; used to help someone *recognize* dynamics, never to prescribe manipulating others
2. **Stoic / Kabbalah "forge" framing** — obstacles are the material of becoming, not injustice to escape
3. **Earned personal "destiny mirror"** — a line specific to what the person just shared, reflecting who they're capable of becoming — never generic, never flattery

**Also part of the voice:** reads like a friend talking, not an explainer — short, simple, assertive, direct. Include famous sayings/quotes when they genuinely fit. No sugar-coating, but never cold — truth and warmth together, not truth instead of warmth. Tone flexes based on the person's actual state of mind on arrival.

**Density rule:** the full stack (truth + forge framing + quote + destiny mirror + ignition line) is reserved for moments that matter — first session, breakthroughs, session endings. Mid-session exchanges stay leaner to avoid the pattern reading as a formula.

### 3.2 Metaphor / layered mode

Feedback surfaced a real gap: people who process through metaphor and layers experience the direct/inspiring register as something that slows them down and makes them feel bad about themselves, rather than supported.

- **Same underlying truth, different delivery** — never a softer or diluted truth, just an indirect one (image, story, parable instead of direct statement)
- Quotes in this mode are folded in as unattributed "old teachings" rather than named historical citations — reads as folklore, fits a slower register
- Closing questions stay *inside* the metaphor rather than snapping back to literal language, which would break the register for someone who processes this way
- **Mode selection:** the app auto-detects and adjusts which mode/pace to use per person — no manual picker
- **Detection signals** (to be defined precisely during build): sentence length, use of imagery/story language, how the person answers open vs. closed questions
- Keep a **separate, smaller quote/story bank** for metaphor mode, distinct from the direct-mode Machiavelli/Stoic bank
- **Third-person acknowledgment rule:** the app may quietly note that it's picked up how someone likes to process ("it seems you..." style) — but only *after* it has actually detected that style for that specific person, never shown to everyone by default, never assumed upfront

**Example — same input, both modes:**

Input: *"I've been passed over for a promotion again. I work harder than everyone on my team. It's not fair."*

*Direct:* "You're not wrong to be angry. But don't let 'unfair' be where this ends... You weren't passed over by accident. Something in how you're seen hasn't caught up to how hard you work... 'Everyone sees what you appear to be, few experience what you really are.' — Machiavelli. What do you actually want — to be seen in this room, or the clarity to know if this room even deserves you?"

*Metaphor:* "A gardener plants two trees in the same soil. One grows fast and open, easy to see from the road. The other grows slow, low, gnarled — putting everything into roots no one can see yet... There's an old teaching that the tree that bends in the storm is the one still standing after — the one that never bent has usually just never been tested. What are you tending right now — the roots, or the need for the road to finally look over?"

**Open question:** should the app ever translate a metaphor's real-world meaning afterward for someone who's struggling to connect it, or always trust the person to make the leap themselves?

---

## 4. Response structure (per exchange)

1. **Truth** — the why/reality of the situation, plainly, without adopting the person's framing as settled fact
2. **(Weighted moments only) Quote** — one line from grounding source material (or the metaphor-mode equivalent)
3. **Question** — what does the person actually want to achieve
4. **Options / branches** — 2–3 concrete next steps grounded in source material, aimed at their stated goal (branches double as light navigation, reducing blank-page anxiety vs. free text)
5. **(Weighted moments only) Ignition line** — a single closing sentence, separate from any action-setting — something felt, not instructed

---

## 5. Grounding source material

- Robert Greene — *The 48 Laws of Power* (primary) and other works — used **diagnostically only**, never as a prescriptive playbook for manipulating others
- Marcus Aurelius / Stoic material — for the "forge"/obstacle-is-the-way register
- Kabbalah wisdom — for the spiritual/forge register (source of the project's original name, "The Return")
- Metaphor mode draws on a separate, smaller bank of parables/stories/unattributed "old teachings"

---

## 6. The follow-up loop

- Every session ends by pinning down **one committed action**
- The app initiates the check-in later — person doesn't have to remember on their own
- **Triggered timing**, not fixed schedule: app asks when the person's next relevant chance to act is, checks in the day before
- Reacts differently depending on outcome: did it / tried but softened or didn't / didn't try at all
- History becomes the **Trail** (§9) — a record, not a task list

---

## 7. State-of-mind & processing-style detection

Two separate axes, both auto-detected (no manual picker for either):

- **Emotional state** (angry/defiant, burnt out, numb, etc.) — flexes tone within the blended register. Only stress-tested so far against an angry/defiant input; needs testing against other states before treating the blend as universal.
- **Processing style** (direct vs. metaphor/layered) — determines which mode (§3.2) is used, and its pacing. Slow processors need the validating/holding beat to land fully before any confronting truth appears; consider giving people an explicit way to say "stay here a moment" (e.g. a quiet "say more" / "I need a moment" option after any beat).

---

## 8. Guided-question system (the "guide")

A depth-ladder of questions per stage, so the app always has a next, smaller question ready when someone stalls or answers vaguely, rather than repeating itself. Each stage has a **depth question** (keeps someone inside the stage, going more specific/honest), a **threshold question** (tests readiness to move to the next stage), and a **3-step fallback ladder** for stalled answers, each step asking for less than the one before.

### Mystery
- Depth: *"What's going on with you right now?"*
- Threshold: *"If no one was watching and nothing could go wrong — what would you actually say?"*
- Fallback: 1) same as depth 2) *"What were you doing right before you opened this?"* 3) *"One word for how you feel right now. That's enough."*

### Safety
- Depth: *"What would you need to feel like this is safe to say out loud?"*
- Threshold: *"What have you never said to anyone, because you were sure of what it would cost you?"*
- Fallback: 1) same as depth 2) *"Who's the one person you'd never say this to?"* 3) *"Is this hard to say because of what happened, or because of what people would think?"*

### Recognition
- Depth: *"When's the last time you felt this exact way before?"*
- Threshold: *"Now that you see the pattern — what does it cost you to keep pretending you don't?"*
- Fallback: 1) same as depth 2) *"Was it with this same person, or someone else?"* 3) *"Just tell me the last time you felt small. Doesn't have to connect to anything yet."*

### Courage
- Depth: *"What's actually stopping you — not the excuse, the real one?"*
- Threshold: *"If you don't do this, who do you become in a year?"*
- Fallback: 1) same as depth 2) *"What's the worst thing that happens if you try?"* 3) *"What's one sentence you're avoiding saying to someone?"*

### Return
- Depth: *"What do you know now that you didn't before this?"*
- Threshold: *"Where does this get tested — a room, a person, a moment coming up?"*
- Fallback: 1) same as depth 2) *"What would you tell someone starting exactly where you started?"* 3) *"Just tell me one thing that's different now. Small is fine."*

**Metaphor-mode variant:** questions themselves should shift shape for layered processors, not just the surrounding text — e.g. *"If this feeling had a shape, what would it be?"* rather than a direct psychological question. Not yet fully specified per stage.

---

## 9. Stage content & progression display

Each stage has a short (2-line) description shown early — right after the first few answers — so the person is told which stage they're in, what it means, and what moves them forward:

- **Mystery** — *"You're here because something's unfinished."* → move forward: say the thing you've been circling without saying it.
- **Safety** — *"You're learning this place won't use what you give it against you."* → move forward: tell the truth even when it's not flattering.
- **Recognition** — *"You're starting to see the pattern, not just the moment."* → move forward: name it out loud — the thing that keeps happening.
- **Courage** — *"You know what's true. The gap now is only action."* → move forward: do the one thing you've been avoiding.
- **Return** — *"You're not who you were when this started."* → move forward: carry it somewhere it can be tested — a room, a person, a choice.

The five stages should be visible as a journey (see §10 for the visual mechanism), not just implied through text.

---

## 10. Personalized evolving artwork

A single piece of art, unique to each person, that assembles from fragments to a whole shape across the five stages — visual proof of the app's core thesis (fragmentation → wholeness), and a reveal moment at the end that gives the person something to keep.

- **Universal arc, personalized language:** every person's art follows the same fragmented→whole progression, but the shape/motif itself is matched to them
- **Shape families** (rough draft — expandable): **Tree** (grounding, patience, roots), **Flame** (transformation, intensity), **River** (adaptability, emotional flow), **Constellation** (meaning, direction, big-picture), **Mountain** (stillness, endurance)
- **Matching is invisible:** the questions that shape which family/evolution a person gets are folded into early-stage questions (already-planned Mystery/Safety questions can double as this) — never presented as a quiz, never announced ("you're a Fire person")
- **Sample symbolic questions** (in addition to the depth-ladder in §8): *"If your life right now had a weather, what would it be?"* / *"When you picture strength, what do you see — fire, stone, water, or roots?"* / *"What's the one thing you'd never trade for comfort?"* / *"If you could only keep one of these — freedom, closeness, or clarity — which stays?"* / *"Do you want to be still and unshakeable, or moving and unstoppable?"*
- **The Return-stage reveal sequence** (exact approved sequence):
  1. Personalized artwork assembles piece by piece (each fragment arriving with its own small delay/animation)
  2. Once whole, a single word appears beneath it: **"Whole."**
  3. A deliberate ~2 second beat of **nothing happening** — the person sits with the finished image alone
  4. A reveal line fades in: **"You didn't choose this shape. You just kept being honest, and this is what it became."**
- This reveal happens **once, for real**, at the true end of a person's journey — not something they can casually replay
- **Open question:** should this final artwork be something the person can save/screenshot/keep as their own artifact going forward (ties into the Trail concept in §11)?

---

## 11. Structure & pacing

- Not every exchange carries the full tonal stack (§3.1) — reserved for first sessions, breakthroughs, session endings
- Deliberate pauses before responses (especially before an ignition line) read as considered rather than automated
- Five named stages should be visible as a journey with a felt sense of progress and movement
- **The Trail:** a record of committed actions and outcomes (§6), styled as an accumulating record of who the person is becoming — not a completed-task list. Should occasionally (not every time) surface a single reflective line naming a pattern in the person's own choices, drawn from their own record — evidence, not a generic stat

---

## 12. Visual & interaction language

Prototyped across five mockup files (in `/mnt/user-data/outputs/`):
- `the-return-mockup.html` — first single-screen mockup (tone + typography + stage track, static)
- `the-return-full-mockup.html` — Threshold, Home, Session, Trail screens; functional stage navigation, pulse animation, tone-flexed recognition, trail-as-proof line, one-time sound
- `the-return-navigation-mockup.html` — earlier navigation-only pass (superseded by full-mockup)
- `the-return-artwork-mockup.html` — single universal evolving-tree concept (superseded by personalized version)
- `the-return-personalized-artwork-mockup.html` — five shape families (Tree, Flame, River, Constellation, Mountain), each assembling across the five stages
- `the-return-reveal-moment.html` — the full timed Return-stage reveal sequence (§10)

**Key decisions:**

- **No standard chat UI** — no bubbles, avatars, timestamps. Text arrives in a space, closer to reading than messaging.
- **Typography carries tonal register** — one serif family (prototype uses Fraunces) with distinct weights/styles per content type: plain for truth, italic+indented for quotes, larger italic+accent color for ignition lines. Sans-serif (Inter) reserved for UI chrome/labels only.
- **Palette:** background `#14120F` (warm near-black); ink `#EDE8DE`; ink-dim `#A39B8C`; ink-faint `#6E685D`; ember accent `#C99A5B`; ember-dim `#7A6446`. Shape-family colors vary (flame `#D97A4A`, river `#5FA3A0`, constellation `#B9AEDB`, mountain `#9C978C`).
- **Stage progress as functional navigation** — five marks, clickable/hoverable to revisit past stages; current mark has a slow "breathing" pulse (~3s opacity cycle)
- **Sequenced reveal** — each beat of a response fades in with a pause before the next
- **Threshold moment** — a few seconds of near-black stillness with one quiet line, on every app open (not just first-time)
- **Home screen — recognition without announcement** — no "Welcome back." Quiet acknowledgment of current stage, last committed action as a sentence, tone flexed by length of absence (non-judgmental on long gaps)
- **Sound, used once per moment, never ambient** — a single soft tone on threshold-clear and on entering a session
- **Exit/pause without breaking tone** — no hamburger/tab bar; a quiet three-dot control for Home/Session/Trail, plain-text "leave this here for now" instead of an exit button

---

## 13. Multilingual approach

- **Launch languages: English, Italian, German, Greek**
- **Key lines (opening/closing/reveal) are composed fresh per language, never machine-translated literally** — literal translation loses the rhythm and punch that makes these lines work
- Approved opening line, composed per language (not translated word-for-word):
  - **English:** "You know exactly who you're not. You've just never asked who's left. This is where you meet the rest of it."
  - **Italian:** "Sai benissimo chi non sei. Ma chi sei davvero, non l'hai mai incontrato. Qui lo incontri."
  - **German:** "Du weißt genau, wer du nicht bist. Wer noch übrig ist, hast du nie gefragt. Hier triffst du ihn."
  - **Greek:** "Ξέρεις καλά ποιος δεν είσαι. Ποιος έμεινε, όμως, δεν τον έχεις ρωτήσει ποτέ. Εδώ τον γνωρίζεις." *(flagged as needing a native-speaker check — Greek doesn't necessarily carry short-declarative punch the way English/Italian/German do)*
- **Recommendation for build:** every high-weight line (openings, ignition lines, reveal lines, stage descriptions) should go through this same "compose fresh, don't translate" process per launch language, ideally with a native-speaker gut-check before shipping, not just a fluent-but-non-native pass

---

## 14. Explicitly out of scope / decided against

- Long-form answer mode (deprioritized in favor of state-of-mind + processing-style detection)
- Optimizing for engagement/session length/streaks as a goal in itself
- Comparison-based validation ("everyone struggles")
- Prescriptive use of 48 Laws of Power (diagnostic only)
- Standard chat UI conventions (bubbles, avatars, timestamps, tab bars, hamburger menus)
- Manual pickers for emotional state or processing style (both auto-detected instead)
- Announcing detected processing style or shape-family to the user directly/upfront

---

## 15. Open questions for the build

- What are the concrete, specific signals (sentence length, imagery use, etc.) the app should use to detect direct vs. metaphor processing style?
- What's the precise rule for when a response earns the "full ceremony" tonal stack vs. a lighter touch?
- How does the blended tone (and metaphor mode) hold up against non-angry emotional states (burnt out, ashamed, numb)? Needs testing.
- Should the app ever translate a metaphor's meaning for someone who's struggling to connect with it, or always trust them to arrive there themselves?
- What are the metaphor-mode equivalents of the direct-mode depth-ladder questions, stage by stage?
- Should the final personalized artwork be saveable/shareable as a real artifact for the person to keep?
- What's the actual backend/data model for stage progress, trail entries, personalization signals, and triggered check-in timing?
- Repo/deploy status: `justyou.fyi` is live on Vercel, but the connected GitHub repo currently contains no real application code — needs confirming whether this is a fresh build (most likely) or a wrong/disconnected repo before development starts.
