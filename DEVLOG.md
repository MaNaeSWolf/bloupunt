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
| logged (toggle) | solid sage `#7A9A7E` | done — two-state, no intensity ramp |
| logged (counter) | clay → paper → sage gradient | trailing 7-day average, normalised to the habit's own min/max — worst week red, best week green |
| **missed** (counters only) | darker grey `#C8C2B8` | habit was running, day is past, unlogged, not paused |
| untouched | paper `#EDE9E2` | not done (toggle), or before the habit existed / paused / today (grace) |

Every **marked** (logged) cell also carries a 1px inset ring
(`rgba(61,59,55,.34)`), so a logged day reads as logged even when its gradient fill
sits near the neutral tone. `today` / editing (`sel`) rings take precedence over it.

Toggle habits are deliberately **two-state** (green / neutral) — the old day-3
intensity ramp and the missed-grey were dropped there; the chain's row states already
signal misses, and the grey/gradient only earn their keep on counters. Only **logged**
counter days get a gradient tone — that is what keeps a mid-range average from looking
identical to an unmarked day. `habitStart()` is the earlier of the habit's creation
and its first logged day, so backfilled/imported history counts as "it existed then."
`avg7()` **skips paused days entirely** rather than counting them as zeros, so a break
never drags the average down.

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

### 2026-07-29 18:56 — Legibility: solid green toggles + a marked-day ring
- **Toggle habits are now two-state:** solid sage when done, neutral otherwise. The
  day-3 intensity ramp (and the missed-grey on toggles) read as a confusing "gradient
  over the week." Reverses the original *Atomic Habits* "streak colour intensifies"
  idea for toggles — the row states still carry the never-miss-twice signal. Grey and
  the gradient now live only on counters.
- **Every logged cell gets a 1px darker inset ring** (`rgba(61,59,55,.34)`). The
  mid-range counter gradient values sit close to the neutral background; the ring
  makes a marked day legible regardless of fill. `today` and `sel` rings win over it.
→ `sw.js v8`.

### 2026-07-31 08:00 — EXPERIMENT: chain view + 5-band colour
Tagged **`checkpoint-v8`** first (revert with `git reset --hard checkpoint-v8`).
Two experimental changes to try on-device:
- **Chain view.** The 21-day strip is no longer separate bars — each day is a dot,
  and consecutive completed days are joined by a neck so a run reads as one linked
  shape while individual days stay visible as bumps. A missed day breaks the link and
  leaves a small dead dot; a paused day is bridged (the neck passes over it). Pure
  CSS/positioning, no SVG filter — responsive and no dependency.
- **Five colour steps** (was a continuous gradient). Counter days now fall into one of
  5 bands — deep-red, red, neutral, green, deep-green — scored against the habit's
  average value in 20%-of-average steps, "higher is better" so avoidance counters
  colour correctly too. Reference `bandColour(v, A)` / `counterAvg()`. The old
  `avg7`-gradient (`diverge`/`lerpHex`/`CTR_*`) is now dead code, kept for an easy
  revert. Toggle habits are unaffected (still solid green / neutral).
→ `sw.js v9`. **Status: on trial** — may be reverted to `checkpoint-v8`.

### 2026-07-31 08:18 — Ribbon chain + rolling average + softer bands
Feedback on the v9 trial: the dot-and-neck chain looked messy; the bands read as
just 2 reds + 2 greens; the average should be recent, not all-time.
- **Chain → ribbon.** A run of completed days is now one solid rounded bar over a
  faint track, with light per-day dividers; a miss is a gap, a paused day is a
  bridged lighter segment. Reads calmer and more positive than the beaded dots.
  (Two alternatives — clean linked-dots, and a continuous progress-track — were
  mocked up for the user to choose from; ribbon is the default.)
- **Rolling average.** `counterAvg()` now averages only LOGGED days over the trailing
  **21 days** (missed days skipped, not counted as zero). New habits settle fast; a
  three-week window then keeps the reference stable without ancient history dragging.
- **Softer bands.** Palette is now bold-ends / soft-middles
  (`#B06A4F #DDB4A4 #EDE9E2 #AFC7B2 #5E8163`) so the five steps read as five.
→ `sw.js v10`. **Status: kept** — ribbon and the softened bands were accepted; the
continuous-gradient code (`diverge`/`lerpHex`/`CTR_*`) remains dead but is left in
place for now.

