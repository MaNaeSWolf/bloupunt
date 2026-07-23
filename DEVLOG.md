# Bloupunt — Dev Log

A habit tracker. Single-file HTML PWA, hosted free on GitHub Pages, installable on
an Android home screen, with optional encrypted backup to a private GitHub repo.

**Live:** https://manaeswolf.github.io/bloupunt/
**Name:** *Bloupunt* — the summit of the Cogmans Kloof trail race. Reached by
accumulating steps, not by any single one. That is the whole idea.

This document is the running log of how the app was built and why. Newest work is
at the bottom. If you are picking this up cold, read **The idea** and **How it
works** first, then skim the dated entries for the reasoning behind each decision.

---

## The idea

Bloupunt is built on the mechanics from James Clear's *Atomic Habits* — the parts
that actually drive adherence, not the ones that make a good feature list. The app
is a deliberately small surface wrapped around those mechanics:

- **Make it obvious.** Every habit carries an *implementation intention* — a
  specific **cue** ("At 9pm, in the bedroom"). You can also anchor it to an
  existing routine with **habit stacking** ("straight after putting the kettle
  on"). All habits live on one screen; nothing is hidden behind a tab.
- **Make it attractive.** The reward is earned and scales. Marking everything for
  the day gives a quiet 1.4s green "breath." Confetti only starts at a 7-day streak
  and escalates to a ~9-second gold event at a year. The background itself slowly
  warms from paper-white toward green as the streak grows. Do not praise arriving.
- **Make it easy.** One tap to log. No navigation, no modal, no drill-down. Every
  habit also has a **floor** — the 2-minute version ("read one page") — which the
  app surfaces the moment you are about to miss twice.
- **Make it satisfying.** The chain. A streak's colour intensifies from day 3, so a
  lone tick stays faint and the reward is for the *run*, not the tap. **Never miss
  twice**: one missed day turns a row amber (quiet — one miss is noise); two turns
  it clay with the floor offered inline (two misses is the start of a new, bad
  habit).
- **Identity, not counters.** Clear's best idea is that each rep is a vote for the
  person you want to become. The chain already *is* that evidence, so it is shown
  as a chain — not reduced to an "identity votes: 12" gimmick.

My own framing on top of Clear: **recording is itself the habit.** Showing up to
log — even to log that you did badly — is the behaviour worth reinforcing. This is
why the streak counts *any* record for a day, and why counters (below) build
streaks the same way a tick does. The thing you are avoiding is not the missed
*habit*; it is the missed *log*, after which the whole record goes stale and dies.

**Deliberately not doing** (each undermines the above): reminders/notifications
(the cue field is the reminder; a push trains you to obey the phone, not the cue),
identity-vote counters, temptation bundling / environment design (those happen in
the kitchen and the gym bag, not in an app). *Streak freezes* were on this list too
— until the Pause feature (see 2026-07-11 12:38), which is the one guarded
exception.

---

## How it works (architecture)

**One file.** `index.html` is HTML + CSS + vanilla JS. No build step, no framework,
no dependencies. Fonts are inlined as base64. The only network calls the app ever
makes are to the GitHub API, and only if you turn sync on. It will open from a
`file://` URL in ten years and still work. That property is worth more than tidiness
— do not add a build step without a concrete reason.

**Render model.** Full `innerHTML` re-render on every state change. Fine at this
scale (≤ a handful of habits, ~130 nodes). The one hazard is losing in-progress
input text on re-render — handled by `grab()`, which reads live input values into
the form object before any re-render. *Any new input field must be added to
`grab()` or its text will vanish mid-typing.*

**Data model** — `localStorage["bloupunt-data"]`:

```
{
  "habits": [
    {
      "id": 1752192000000,     // Date.now() at creation. Stable primary key.
      "name": "Read",
      "type": "toggle",        // toggle | plus | minus | plusminus
      "cue": "At 9pm, in the bedroom",
      "stack": "Putting the kettle on",   // optional habit-stack anchor
      "minimum": "One page",              // the floor (2-minute version)
      "days": { "2026-07-11": 1 }         // dateKey -> value
    }
  ],
  "seen":   { "streak:1752192000000:7": true },  // milestones already fired
  "paused": { "2026-07-12": 1 },                 // excused days (see Pause)
  "updatedAt": 1752192345678                     // ms epoch, for sync
}
```

- **Date keys are local-midnight strings**, never `toISOString()` (that is UTC and
  silently shifts days for anyone not on UTC). Use the `keyFor()` helper.
- **`days` values by type:** `toggle` stores `1` (presence == done, key deleted when
  un-ticked). Counters store a running integer that can be **0 or negative**.
- **"Logged" == the key exists** (`has(days, k)`), not "the value is truthy." A
  net-zero counter day still counts, because the goal is to log.
- `seen` prevents a milestone firing twice. Never clear it.

**Habit types:**

| type | buttons | value | example |
|------|---------|-------|---------|
| `toggle` | one tick | `1` when done | Read |
| `plus` | `+` | count up (≥1) | glasses of water |
| `minus` | `−` | count down (≤ −1) | slips you want to avoid |
| `plusminus` | `−  n  +` | running net total | resist Reddit (+ win / − slip) |

**Stats** (`statsFor`, `perfectStreak`, `currentTier`):

- `streak` — consecutive **logged** days ending today. Today is *grace*: an unmarked
  today does not break the streak until tomorrow. Paused days *bridge* (neither
  break nor extend).
- `missed` — consecutive unlogged, **non-paused** days ending yesterday. Drives the
  amber (1) / clay (≥2) row states.
- `best` — longest run ever; bridges a gap only if every day in it was paused.
- `last30` — logged days in the trailing 30.
- `perfectStreak` — consecutive days on which **every** habit (any type) was logged.
  Weighs one tier heavier than a single-habit streak. Pauses bridge.
- `currentTier` — `max(perfectStreak, all habit streaks)` → bucket → the `--bg` /
  `--tint` background warmth and the status-bar `theme-color`.

**Day colours.** Every cell falls into exactly one of four states:

| state | colour | meaning |
|-------|--------|---------|
| logged (toggle) | sage, deepening on day 3+ of a run | the chain |
| logged (counter) | clay → paper → sage gradient | trailing 7-day average, normalised to the habit's own min/max — worst week red, best week green |
| **missed** | darker grey `#C8C2B8` | habit was running, day is past, unlogged, not paused |
| untouched | paper `#EDE9E2` | before the habit existed, paused, or today (still in grace) |

Only **logged** days get a gradient tone — that is what keeps a mid-range average
from looking identical to an unmarked day. `habitStart()` is the earlier of the
habit's creation and its first logged day, so backfilled/imported history counts as
"it existed then." `avg7()` **skips paused days entirely** rather than counting them
as zeros, so a break never drags the average down.

**Editing days.** The multi-month grid is **view-only**. Editing happens only via the
day-edit chip, opened by tapping a cell in the 21-day strip — so backfill is capped
at the visible ~3 weeks and is always deliberate and undoable. Today's tick and the
row `+/−` remain one-tap. A habit's whole history can be wiped from its editor
("Clear all logged days", confirm-guarded).

**Milestones** (`checkMilestones`). Per-habit `STREAK_MARKS` (7d…365d) and
all-habit `PERFECT_MARKS` (7d…90d), including counters. Fire on `streak === mark.d`
(exact equality) **and** not already in `seen{}` — belt-and-braces, so backfilling
past a threshold still fires it exactly once. Highest-weight hit is shown; all are
marked seen. Weight → confetti count `[26,55,90,140]` and escalating copy.

**Sync** (optional) — `localStorage["bloupunt-sync"] = {owner, repo, token, pass}`.

- A browser app cannot hide a secret; whatever authenticates ships to the device.
  So the blast radius is **bounded**, not the exposure eliminated: the token is a
  **fine-grained PAT scoped to one private data repo** (`Contents: read+write`,
  nothing else), entered by hand per device, living only in `localStorage`. Worst
  case if it leaks: someone corrupts a habit log. Not the account, not other repos.
- The payload is **AES-GCM** encrypted (PBKDF2, 150k iterations, random salt+IV per
  write). GitHub — and anyone who gets the file — sees ciphertext. `updatedAt` sits
  *outside* the ciphertext so a client can skip a pull without decrypting.
- **The passphrase is not recoverable.** That is the point of AES-GCM, not a bug.
- Sync is **non-blocking and never gates logging.** `localStorage` is the source of
  truth; the repo is a backup. Works fully offline, on a plane, with no token set.
- **Push cadence:** debounced 1500 ms after a change, **plus a flush** on
  `visibilitychange`→hidden / `pagehide` using `keepalive` and a cached `sha`, so a
  change survives the tab being closed straight after. Pull on focus / visible /
  `pageshow`, throttled to once per 4 s.
- **Conflict resolution:** pull **unions** habits and their `days` maps (plus `seen`
  and `paused`) rather than replacing — no logged day is ever lost across devices —
  then pushes the merged superset. Converges (the union is idempotent). One accepted
  quirk: a habit deleted on one device can reappear from another's copy; just delete
  it again.

**Offline.** A minimal service worker (`sw.js`) serves the app shell **cache-first**,
so a cold launch with no network still opens. *When `index.html` changes you must
bump `VERSION` in `sw.js`* — that byte change is the only signal that makes a device
install the new shell. Currently at `bloupunt-v7`.

**Deployment.** Two repos, and the separation *is* the security model — do not
collapse them:

- **`bloupunt` (public)** — serves `index.html` via Pages. Nothing sensitive.
- **`bloupunt-data` (private)** — holds only the encrypted `bloupunt.json`, written
  by the app; created empty and seeded on first sync.

---

## Log

### 2026-07-11 08:40 — Initial build (v1)
Shipped the single-file PWA: three-habit constraint, one-tap logging, backfill on
any past day, streak-intensifying colour, never-miss-twice escalation, earned/scaled
rewards, warming background, the cue/stack/floor fields, the encrypted GitHub sync
model, and the full-year contribution grid. Created the two repos on the
`MaNaeSWolf` account; `bloupunt-data` created **empty** so the first device seeds it.
Known gap at ship: no service worker (cold offline launch would fail), fonts pulled
from Google, sync is last-write-wins.

### 2026-07-11 09:05 — Offline cold launch (service worker)
Added `sw.js` (~40 lines): cache-first on the app shell so a fully-closed app
reopens with no network. GitHub API calls are explicitly never cached, so sync
always hits the live network. Fonts are cached opportunistically. Established the
**bump-`VERSION`-on-every-shell-change** rule (→ `v1`). *This was the only real gap
in v1.*

### 2026-07-11 09:35 — Self-contained + resilient sync
Four things in one pass:
- **Self-hosted fonts.** Inlined Fraunces + Inter as base64 woff2 (latin subset,
  variable — two files cover all weights). Removed the last external request; the
  app is now fully self-contained (~193 KB). `theme-color`/privacy win.
- **Merge on pull.** `pullRemote` now **unions** habits + `days` maps instead of
  last-write-wins replace, then pushes the merged superset. Removes the only
  data-loss path now that a phone *and* a desktop are both in use.
- **Token-expiry detection.** A `401` now surfaces "token expired or invalid —
  update it under Manage sync" instead of a generic failure.
- **Import.** "Import a copy" reads a `bloupunt-*.json` back in, merging
  non-destructively (can only *add* logged days). Export already existed.
→ `sw.js v2`.

### 2026-07-11 12:21 — Micro-habit counters (first pass)
Added a habit **type** chosen in the editor: `toggle` / `+` / `−` / `+/−`. Counters
log a per-day integer via +/− controls (a net-zero day still counts as logged). Each
counter cell is tinted by its trailing 7-day average on a clay→paper→sage gradient.
**Design call at the time:** counters were kept *out* of the streak-chain — trackers
only, no milestones, no perfect-day contribution — to avoid an awkward "streak of
Reddit slips." Fixed a bug where the gradient ignored backfilled days before the
habit's creation timestamp. → `sw.js v3`.

### 2026-07-11 12:38 — Counters join the streak + Pause *(reversed the above)*
On feedback: **recording is showing up.** A streak should reward logging even when
the logged thing is bad — so counters are now full chain participants. Any recorded
day counts as "logged," so counters build recording streaks, earn milestones, and
count toward perfect days and the warming background. Switched all stats from
truthiness to record-existence (`has()`), which cleanly handles net-zero/negative
counter days.

Added **Pause** — a button beside Manage. Choose 1–7 days; the pause starts
**tomorrow** (today can never be paused, so a break is always deliberate). Excused
days neither break nor extend a streak — they *bridge* a gap. Paused days are marked
in the strip/grid; an upcoming pause shows a banner with **Resume now** (which clears
only future pauses). Stored in `data.paused`; synced, merged and exported like the
rest. This is the one deliberate exception to the "no streak freezes" rule — allowed
because it is guarded (future-only, intentional). → `sw.js v4`.

### 2026-07-11 12:45 — This dev log
Rewrote the old `IMPLEMENTATION.txt` (which had gone stale — it still claimed
`days` values are always `1` and listed streak freezes under "not doing") into this
dated dev log.

### 2026-07-11 13:04 — Bug: accidental edits with no undo
**Reported:** "I accidentally pressed on the multi-month view and have 3 months of
dates marked off by mistake with no way to undo."
**Cause:** every cell in the multi-month grid was directly editable, so a stray tap
changed a day instantly and irreversibly.
**Fixes:**
- The multi-month grid is now **view-only** — a read-only history heatmap.
- Tapping a day in the 21-day strip opens a **day-edit chip** instead of changing it
  instantly: *Mark done / tap to clear* for toggles, `−  value  +  Clear` for
  counters (the chip offers both directions regardless of habit type, so a `+`-only
  habit's mis-tap is still fixable). The selected cell is ringed; `×` closes.
- Today's tick and the row `+/−` stay one-tap — the fast path is untouched.
- Editor gains a confirm-guarded **"Clear all logged days"** (shows the count) as the
  escape hatch for an accidental backfill that is now out of the strip's reach.
This narrows backfill to the visible ~3 weeks, which is the intended range anyway.
→ `sw.js v5`.

### 2026-07-11 15:36 — Bug: PC changes never reached the phone
**Reported:** "Open it on my PC, set some things up, close it. Open on my phone and
it does not update."
**Cause:** not the pull — that already unions whatever is on the server. The **push**
was debounced 1500 ms with **no flush on close**, so closing the tab before it fired
silently dropped the upload. It never reached GitHub, so there was nothing to pull.
**Fixes:**
- Track `pendingPush`; on `visibilitychange`→hidden and `pagehide`, flush it
  immediately instead of waiting out the debounce.
- The flush uses `fetch(..., {keepalive:true})` so the request survives page unload
  (a normal fetch is cancelled), and a cached file `sha` so it needs no prior GET.
- Also pull on `pageshow` (bfcache restore).
→ `sw.js v6`.

### 2026-07-23 07:19 — Reordering, and honest day colours
Three items in one pass:
- **Reorder habits.** Manage cards gain ↑/↓ buttons (ends disabled). Order is just
  the array order, which the sync union already preserves. Touch-friendly and needs
  no drag library — deliberate, given the no-dependency rule.
- **Missed days now read as missed.** Previously an unlogged day and a mid-range
  counter average were both near-paper, so gaps were invisible. Now **only logged
  days get the gradient**; an unlogged day is a distinct darker grey (`#C8C2B8`)
  *only if the habit was actually running that day*. Days before the habit started,
  paused days, and today (still in grace) stay the neutral untouched tone. Applies to
  toggle habits too, so a gap in the chain is legible everywhere.
- **Pause is now fully honoured by counters.** Paused days no longer get a gradient
  tone, and they are skipped entirely when computing the trailing 7-day average
  (rather than counted as zeros), so a break can't drag the average down.
→ `sw.js v7`.

---

## Still to do / open items

- **Keep this log current.** Every shell change also bumps `sw.js VERSION` — note it
  in the entry.
- **True multi-device sync**, if the union-merge ever proves insufficient. The
  correct architecture is a tiny backend holding the token server-side (a Cloudflare
  Worker + KV, ~30 lines, free at this volume). Do **not** try to hide the token in
  the browser "more cleverly."
- ~~Counter backfill in both directions.~~ **Done 2026-07-11** — the day-edit chip
  offers `−` and `+` regardless of habit type.
- **Backfill is capped at ~3 weeks** (the strip window) by design. Anything older is
  view-only; the only way to change it is the editor's "Clear all logged days".
  Revisit only if a genuine need to edit older history appears.
- **Optional daily goal for `+` habits.** Considered and deferred — the current rule
  is "logging anything counts." Revisit if a target-based streak is ever wanted.
- **Per-cell pause editing.** Pause is set forward-only via the chooser; there is no
  way to mark a specific past day paused after the fact.

## Things that will bite you

- `toISOString()` for date keys — UTC, silently shifts days. Use `keyFor()`.
- Adding an input without adding it to `grab()` — text vanishes on re-render.
- Removing the today-grace from `streak()` — every morning reads "0 days."
- Treating a counter's `0` as "not logged." Use `has()` (key existence), not
  truthiness. A net-zero day is a logged day.
- Changing `index.html` without bumping `sw.js VERSION` — devices keep serving the
  old cached shell.
- Collapsing the two repos. The public repo is public; the token is scoped to the
  private one. That separation *is* the security model.
- Making sync blocking. It must never gate the tap-to-log path.
- Adding a 4th, 5th, 6th *toggle* habit slot because it's easy. The constraint is the
  feature. (Counters are exempt from the cap — they are lightweight and additive.)
