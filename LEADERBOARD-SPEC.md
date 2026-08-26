# LEADERBOARD — implementation spec

Pay-to-record global leaderboard for DRONE RAID. Every position is a paid, permanent,
ad-like placement earned by a real gameplay run. Design was converged interactively
in `ranking-preview.html` (the simulation is the visual source of truth — reuse its
markup/CSS wherever possible).

**Vocabulary (normalized, use everywhere):** money (USD) actions are always
**CLAIM**; points (PTS) actions are always **OUTRANK**. You OUTRANK someone by
scoring higher; you CLAIM a position by paying. Never "outbid"/"beat" in copy.

Tagline (shown at top of the board): 
`OUTRANK THE COMPETITION · CLAIM YOUR POSITION · PROMOTE WHATEVER YOU WANT`

---

## 1. Core rules

- **Unlimited positions.** The board is ordered by SCORE, descending. Every paid
  entry is listed — nobody ever falls off.
- **Positions are permanent.** No expiry, no weekly reset. New higher scores slot
  in ABOVE you and push you down, but never remove you.
- **Payments are never refunded.** No refund logic exists anywhere.
- **Concurrency:** every completed payment is accepted and inserted at the position
  its score earns. Two simultaneous claims of "the same position" both land, ordered
  by their scores. No rejection path, no race condition.
- **Gameplay-gated.** A claim is only offered for a score from a real run the player
  just finished (v1 trusts the client score; the claim offer appears in-game only).

## 2. Pricing (auction)

- **Floor: $1.00** — price of an uncontested position (slotting below everyone,
  or an empty board). NOT $0.50: the Stripe account settles in EUR and Stripe
  requires the converted total to reach €0.50, which $0.50 misses (~€0.43).
- **Min bid to take a slot above raider X** = `X.bid + max($0.50, 5% × X.bid)`.
  (+$0.50 rules below $10; +5% above. $1→$1.50, $8→$8.50, $1,000→$1,050.)
  Round to cents. X = the entry directly BELOW where your score slots in
  (the raider you displace downward).
- **Open-ended bids.** The bid field is editable above the minimum: overpaying is
  the defense strategy — label copy: `BID HIGHER TO COST MORE TO CLAIM`.
  Paying $1,000 means the next claimant of that slot must bid ≥ $1,050.
- Money display: `$` + no decimals when whole, 2 decimals otherwise ($1050, $0.50).

## 3. The board (ranking screen)

Layout (from ranking-preview.html, keep exactly):
- Table, `table-layout: fixed`, font 13px. Columns: `#` 34px · `SCORE` 80px ·
  `RAIDER` auto · `VALUE` 150px right-aligned. The rank number is SUBTLE:
  same 13px as the score, muted `rgba(232,228,216,0.55)` — never larger
  (applies everywhere a position shows, incl. ghost row and share card).
  Row height 53px uniform,
  1px `rgba(232,228,216,0.15)` separators; header row 10px letterspaced muted.
- Scroll container ~440px tall, thin scrollbar (track #262626, thumb
  `rgba(232,228,216,0.4)`).
- Tagline line sits ABOVE the board (10px, muted, centered, 12px gap).
- **RAIDER cell** (single source of truth — one render function used by board,
  claim preview, and level interstitial): flex row, 10px gap →
  28×28 pixelated avatar · name (13px letterspaced) with gold (#c2a24e) link
  chip 11px inline right of name · one-line promo below (11px,
  `rgba(232,228,216,0.7)`, height 17px).
- **Promo line: hard cap 53 characters** — the exact one-line width
  (374px text space ÷ 7px/char, Departure Mono 11px). NEVER ellipsize/crop:
  the cap guarantees fit. Name cap: 16 chars.
- **Entire row is clickable** → opens the advertiser URL in a NEW TAB. No URL = no
  action.
- **Avatars = favicon of the entry's link** (fetch by domain, e.g. Google s2
  favicon service, 32px, rendered pixelated). No link, or favicon fails to load
  (onerror) → **one shared muted placeholder**, identical for all: 5×5 pixel
  X-quad mark, `rgba(232,228,216,0.35)` on #262626.