### 2026-07-31 (later) — Fix month-label overlap in the grid
The multi-month grid forced a label on the oldest column, so when the window started
mid-month (today 31 Jul → a one-week Mar stub before Apr) the "Mar" and "Apr" labels
collided. Now a label is suppressed when its month is a narrow sliver (< 3
week-columns before the next month); the current month is exempt (nothing follows it
to overlap). → `sw.js v11`.

### 2026-08-01 07:39 — Day Score card
A computed card (`type:'score'`, at most one, created/destroyed like a habit via a
"Score" option in the editor). It totals every habit each day: a toggle scores +2
when marked; a counter scores +1 just for logging plus its band index (−2..+2), so
showing up beats not — a bad-scoring day still nets more than skipping. Shows only a
big today's-score chip and the word "Score"; a bubble per day with the number inside,
coloured by the same 5 bands (`bandIndex`/`bandColour`/`bandInk`); and a numbered
month grid when expanded (`scoreGrid`, 16px cells). Read-only — no ticking. Excluded
from streaks, perfect-days, tier, milestones, the "recorded" count and the ~3-habit
cap. Core helpers: `dayScore(k)`, `scoreAvg()`. → `sw.js v12`.

### 2026-08-01 (later) — Fix mobile overflow
Score bubbles had a fixed 21px width, so 21 of them bled off a phone; the 5th seg
button ("Score") pushed the editor row past its card. Both made shrink-to-fit:
`.sbub` is now `width:100%; max-width:22px; aspect-ratio:1` in a `min-width:0` slot,
and `.segBtn` is `flex:1 1 0; min-width:0` with smaller padding/font. → `sw.js v13`.

### 2026-08-01 (later still) — Properly rescale the score card
v13 stopped the page overflowing but the score card was still wrong: bubbles were
squeezed to 10px while holding two-digit numbers (text spilling out of the circle),
and the score's month grid was 339px inside a 290px card, so it scrolled sideways.
Root cause was cramming 21 bubbles / 18 week-columns into a phone.
- Score rows now use the **full card width** (dropped the 44px tick indent — a score
  card has no tick to align to).
- Week row shows **14 days** instead of 21 → bubbles are 18px on a phone, 26px capped
  on desktop, and the numbers fit.
- `scoreGrid` shows **13 weeks (~3 months)** instead of 18, laid out with flex
  (`.sgrid`, no `gridWrap`) so it always fits — cells are 20px on mobile, 22px square
  on desktop (`max-width:322px` keeps them square rather than stretched).
Measured at 360px and 619px: no page overflow, no element past the card edge, no text
overflow in any bubble or cell. → `sw.js v14`.

### 2026-08-01 (later) — Fix: a +/- habit at zero scored negative
Reported: a `+/-` habit logged down to −1 then back to 0 made the day score −1; it
should be +1 (the logging point, nothing net gained or lost).
**Cause:** bands were measured in steps of *20% of the average*. A `+/-` habit hovers
near zero, so the average is tiny, the step becomes a fraction of a point, and a plain
0 reads as many steps "below average" → bottom band (−2), cancelling the +1.
**Fix, two parts:**
- `bandIndex` now floors the step at **1** — counters are whole numbers, so a
  near-zero average can no longer make one point look like a huge deviation.
- New `habitBand(h, v)`: for **`plusminus` habits zero is the anchor, not the
  average** — 0 is neutral, positive good, negative bad, scaled by `counterMag()`
  (typical |value| over 21 days, floor 1). `plus`/`minus` habits never straddle zero,
  so they stay judged against their own average.
Both the score and the cell colours now use the same `habitBand`, so a 0 day reads
neutral instead of deep red. Verified: `+/-` bands −3→−2, −1→−1, **0→0**, +1→+1,
+3→+2 (scores −1, 0, **1**, 2, 3 — monotonic, no inversion); `plus` avg 10 still puts
9 in the green band and 1 at −1; `minus` still rewards fewer slips; toggle still +2.
→ `sw.js v15`.

### 2026-08-01 (later) — +/- habits: separate positive and negative averages
Refining the above on request. A `+/-` habit now gets **three separate calculations**,
on top of the +1 for logging:
- **0** → band 0 (score +1). Zero is neutral: you logged, nothing net happened.
- **positive days** → judged against the average of the *positive* days only (21d)
- **negative days** → judged against the average of the *negative* days only (21d)

Wins and slips are two different populations; one blended average represents neither.
Each side owns two bands, so its average is **split in half**: past the halfway mark
is the outer band (±2), short of it the inner one (±1). `sideAvgs(h)` replaces
`counterMag()`. `plus`/`minus`-only habits never straddle zero and are unchanged
(still `bandIndex` against their single average).

