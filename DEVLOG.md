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

**Counter colour.** Counter cells (the 21-day strip and the full grid) are tinted on
a **clay → paper → sage** diverging gradient by that day's **trailing 7-day
average**, normalised to the habit's own min/max over the visible window: the worst
week reads red, the best reads green. For a `−` habit that means clean weeks trend
green and heavy-slip weeks go clay. Tinting starts from the earlier of the habit's
creation or its first logged day, so backfilled/imported history is coloured too.

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
- **Conflict resolution:** pull **unions** habits and their `days` maps (plus `seen`
  and `paused`) rather than replacing — no logged day is ever lost across devices —
  then pushes the merged superset. Converges (the union is idempotent). One accepted
  quirk: a habit deleted on one device can reappear from another's copy; just delete
  it again.

**Offline.** A minimal service worker (`sw.js`) serves the app shell **cache-first**,
so a cold launch with no network still opens. *When `index.html` changes you must
bump `VERSION` in `sw.js`* — that byte change is the only signal that makes a device
install the new shell. Currently at `bloupunt-v4`.

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

---

## Still to do / open items

- **Keep this log current.** Every shell change also bumps `sw.js VERSION` — note it
  in the entry.
- **True multi-device sync**, if the union-merge ever proves insufficient. The
  correct architecture is a tiny backend holding the token server-side (a Cloudflare
  Worker + KV, ~30 lines, free at this volume). Do **not** try to hide the token in
  the browser "more cleverly."
- **Counter backfill in both directions.** Tapping a past cell applies the habit's
  primary direction only (+1, or −1 for a `−` habit). Subtracting on a past day for a
  `+/−` habit is not yet possible from the grid.
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
