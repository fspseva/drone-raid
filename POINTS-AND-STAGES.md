# DRONE RAID — points & stages

How the campaign, the levels, and the scoring actually work. Every number here
is read from the live code (`index.html`); the file/section to edit is named in
each part. The server keeps its own mirror of the level table and score formula
in `api/_lib.js` (used as an anti-fake ceiling) — **if you edit balance here,
update the mirror too.**

---

## 1. The campaign

- A **campaign** is one run through the levels, starting at level 1 with
  **0 PTS**. The campaign **score accumulates across levels** and is the number
  that goes on the leaderboard.
- **5 drones (lives) per level.** Losing a drone costs a life; retries of the
  same level are otherwise free (no score penalty). Clearing a level ALWAYS
  advances — even if the clearing kamikaze spent the last drone — and refills
  lives to 5.
- **Game over** = all 5 drones lost without clearing the current level. The
  campaign ends; this is the ONLY moment the score can be recorded on the
  leaderboard (final score + highest cleared level). Restarting begins a fresh
  campaign at level 1, score 0.
- A level is **cleared when every unit in its roster is dead** — by warhead
  (kamikaze), bomb, blast, or payload cook-off. Bombs still falling when the
  drone dies can still clear the level (the verdict waits for them).

## 2. Enemy classes

Six classes, each with a fixed threat value (the scoring base) — edit
`CLASS_VALUE` in index.html:

| # | Class | PTS value | HP | Behavior | Weapon |
|---|-------|-----------|----|----------|--------|
| 1 | WAN — wanderer | 300 | 1 | wanders; hides in the tent and in bushes (up to 2s); flees bombs that land within ~1 blast | none |
| 2 | FUG — fugitive | 450 | 1 | sprints away from the drone when it enters its (randomized) threat range, and away from nearby bomb blasts; slow to change direction | none |
| 3 | PST — pistol | 600 | 1 | moves like the wanderer | 1 shot / 2s, range 12 (~48 display-m) |
| 4 | SHG — shotgun | 750 | 1 | moves like the wanderer | 3-pellet spread / 5s, range 10 (~40 display-m), pellets die early |
| 5 | LTK — light tank | 1200 | 2 | vehicle (debris in vintage yellow) | 1 shot / 2.5s, range 20 (~80 display-m) |
| 6 | HTK — heavy tank | 1800 | 3 | vehicle; killing the FIRST one unlocks wind | 3-round burst / 3.5s, range 28 (~112 display-m) |

All bullets fly at `BULLET_SPEED = 18` (slow enough to see and dodge). HP =
number of blasts to destroy. Soldiers only leave the tent after the drone
lifts off.

## 3. The stage table

One editable row per level — `LEVELS` in index.html (`L(WAN, FUG, PST, SHG,
LTK, HTK, BOMBS)`):

| Level | WAN | FUG | PST | SHG | LTK | HTK | Bombs | Units | Base PTS | Par time |
|------:|----:|----:|----:|----:|----:|----:|------:|------:|---------:|---------:|
| 1 | 1 | – | – | – | – | – | 0 | 1 | 300 | 12s |
| 2 | 2 | – | – | – | – | – | 1 | 2 | 600 | 16s |
| 3 | – | 1 | – | – | – | – | 1 | 1 | 450 | 12s |
| 4 | 1 | 1 | – | – | – | – | 1 | 2 | 750 | 16s |
| 5 | – | – | 1 | – | – | – | 1 | 1 | 600 | 12s |
| 6 | – | – | 2 | – | – | – | 1 | 2 | 1,200 | 16s |
| 7 | 1 | 2 | 1 | – | – | – | 2 | 4 | 1,800 | 24s |
| 8 | – | – | 2 | 1 | – | – | 2 | 3 | 1,950 | 20s |
| 9 | – | – | – | 1 | – | – | 0 | 1 | 750 | 12s |
| 10 | – | – | 1 | 1 | – | – | 1 | 2 | 1,350 | 16s |
| 11 | 1 | 2 | 1 | 1 | 1 | – | 3 | 6 | 3,750 | 32s |
| 12 | – | 2 | 2 | 2 | 1 | – | 3 | 7 | 4,800 | 36s |
| 13 | 2 | 2 | 2 | 1 | 1 | 1 | 4 | 9 | 6,450 | 44s |
| 14 | – | 3 | 3 | 2 | 2 | 1 | 4 | 11 | 8,850 | 52s |
| 15 | 2 | 3 | 3 | 2 | 2 | 2 | 5 | 14 | 11,250 | 64s |