Worked example — positives +2/+4/+6 (avg 4, half 2), negatives -1/-3 (avg -2, half -1):
`+1`→2, `+2`→3, `+6`→3, `0`→1, `-1`→-1, `-3`→-1. First-ever day with no history on a
side lands in that side's inner band.

(v16 first put the split at *half* the side average; corrected below.) → `sw.js v16`.

### 2026-08-01 (later) — Correction: the side average is the top of the middle band
The half-average split was wrong. Each side's average is the **top of its middle
band**, not the midpoint: values up to and including the average are the middle band
(±1), values past it are the outer band (±2).

Negative average -3: days -1, -2, -3 → band -1 → **day sum 0**; -4 or worse → band -2
→ **day sum -1**. Positive average +3: +1, +2, +3 → band +1 → **day sum 2**; +4 or
more → band +2 → **day sum 3**. Zero is unchanged: band 0, **day sum 1**.

This also removes the v16 consequence — a ±1 habit now has its ±1 days sitting *at*
the side average, so they land in the middle band (day sums 0 / 1 / 2) and the soft
middle colours are reachable again. A side with no history yet uses its middle band.
`plus`/`minus`-only habits and toggles are untouched. → `sw.js v17`.

### 2026-08-01 (later) — Scoring rebuilt: consistency only, performance is colour
The relative-to-average scoring was the wrong abstraction and kept generating edge
cases (near-zero averages, side splits, band boundaries, slump-inflation). Its real
flaw: **the yardstick moved with you** — a slump lowered the bar so mediocre days
scored well, and improvement raised it so the same effort scored worse. A number that
can't reliably go up through effort can't be a goal, and a trend on a moving baseline
is uninterpretable. Replaced wholesale.

**Points now come from consistency alone.** Each habit logged that day is worth its
chain tier. Size, sign and colour of a counter have zero effect — logging −5 and +5
earn the same. Day score = the tally across habits.

| tier | points | at |
|---|---|---|
| 1 | 1 | first logged day |
| 2 | 2 | 14 days |
| 3 | 3 | 30 days (1 month) |
| 4 | 4 | 60 days (2 months) |
| 5 | 5 | 120 days (4 months) |
| 6 | 6 | 240 days (8 months) |
| 7 | 7 | 480 days (16 months) |

Each tier takes **twice as long as the last**, so the ladder climbs slowly and a high
tier means something. `TIER_DAYS` generates it by doubling from 60.

**Misses are penalised in pairs.** One missed day costs nothing; every *second*
consecutive miss drops one tier, knocking the chain back to the start of the tier
below (so a 6→5 drop costs ~120 days of rebuild, not the whole chain). Rationale: a
full reset after months of work is the best-documented cause of abandonment in streak
apps, and it collides with the app's own "one miss is noise" rule. Paused days bridge;
today stays grace. `chainRun(h)` replays a habit's history once per render (cached in
`_chainCache`, cleared at the top of `render()`) and returns per-day points — still
fully derived from the logs, so nothing new is stored and sync is untouched.

**Colour is now descriptive only** and never touches the score, so a moving yardstick
is harmless there. A logged day is placed in one of five 20% groups against the
habit's own last 21 logged days (`quintiler`, mid-rank percentile so ties share a
group). Palette is **deep green → sage → neutral → soft gold → amber** — no red on any
logged day, because logging a bad day is a success of the tracking behaviour, not a
failure. Red is now reserved exclusively for not showing up.

**Missed-day border** escalates on the row: 1px red at 1+ misses, 2px at 7+, 3px at
21+. **At-risk highlight** fires when the *next* miss would cost a tier (odd miss
count, tier ≥ 2, not yet logged today): gold 2px border, a slow `stake` pulse
(disabled under `prefers-reduced-motion`), and an inline **Pause instead** button so
the chain can be protected in one tap. Rainbow/flashing was rejected — gold already
means "you've built something rare" here and stays inside the palette.