- VALUE column shows what the holder paid.

## 4. Ghost row (the player's unclaimed run)

Appears in the board at the exact position the player's fresh score earns
(also as the claim CTA after clearing a level):
- Inverted colors: background #e8e4d8, text #303030.
- Content: placeholder avatar · `YOUR RAID · UNCLAIMED` ·
  tag `CLAIM #<rank> POSITION` + red (#9e4b4b) `OR BE FORGOTTEN`.
- Right cell: solid dark button `CLAIM FOR $<min>`.
- Board auto-scrolls so the ghost row is vertically centered.
- Every score qualifies (unlimited positions) — worst case the ghost is the last
  row at the $1 floor.

## 5. Claim form

- Title: `<score> PTS OUTRANK POSITION #<n>` (e.g. `44,500 PTS OUTRANK POSITION #12`).
- Fields, in order:
  1. `NAME OR HANDLE (16 CHARS)` — placeholder `ACE / @HANDLE / BRAND`, maxlength 16.
  2. `PROMO LINE (53 CHARS)` — placeholder `Promote anything here`, maxlength 53.
  3. `LINK (OPTIONAL) — ITS FAVICON BECOMES YOUR AVATAR` — placeholder `https://`.
  4. `YOUR BID (USD) — BID HIGHER TO COST MORE TO CLAIM` — number input,
     step 0.5, prefilled with the min, editable upward. Below min → reject with
     `YOUR BID MUST BE AT LEAST $<min>`.
- NO score field (score comes from the run). NO avatar upload (favicon only).
  NO rules/bullets block.
- Live preview under label `HOW YOU'LL LOOK IN THE RANKINGS` — rendered with the
  SAME raider-cell function as the board (dashed border box).
- Pay row: `MIN BID $<min>` left · button `PAY WITH STRIPE ▶` right, with
  `APPLE PAY · GOOGLE PAY` in 9px muted underneath the button.
- Fine print: `YOUR ENTRY GOES LIVE THE MOMENT PAYMENT CONFIRMS.`
- `◀ BACK` returns to the board.

## 6. Confirmation + share (after payment)

- `POSITION SECURED` + `POSITION #<n> · $<bid> PAID` + `EVERYONE BELOW YOU SLID
  DOWN ONE SLOT.`
- Kicker: `SPREAD THE WORD — EVERY SHARE INVITES YOUR OUTRANKER`.
- **Share card**, 1.91:1 (OG image ratio), #262626, 1px #e8e4d8 border:
  header `DRONE RAID` / `LEADERBOARD` · big gold `#<n>` + avatar + name +
  promo + score · footer red `OUTRANK ME — OR BE FORGOTTEN` / gold
  `DRONERAID.CALLMESEVA.CC`.
- Buttons: SHARE (Web Share API) · DOWNLOAD (card as PNG) · COPY LINK
  (`droneraid.callmeseva.cc/#raid-<n>` — link must unfurl into this card via an
  OG-image endpoint).
- Closing line: `YOUR PLACEMENT IS PERMANENT. HIGHER SCORES SLOT IN ABOVE YOU —
  WE EMAIL YOU WHEN YOU'RE OUTRANKED.` (email captured by Stripe Checkout automatically).

## 7. Level-start interstitial (the ad surface)

Shown before a level launches, when there's a board entry above the player's
campaign score:
- `LEVEL <n>` (big) → kicker `NEXT POSITION HELD BY` (10px muted, only 6px above
  the card) → **card = exact replica of the board row's RAIDER cell**: 424px wide
  (board width minus 34+80+150 column widths), same 53px height/padding/classes,
  left-aligned, 1px top+bottom hairlines. No rank, no score, no value.
- Card click → advertiser URL in a NEW TAB.
- Below card: `+<diff> PTS TO OUTRANK IT` (diff = that entry's score − player's
  campaign score; target = the LOWEST board score above the player's).
- Then: `CAN YOU OUTRANK IT? TAP TO CONTINUE`.

## 8. Backend (Vercel serverless + Stripe)

- **Endpoints:**
  - `POST /api/claim` — body: score + name + promo + url + bid. Validates caps
    (16/53 chars), recomputes min server-side from current board, rejects low
    bids, creates a Stripe **Checkout Session** (hosted page) with inline
    `price_data` = bid amount and all entry fields in `metadata`. Returns the
    session URL for redirect.
  - `POST /api/stripe-webhook` — verifies signature with the **webhook signing
    secret** (local HMAC, no API permission needed), handles ONLY
    `checkout.session.completed`: inserts the entry from metadata into the board
    at its score position. This is the ONLY writer. Insert-by-score makes
    concurrent payments commutative.
  - `GET /api/board` — returns the board JSON (rank, score, name, promo, url,
    bid) for the game and the ranking page.
  - OG share-card image endpoint for link unfurls (per-position).
- **Stripe setup (done by user):** activated account; **restricted key** with
  ONLY `Checkout Sessions: Write` (Write includes Read); webhook endpoint →
  `/api/stripe-webhook`, subscribed to `checkout.session.completed` only, with
  signing secret. Env vars in Vercel: `STRIPE_SECRET_KEY` (rk_…),
  `STRIPE_WEBHOOK_SECRET` (whsec_…). Test-mode pair first (card 4242…).
- Apple Pay / Google Pay are automatic on hosted Checkout — no config.
- No products/prices/subscriptions in Stripe. No refund code.
- Statement descriptor: DRONE RAID.
- **Storage:** single board document (JSON) in Vercel storage (Blob or KV —
  decide at build time; webhook is the only writer, traffic is small).
- Success URL returns to the game with the confirmation/share screen; cancel URL
  returns to the board with the ghost row intact.

## 9. Game integration (index.html)

- Aesthetic everywhere: Departure Mono, palette #303030 / #e8e4d8 / gold #c2a24e /
  red #9e4b4b, pixelated rendering, all-caps labels.
- **Title screen — ATTRACT WINDOW** (chosen design, simulated in
  ranking-preview screen 5): the title block stays put; UNDERNEATH it sits a
  cropped board window exactly 3 cards tall (3 × 53px, overflow hidden, 1px
  hairlines top+bottom), with the tagline just above it and the blinking start
  prompt below. Right under the window, small right-aligned muted hint (9px):
  `PRESS SPACE FOR FULL LEADERBOARD` — Space opens the full leaderboard view;
  Enter starts the game (desktop keys; the blinking `PRESS ENTER TO START`
  stays the primary prompt). The window loops: starts anchored at the BOTTOM (last position
  visible) → hold 2.5s → steady linear auto-scroll up to #1 (~5 ms/px) → hold
  5s on #1 (double the bottom hold — user-tuned) → steady scroll back DOWN to
  the bottom → hold → … ping-pong forever (never snaps/jumps).
  Rows only, no header, no ghost row. Rows clickable to advertiser.
  Start input exits cleanly (clear timers/rAF).
  Data from `/api/board` (fetch once per session, re-use for all surfaces).
- **Level clear:** if the run's total score qualifies the player wants recording —
  show the board with the ghost row + CLAIM button (score = the run just played).
- **Level start:** interstitial from §7 (needs the board + player campaign score).
- Campaign score = the player's current total for this progression run.

## 10. Open items

- Server-side score validation is v1-trusted (client-reported); replay validation
  is a known future option, out of scope now.
- Promo-text moderation policy (manual review? blocklist?) — undecided.
- OG image endpoint implementation details (satori/canvas) — decide at build time.
- Email-on-move notifications: emails exist via Stripe Checkout receipts; sending
  “you moved down” mail needs a mail provider — undecided, not blocking.