- **Past level 15** the game continues forever: each extra level adds **+1 FUG
  and +1 PST** to the level-15 roster (each capped at 6).
- **BOMBS** is the drone's loadout at takeoff. Landing on the pad reloads
  **1 bomb per second** up to the loadout (and recharges the battery). Levels
  with 0 bombs are kamikaze-only. Bombs on the rack cook off with the warhead:
  kamikaze damage = **1 + bombs remaining** blasts.
- **Wind milestones**: dead calm until the campaign's **first heavy tank
  kill**; for the next 5 levels wind is random **5–10**; beyond that, random
  **10–30**. Direction is random each attempt.
- Level 1 inherits the exact scenery (tree seed) shown on the home screen;
  every other start reshuffles the forest.

## 4. The score formula

Awarded once per level clear (`clearAward()` in index.html):

```
award = max(100, round(base × timeMult × effMult))

base     = Σ CLASS_VALUE of the level's roster
par      = 8 + 4 × roster size            (seconds)
timeMult = 1 + 2·e^(−levelT / par)        → ×3 for a blitz, →×1 for a slow clear
effMult  = clamp(0.9 + 0.1 × kills/munitions, …, 1.3)
```

- **TIME IS THE DOMINANT FACTOR** (deliberate design): the multiplier starts at
  ×3 and decays exponentially toward ×1 with the seconds flown **this attempt**
  (`levelT` — retries reset the clock and cost nothing).
  At exactly par time the multiplier is ≈ ×1.74.
- **Efficiency is a small nudge**: munitions = bombs dropped this attempt
  (+1 if the drone itself was expended). One kill per munition ≈ ×1.0; the cap
  ×1.3 rewards multi-kills per bomb; sloppy carpet bombing sinks toward ×0.9.
- Floor of **100 PTS** per clear, whatever happens.
- Difficulty needs no separate bonus — it's already in the base (a level-15
  roster is worth 37× level 1's).

### Per-level ceilings (perfect blitz, ×3 × ×1.3 = ×3.9)

| Level | Max award | Max campaign total |
|------:|----------:|-------------------:|
| 1 | 1,170 | 1,170 |
| 5 | 2,340 | 10,530 |
| 10 | 5,265 | 38,025 |
| 12 | 18,720 | 71,370 |
| 15 | 43,875 | 174,915 |

(These ceilings remain a server sanity bound, but the real gate is REPLAY
VERIFICATION: every claim carries the campaign's recorded inputs and the
server re-simulates them with the run's seed — the recomputed score is the
only one accepted. See LEADERBOARD-SPEC.md §11.)

### Worked example

Level 7 (1 WAN + 2 FUG + 1 PST, base 1,800, par 24s), cleared in 10 seconds
using 2 bombs plus the drone (3 munitions, 4 kills):

```
timeMult = 1 + 2·e^(−10/24) = 2.318
effMult  = min(1.3, 0.9 + 0.1 × 4/3) = 1.033
award    = round(1800 × 2.318 × 1.033) = 4,310 PTS
```

## 5. Persistence & the leaderboard

- `droneraid-hiscore` (localStorage): best campaign score ever on this device —
  shown as `HI-SCORE X PTS` on the title/home screen only.
- `droneraid-best` (localStorage): highest level ever cleared — a clear above
  it announces `NEW RECORD.`
- The **leaderboard** (see LEADERBOARD-SPEC.md) records a campaign at GAME
  OVER: final score + a signed run token issued when the campaign started.
  Positions are score-ordered, unlimited and permanent; claiming costs the
  auction price ($1 floor, +$0.50/+5% to outrank the incumbent below you).

## 6. Where to tune

| Knob | Where |
|------|-------|
| Roster & bombs per level | `LEVELS` table (index.html) — one `L(...)` row per level |
| Class threat values | `CLASS_VALUE` (index.html) **and** `api/_lib.js` mirror |
| Endless-mode growth | the `+1 FUG/+1 PST, cap 6` rule in `start()` and `api/_lib.js` |
| Time weighting | `par` and the `1 + 2·e^…` curve in `clearAward()` |
| Efficiency band | the `0.9 + 0.1×` line and the `1.3` cap in `clearAward()` |
| Lives per level | `lives = 5` (three places in index.html) |
| Bomb reload rate | `reloadT >= 1` (1/s) in the pad-landing block |
| Wind milestones | the `heavyKilledLevel` block in `start()` |
| Weapon ranges/rates | `WEAPON` table + per-class `shootT` values |