Rejected in the same round: a periodic card shake (ambient nagging trains you to stop
opening the app, and it fights the calm aesthetic), auto-sorting struggling habits to
the top (moving cards adds friction to a glance that is itself a habit), and a library
of quoted *Atomic Habits* lines (copyright, and it would dilute the app's own voice).

Verified: ladder exact at every boundary; 2 misses = −1 tier with the chain knocked to
the tier below, 4 = −2, 6 = −3; at-risk fires only on odd miss counts; all five bands
render with no red; a day score of **98 fits** the week bubble (13px of text in 18px)
and the month cell (11.7px in 20px) at 360px with zero overflow. → `sw.js v18`.

### 2026-08-07 — New habit type: first time of day
For quitting something by pushing it later each day. Logs **the first time the thing
happened**, as minutes since local midnight, so `days: {dateKey: number}` is unchanged
and sync/merge/import/export need no migration. `NONE_MIN` (1440) is the sentinel for
"it never happened today" — it sorts as the latest possible moment, so it is both the
best day and the top of the graph, and it is pinned to the top colour band regardless
of how the rest of the fortnight fell.

**Why a sentinel was needed:** without it the *best possible day* (never doing the
thing) has nothing to log, so it would earn no points and break the chain. Now the row
offers two spaced, visually distinct buttons — **Log now** (clay, one tap stamps the
clock) and **Didn't happen** (sage). First log wins, since it is the *first* time;
corrections go through the day chip, which gains a native `<input type="time">`.

**Drawn as a dot-and-line graph** (`timeGraph`) rather than the ribbon. The vertical
scale is the habit's own observed range over the window — lowest logged time is the
floor, latest is the roof — because nothing happens at 3am and there is no point
plotting empty hours. Consecutive logged days are joined; a miss breaks the line, a
pause bridges it. Dot height is **goodness, not raw time**, so an improving habit
always climbs whichever direction is better. Colour uses the same five bands.

**Direction is now general** (`dir: 'up' | 'down'`, `isDown`), exposed on every
counting type rather than special-cased for time: *later/earlier is better* for time,
*more/less is better* for counters. It inverts the colour ranking and the graph height.

Scoring is untouched — a time habit earns its chain tier for being logged, like
everything else, so a 6am slip and a clean day are worth the same points and only the
colour differs. The type selector now wraps to two rows (six options).

Deliberately skipped: midnight wrap-around handling (a 1am slip after a good run reads
as early rather than as a near-miss). Not worth the ripple through every date
calculation for someone in bed by 10pm; revisit only if the logs routinely pass ~10pm.

Verified: later reads higher for `up` and earlier reads higher for `down`; the
sentinel sits on the roof in deep green; log-now stamps the exact minute and disables
both buttons; a second tap cannot overwrite; the chip sets, clears and marks a past
day clean; direction persists through create/edit; nothing overflows at 360px.
→ `sw.js v19`.

### 2026-08-07 (later) — Fix the squished time UI
Three faults in the v19 build, all found by measuring rather than looking:

- **Dots rendered as overlapping ovals.** The graph used `viewBox="0 0 100 46"` with
  `preserveAspectRatio="none"`, so a 290px-wide strip scaled x by 2.9 and y by 1 — a
  circle came out **9.3 × 3.2px**, and 16 neighbouring pairs overlapped. Dropped the
  viewBox entirely: user units are now CSS pixels, x stays a percentage (still
  responsive), y is px. Circles are round 8×8 with zero overlaps.
- **Editor buttons collided with the hint text.** A **class-name collision**: the
  ribbon's day segments and the editor's type selector were both `.seg`, and the
  ribbon rule (`height:15px`) won, so the selector could not grow to its second row —
  it reported `height:15px` against `scrollHeight:75px` and the wrapped row spilled
  over the paragraph below. Renamed the editor's container to `.picker` (fewer touch
  points than renaming the ribbon's segment variants). Now 75px, both rows inside,
  hint below.
- **Changing a habit's type kept nonsense values.** Switching a counter to a time
  habit left values like `-1`, which `fmtTime` rendered as "-1:-6". Values only mean
  something inside a family (`famOf`: toggle / counter / time / score), so crossing
  families now clears the history — with a warning shown in the editor *before* saving
  ("will clear the 16 logged days"). `fmtTime` also clamps defensively.

Also dropped the `done` class from time rows: a struck-through habit name reads as an
achievement, which is wrong when what you logged is the slip you are trying to avoid.
→ `sw.js v20`.

### 2026-08-07 (later) — Time habits were flat green in the month view
`fullGrid` only reached for the band colours when `isCounter(h)`, so a time habit fell
through to `shade()` and every logged day rendered the toggle's solid green — losing
the whole good-to-less-good scale in the only view that carries it. Now gated on
`isCounter(h) || isTime(h)`. Verified: the month grid renders all five bands plus the
missed grey. (`chainStrip` keeps the counter-only test on purpose — time rows use
`timeGraph`, not the ribbon.) → `sw.js v21`.

### 2026-08-07 (later) — Updates now land in one visit, and the build is visible
Reported as "the month view is still all green". It was not: v21 renders it correctly
(verified on the live site — the month cells matched the week graph dot-for-dot). The
device was showing a **stale build**, and the cause is structural rather than a
one-off: the worker calls `skipWaiting()` + `clients.claim()`, so a new build takes
over immediately — but the page already on screen was served from the *old* cache, so
you had to reload a second time to see anything change. Every "open it once online to
pull vN" this session has had that trap in it.

Now the page listens for `controllerchange` and reloads itself once when a new worker
takes over (guarded by `hadController`, so a first-ever install does not reload, and by
a `reloaded` flag so it cannot loop). `reg.update()` on load forces the check.

Also added a **build indicator**: the worker answers a `postMessage({type:'version'})`
with its own `VERSION`, shown as "Build bloupunt-vNN" at the bottom of Manage. The
worker is the source of truth, so the number cannot drift from what is actually
running — and there is now a way to tell at a glance which build a device is on.

Verified by simulating a deploy: with an old build installed, a **single** navigation
ended up running the new shell and the new cache, no manual second reload.
→ `sw.js v22`.

### 2026-08-07 (later) — Build indicator on every screen
Moved the build line out of the Manage-only branch into the shared footer, so it shows
on Today as well. Own `.build` style (10px, half opacity, centred) rather than the
`.cap` it borrowed — quiet enough to ignore, there when you go looking.
→ `sw.js v23`.

### 2026-08-10 — A slip can revoke a clean day
"Didn't happen" locked the day, so going on Reddit at 8pm after marking the morning
clean left no way to record it. The original "first log wins" rule was too broad: it
should be the first *real occurrence* that stands. A sentinel is a claim about the
whole day, and a later slip falsifies it.

`logNow` now bails only when an actual time is already stored (`< NONE_MIN`), so it
overwrites the clean marker but never an earlier real time. The clean state reads as
**chosen** rather than merely greyed — "Didn't happen ✓" in filled sage, with "Log
now" still live beside it. The reverse is not offered on the row: once a real time is
recorded the day is definitionally not clean, and a mis-tap is fixed through the day
chip. The chain is unaffected either way, since the day was already logged.
→ `sw.js v24`.

### 2026-08-10 (later) — Universal session undo
A small icon button right of Manage, undoing the last 10 changes. Universal rather than
per-card: an accidental "Log now" was the trigger, but a mis-tapped tick, a bumped
counter, a deleted habit, a reorder or a pause share the problem.

**One hook, not fifteen.** `save()` is the only path a change takes to storage, so the
snapshot of the state *before* a change is captured there and every action is covered
without touching any of them. `save(undoable=false)` marks changes that are not a user
action in their own right — the `seen{}` write trailing a milestone, and a sync merge —
so one tap never costs two undos. Snapshots are whole serialized `data` objects held in
memory only and **never written to localStorage**, so the history dies with the tab.
`prevSnap` is seeded at boot so the first action of a session is already undoable.

Verified: accidental log undone and the button re-disables; the stack caps at 10; one
tap costs exactly one undo even when a milestone fires; a deleted habit returns with all
5 of its logged days; a reorder reverts; a reload drops a 9-deep stack to zero with
nothing added to the stored keys. → `sw.js v25`.

### 2026-08-10 (later) — Undo feedback without the layout jolt
The "Undone." banner pushed every card down as it appeared and let them snap back as it
went — exactly the movement this app otherwise avoids. Replaced with a green outline on
the cards that actually changed, held 2s.

Undo diffs the habit list either side of the restore and outlines only the ids whose
serialized form differs, so a restored deletion lights the card that came back and
untouched rows stay clean. Uses `outline` rather than a thicker `border`, because an
outline draws outside the layout box — growing a 1px border to 2px would resize the card
and nudge its contents, reintroducing the problem in miniature. Every `.row` carries a
transparent 2px outline by default so only the *colour* changes, letting it fade both
ways. Verified: card positions identical before, during and after; box unchanged at
328×110; only the affected card outlined. → `sw.js v26`.

### 2026-08-10 (later) — Louder undo cue, and a sync button replacing the banner
Reported as "the implementation did not work". It was working — verified on the live
build, the class and `outline: rgb(122,154,126) 2px` were both applying. It was simply
**too subtle to notice**: a 2px sage line over an existing 1px hairline border for two
seconds. A reminder that "correct" and "perceptible" are different tests, and only the
second one matters for a cue. Now 3px with a soft outer glow and a faint green card
tint — still outline/shadow only, so nothing moves.

**The "Sync failed" banner had the identical flaw** and is gone. Its job now belongs to a
small italic Fraunces **S** beside Undo: **red** failed or token expired, **green** synced
with nothing pending, **ink** idle, muted while syncing. Tap to sync (`flushPush()` then
`pullRemote()`), or open the settings if sync was never configured. `setSyncStatus`
repaints the glyph in place rather than re-rendering; the full explanation still lives in
the tooltip and the Manage panel. Verified: all four header buttons fit exactly at 360px
with no overflow. → `sw.js v27`.

### 2026-08-15 — Miss ladder tightened, and the points made visible
Two reports: skipping felt free, and a habit paid 2 points before day 14. Testing showed
one root cause behind both — **`chain` was a lifetime count of logged days, not a current
run.** A lone miss cost nothing *and* did not interrupt progress, so 15 days logged across
17 read as chain 15 (2 points) while the card honestly said "4 days running".

New penalty: **one free day, then every further consecutive missed day costs a point**,
down to a floor of 1 — logging is always worth something, so the ladder cannot go
negative. Verified from a 300-day habit (6 points), counting days since the last log:
grace → 6, one miss → 6, then 5, 4, 3, 2, 1, holding at 1. Clean runs exact again: 12 and
13 days pay 1, 14 pays 2.

Added a **points pill** to every row type showing what a habit is worth once above the
baseline, so the card and the day score can never silently disagree again — which is what
made the original report so hard to see. → `sw.js v28`.

### 2026-08-15 (later) — One grace per chain, and copy that teaches the rules
Closed the loophole above: the free day is granted **once per chain**, not per gap. Spend
it and every missed day after costs a point, down to the floor. Falling to the floor is a
fresh start, so the grace returns with the new chain.

Verified — logging every other day for 40 days now pays **1 point** (it was 2, with a
streak of 1); 15 logs across 17 with two lone misses drops to 1; a *single* forgiven miss
still holds the full chain (15 days, 2 points); clean runs unchanged at 13 → 1 and 14 → 2.
The consecutive ladder from a 300-day habit is unchanged: 6, 6, 5, 4, 3, 2, 1.

**Copy.** The rules are now non-obvious enough that they have to be taught somewhere, so
the moments where they bite do the teaching. `missNote()` says what just happened *and*
what happens next — "that was your one free day. The next one costs.", "your free day was
already spent, so that cost a point". `tierNote()` in every expanded view gives the next
rung and the grace state — "16 days to 3 points a day. · One free day still in hand." At
the top of the ladder it reads "Nothing above this. Just keep it." Written in the app's
own voice rather than quoted, per the earlier decision.

**Worth watching in use:** one grace for the whole life of a chain is severe by design.
An eight-month chain gets a single free day ever, and after that ordinary life bleeds it
down a point at a time. If that proves too punishing, the softest fix is restoring the
grace on reaching a new tier rather than only at the floor. → `sw.js v29`.

### 2026-08-15 (later) — Time-card height, weekday labels, score insights
**The unlogged time card was enormous.** Another **class-name collision**: the modifier
`.bigTime.empty` picked up `.empty`, the *empty-state card* rule, inheriting
`padding:44px 28px` and a border. Inside a 58px box that leaves no content width, so
`––:––` wrapped onto five lines and the box stood 111px tall. Renamed the modifier to
`.blank` and added `white-space:nowrap`. The box is now **21px**, the whole card 251px →
**180px**. (Third collision in this project after `.seg` and `.empty` — the stylesheet is
one flat namespace and short modifier names are the weak point.)

**Weekday labels** run down the left of every month grid, habit and score alike
(`dowCol()`, Monday-first to match the column layout). Verified aligned to the cell rows
within 2px, with no grid or page overflow.

**Score insights** in the expanded score card, computed only over days actually recorded.
Each line carries its own sample threshold and stays hidden until the data supports it.
→ `sw.js v30`.

### 2026-08-15 (later) — Day 1 means first log, and the stats grow up
**`habitStart()` now means the first day actually LOGGED**, not the day the habit was
created. The creation date is meaningless if nothing was ever recorded against it, and
the days between creating a habit and first using it were being counted as *misses* —
penalising a chain that had not started. This also removes the need for the 2020-epoch id
guard added in v30, since no id arithmetic remains.

**Totals count every calendar day since that first log, gaps included** — a gap is part
of the record, not missing data. Verified against the reported case: two days logged, a
week off, one more later reads "Since you started · 21 days" and "Days recorded: 8 of 21
· 38%".

**Pattern stats use the shorter of your whole history and the last 13 weeks** (91 days,
one screen of month grid), so "strongest day", "most kept" and "needs work" describe how
you are now rather than a year ago. Confirmed: 200 days of history reports "Since you
started · 200 days" for totals but "Last 13 weeks" for patterns, and the heading degrades
honestly to "Last 4 weeks" when that is all there is.

Grouped into three sections — **Since you started** (days recorded, every-habit-logged
days, points earned and per-day average, best day with date), **Lately** (this week, last
week, this month, last month, each an average with the recorded-day count behind it, so a
part-finished week is not compared unfairly against a complete one), and **Last 13 weeks**
(strongest and weakest weekday, best week, most-kept and needs-work habit, longest chain).

Thresholds: nothing under 7 logged days, weekday claims only with 3+ weekdays at 2+
samples and a ≥0.5 gap, best-week only across 2+ weeks with 3+ days each, kept-rates only
over a 7-day span, and each habit measured against its own span inside the window.
→ `sw.js v31`.

### 2026-08-15 (later) — Honest denominators in the score card
Reported as "days recorded is not working" — the card read **30 of 32** after a start with
a four-day burst and a two-week gap. The arithmetic was right; the *framing* was not.
`eligible` quietly removed paused days from the denominator, so nine excused days had
silently vanished and the figure looked broken to someone who had forgotten pausing at
all. **A hidden exclusion is worse than no exclusion**: it produces a number nobody can
reconcile against what they remember.

- **Days recorded** is now measured against every calendar day since day 1, gaps and all.
- **Paused** appears on its own line when there are any, so the excused days are visible
  rather than silently netted off.
- **Points earned** divides by that same full span, so "a day" means per calendar day
  rather than per recorded day — the two differ sharply on a patchy history.
- **Best day** became **Best score**: the highest score ever reached and *how many days
  reached it*. Naming a single date just pointed at whichever maximum happened last,
  which says nothing when there are several.
- Added **Longest run** — the longest unbroken stretch of days with anything logged, with
  paused days bridging rather than breaking it.

Verified against a dataset shaped like the report (a four-day false start 41 days ago, a
two-week gap, then steady logging, plus a deliberate six-day pause) and cross-checked
against an independent walk of the same data: span 42, recorded 29, paused 6 — rendering
"29 of 42 · 69%", "Paused: 6 of those days", "77 · 1.8 a day", "4 pts · reached on 6 days"
and "25 days in a row". Under the old code the same data would have read "29 of 36".
→ `sw.js v32`.

### 2026-08-15 (later) — Paused days get their own colour
A paused day was drawn as plain paper with a pale sage ring, which disappeared against
the background and read as brownish next to the missed grey. It is neither kept nor
missed, so it now has its own hue rather than a shade of one of them: **soft dusty blue**
(`PAUSED_FILL` `#C3D5E0`, ring `#A2BECE`) — cool against an otherwise warm palette, so it
separates at a glance without shouting.

Applied at all eight places a paused day can be drawn, from one shared constant:
`unloggedShade()` (habit month grids and the counter/time strips), the ribbon's bridge
segment, a standalone upcoming pause in the ribbon (previously an invisible gap), the
time-graph dot (also enlarged 1.6 → 2.8px so it is not lost), the score card's week
bubbles and month cells, and the cell ring.

`shade()` needed its own fix: it had been two-state since the solid-green toggle change,
returning kept-or-neutral without ever consulting `unloggedShade`, so **toggle** month
grids alone stayed paper. It now returns green / blue / neutral — still no missed-grey on
a toggle, since that distinction was deliberately dropped there.

Verified across every surface with five paused days seeded mid-history: all four month
grids (toggle, counter, time, score), both ribbon styles, the time graph and the score
bubbles each render exactly 5 blue. A first pass reported 0 for the habit grids — that
was the test, not the app: only one row can be expanded at a time, so clicking all four
chevrons left just the last one open. → `sw.js v33`.

### 2026-08-15 (later) — Paused days that were also logged were undrawable
v33 coloured paused days blue, but a user with nine paused days still saw none of them.
The blue was correct and reachable — it just could not apply to *their* nine, because of
three faults that all hid the same case: **a paused day you also logged**.

- `fullGrid` only added the `paused` class when `!has(h.days,k)`, so pausing and then
  logging anyway produced no marker at all. That is the common case: pause does not stop
  you recording, and it is exactly when you lose track of your own breaks.
- `scoreGrid` never carried the class in either branch — it only set an inline fill for
  unlogged days.
- The ring rule sat *before* `.cell.marked` at equal specificity, so even where the class
  was applied, a logged day's dark marked ring won and the pause disappeared.

Now every paused day carries the class in all three grids, the ring is defined after
`.marked` so it wins, and `.scell.paused` is covered. Blue **fill** still means paused
and unlogged; a blue **ring** means paused, whether or not the day was logged.

The stat was ambiguous for the same reason — "9 of those days" alongside "31 of 41
recorded" implied the pauses explained the gap, when most were logged days. It now reads
**"9 of 41 days · 7 still logged"**.

Verified with nine paused days of which seven were also logged: all three grids report 9
paused-classed cells, 9 visible rings and 2 blue fills, and the stat line reads as above.
→ `sw.js v34`.

### 2026-08-15 (later) — Pauses stop penalising "Days recorded"
Once v34 made pauses visible, the earlier v32 decision was clearly the wrong one: v32
had put paused days *into* the denominator, so declaring a break in advance quietly cut
your percentage. Both framings had been tried and both were wrong on their own — hiding
the pauses (pre-v32) made the number unreconcilable, counting them (v32) made it unfair.

The fix is to separate the two questions instead of forcing one number to answer both:

- **Days since start** — the raw calendar span from day 1, gaps and all.
- **Days recorded** — measured only over days a pause did not excuse.

A pause now leaves **both sides** of that ratio. Counting a paused-but-logged day in the
numerator only could push the figure past 100%, and dropping it from the numerator while
keeping it in the denominator is the penalty we were removing. The **Paused** row carries
the rest of the story: "9 days · not counted, 7 still logged".

The per-day points rate divides by the same eligible span, so a declared break does not
drag it down either.

Edge case found in testing: with *every* day paused, `eligible` is 0 and the row read
"0 of 1 · 0%" — failure, to someone who had logged daily. The ratio is now omitted
entirely when there is nothing to measure against; the Paused row already explains it.

Verified against an independent recount of the same data: span 41, paused 9 (7 logged),
recorded 24 of 32 · 75%. Plus three shapes — every day paused-and-logged, a typical run
with a short pause, and no pauses at all. → `sw.js v35`.

### 2026-08-15 (later) — "0 of 0" instead of hiding the row
v35 omitted **Days recorded** entirely when every day was paused, on the grounds that a
percentage of nothing is meaningless. Confirmed with the user that the exclusion should
be total — a paused day leaves both sides of the count — and that the all-paused case
should still show, because "0 of 0" is simply the truth: no day was ever up for counting,
and there are no countable logged days either.

The row now always renders, dropping only the percentage when there is nothing to divide
by. Silently removing a line is worse than printing an honest zero: a missing row looks
like a bug, while "0 of 0" states the situation.

Verified: live shape reads "41 days / 24 of 32 · 75% / 9 days · not counted, 7 still
logged"; every-day-paused reads "20 days / 0 of 0 / 20 days · not counted, 20 still
logged"; and a run with no pauses is unchanged at "13 of 20 · 65%". → `sw.js v36`.

### 2026-08-15 (later) — Strongest / weakest weekday per habit
The score card's weekday pattern was useful enough to want per habit, so `habitDayStats()`
adds it to every expanded habit view, over the shorter of that habit's own history and
the last 13 weeks — the same window the pattern section uses.

**The measure has to suit the type or it says nothing.** A yes/no rate is meaningless for
a time habit, and an average clock reading is meaningless for a tick:

| type | measure | example |
|---|---|---|
| toggle | how often you keep it that weekday | Monday · 100% |
| counter | average value, so a good day and a bad day stay distinguishable | Tuesday · 4 / Friday · −3 |
| time | average time of day | Wednesday · 20:00 / Sunday · 09:00 |

Direction is respected throughout, so **strongest always means better, never merely
larger**: an earlier-is-better wake habit reports its earliest weekday as strongest, and a
lower-is-better counter reports its smallest.

Two details worth keeping: a time habit's "didn't happen" sentinel is excluded from the
average — averaging 1440 in would drag every weekday toward midnight and mean nothing —
and paused days are skipped entirely, since an excused day is not evidence either way.

Guards match the score card: at least 2 samples for a weekday to qualify, at least 3
qualifying weekdays, and a real gap before any claim (15 minutes / 0.5 points / 15
percentage points). Verified across all three types with patterns deliberately seeded, both
direction settings, and the silent cases: 4 days of history and a perfectly flat habit both
return nothing rather than inventing a pattern. → `sw.js v37`.

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
