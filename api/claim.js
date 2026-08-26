import {
  sql, stripe, json, boardEntries, verifyRunToken, minClaimCents, runSeed,
  maxCampaignScore, MIN_MS_PER_LEVEL, SITE, NAME_MAX, PROMO_MAX, URL_MAX, FLOOR_CENTS,
} from './_lib.js';
import { verifyReplay } from './_verify.js';

const clean = (s, max) =>
  String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

// POST /api/claim { token, level, score, name, promo, url, bidCents }
// -> { url } Stripe Checkout to pay the bid; the webhook writes the entry.
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  // gameplay gate: a signed, unused run token issued when the campaign started
  const tok = verifyRunToken(body.token);
  if (!tok) return json({ error: 'invalid run token' }, 403);
  const run = await sql`SELECT used FROM runs WHERE id = ${tok.id}`;
  if (!run.length) return json({ error: 'unknown run' }, 403);
  if (run[0].used) return json({ error: 'run already claimed' }, 403);

  // plausibility bounds
  const level = Math.floor(Number(body.level));
  const score = Math.floor(Number(body.score));
  if (!(level >= 1 && level <= 500)) return json({ error: 'bad level' }, 400);
  if (!(score >= 100 && score <= maxCampaignScore(level)))
    return json({ error: 'score out of range for level ' + level }, 400);
  if (Date.now() - tok.ts < level * MIN_MS_PER_LEVEL)
    return json({ error: 'too fast to be a real run' }, 400);

  // replay verification: re-simulate the recorded campaign with the run's
  // seed — the claimed score must be exactly what the sim recomputes
  if (!body.replay || typeof body.replay !== 'object')
    return json({ error: 'replay missing' }, 400);
  if (JSON.stringify(body.replay).length > 500000)
    return json({ error: 'replay too large' }, 400);
  let sim;
  try {
    sim = await verifyReplay(body.replay, runSeed(tok.id));
  } catch (e) {
    return json({ error: 'verifier failed: ' + String(e.message || e).slice(0, 120) }, 502);
  }
  if (!sim.ok) return json({ error: 'replay rejected: ' + (sim.error || 'invalid') }, 400);
  if (!sim.over) return json({ error: 'replay does not end in game over' }, 400);
  if (sim.score !== score || sim.level !== level)
    return json({ error: 'replay disproves the claimed score (sim: ' + sim.score + ' pts, level ' + sim.level + ')' }, 400);

  const name = clean(body.name, NAME_MAX) || 'ACE';
  const promo = clean(body.promo, PROMO_MAX);
  // strict charset: the url is re-rendered on every player's screen
  const url = clean(body.url, URL_MAX).replace(/^https?:\/\//, '')
    .replace(/[^\w.\-\/:?=&#%~+@]/g, '');

  // price: outrank check is free (score-ordered); paying CLAIMS the slot —
  // minimum outprices the entry directly below the insertion point
  const rows = await boardEntries();
  const below = rows.find(r => score > Number(r.score));
  const min = below ? minClaimCents(below.bid_cents) : (rows.length ? minClaimCents(null) : FLOOR_CENTS);
  const bidCents = Math.round(Number(body.bidCents));
  if (!(bidCents >= min)) return json({ error: 'bid below minimum', minCents: min }, 400);
  if (bidCents > 99999999) return json({ error: 'bid too large' }, 400);

  let session;
  try {
    session = await stripe.checkout.sessions.create(sessionParams(bidCents, score, name, tok.id, level, promo, url));
  } catch (e) {
    return json({ error: 'stripe: ' + (e.message || 'checkout failed').slice(0, 200) }, 502);
  }
  return json({ url: session.url, minCents: min });
}

function sessionParams(bidCents, score, name, run, level, promo, url) {
  return {
    mode: 'payment',
    // cards take any currency; the account's local methods (e.g. MB Way/SEPA)
    // are EUR-only and would leave a USD session with no way to pay
    payment_method_types: ['card'],
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: bidCents,
        product_data: {
          name: 'DRONE RAID LEADERBOARD — POSITION CLAIM',
          description: score.toLocaleString('en-US') + ' PTS · ' + name,
        },
      },
    }],
    success_url: SITE + '/?claim=success&session={CHECKOUT_SESSION_ID}',
    cancel_url: SITE + '/?claim=cancel',
    metadata: { run, level, score, name, promo, url, bid_cents: bidCents },
  };
}
