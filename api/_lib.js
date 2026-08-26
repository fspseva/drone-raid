// LEADERBOARD backend — shared helpers (see LEADERBOARD-SPEC.md)
import { neon } from '@neondatabase/serverless';
import Stripe from 'stripe';
import crypto from 'node:crypto';

export const sql = neon(process.env.DATABASE_URL);
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const SITE = 'https://droneraid.callmeseva.cc';
export const NAME_MAX = 16;
export const PROMO_MAX = 53;
export const URL_MAX = 200;
// price of an uncontested position. $1: the account settles in EUR, and Stripe
// requires the converted total to reach €0.50 — $0.50 (~€0.43) gets rejected.
export const FLOOR_CENTS = 100;

let ready;
export function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS entries (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        promo TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '',
        score BIGINT NOT NULL,
        bid_cents INTEGER NOT NULL,
        stripe_session TEXT UNIQUE NOT NULL,
        email TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS entries_order ON entries (score DESC, created_at ASC)`;
      await sql`CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        used BOOLEAN NOT NULL DEFAULT false
      )`;
    })();
  }
  return ready;
}

// claim price = incumbent + $0.50 or +5%, whichever is larger
export function minClaimCents(belowBidCents) {
  if (belowBidCents == null) return FLOOR_CENTS;
  return belowBidCents + Math.max(50, Math.round(belowBidCents * 0.05));
}

// board order: score DESC, earlier entry wins ties
export async function boardEntries() {
  await ensureSchema();
  return await sql`SELECT id, name, promo, url, score, bid_cents, stripe_session
                   FROM entries ORDER BY score DESC, created_at ASC`;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/* ---------- run tokens (anti-fake tier 1) ---------- */
function hmac(payload) {
  return crypto.createHmac('sha256', process.env.RUN_TOKEN_SECRET).update(payload).digest('hex');
}
export async function issueRunToken() {
  await ensureSchema();
  const id = crypto.randomUUID();
  const ts = Date.now();
  await sql`INSERT INTO runs (id) VALUES (${id})`;
  return { token: id + '.' + ts + '.' + hmac(id + '.' + ts), seed: runSeed(id) };
}
// the campaign's PRNG seed, derived from the run id — the verifier recomputes
// it, so a replay only makes sense against the run that produced it
export function runSeed(id) {
  const h = crypto.createHmac('sha256', process.env.RUN_TOKEN_SECRET).update('seed:' + id).digest();
  return h.readInt32BE(0);
}
export function verifyRunToken(token) {
  const p = String(token || '').split('.');
  if (p.length !== 3) return null;
  const expect = hmac(p[0] + '.' + p[1]);
  const got = String(p[2]);
  if (got.length !== expect.length ||
      !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expect))) return null;
  return { id: p[0], ts: Number(p[1]) };
}

/* ---------- score plausibility bounds (mirror of the game) ---------- */
const CLASS_VALUE = { 1: 300, 2: 450, 3: 600, 4: 750, 5: 1200, 6: 1800 };
const LEVELS = [
  { 1: 1 }, { 1: 2 }, { 2: 1 }, { 1: 1, 2: 1 }, { 3: 1 }, { 3: 2 },
  { 1: 1, 2: 2, 3: 1 }, { 3: 2, 4: 1 }, { 4: 1 }, { 3: 1, 4: 1 },
  { 1: 1, 2: 2, 3: 1, 4: 1, 5: 1 }, { 2: 2, 3: 2, 4: 2, 5: 1 },
  { 1: 2, 2: 2, 3: 2, 4: 1, 5: 1, 6: 1 }, { 2: 3, 3: 3, 4: 2, 5: 2, 6: 1 },
  { 1: 2, 2: 3, 3: 3, 4: 2, 5: 2, 6: 2 },
];
function levelUnits(level) {
  const cfg = { ...LEVELS[Math.min(level - 1, LEVELS.length - 1)] };
  if (level > LEVELS.length) {
    for (const cls of [2, 3]) cfg[cls] = Math.min(6, (cfg[cls] || 0) + (level - LEVELS.length));
  }
  return cfg;
}
// per-level ceiling: base roster value × max time mult (3) × max efficiency (1.3)
export function maxCampaignScore(level) {
  let total = 0;
  for (let l = 1; l <= level; l++) {
    let base = 0;
    const units = levelUnits(l);
    for (const cls in units) base += (CLASS_VALUE[cls] || 0) * units[cls];
    total += Math.round(base * 3 * 1.3);
  }
  return total;
}
export const MIN_MS_PER_LEVEL = 2500;   // no human clears a level faster
