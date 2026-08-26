import { sql, stripe, ensureSchema } from './_lib.js';

// Stripe -> POST /api/stripe-webhook (checkout.session.completed only).
// The ONLY writer of the board: inserts the paid entry at its score position.
// Insert-by-score makes concurrent payments commutative; unique session id
// makes Stripe's retries idempotent. No refunds, no races, nothing else.
export async function POST(request) {
  const raw = await request.text();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      raw, request.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return new Response('bad signature', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const m = s.metadata || {};
    // only sessions our /api/claim created carry a run id — ignore anything else
    // (e.g. dashboard "send test event" payloads)
    if (!m.run) return new Response('ignored', { status: 200 });
    await ensureSchema();
    await sql`INSERT INTO entries (name, promo, url, score, bid_cents, stripe_session, email)
              VALUES (${m.name || 'ACE'}, ${m.promo || ''}, ${m.url || ''},
                      ${Math.floor(Number(m.score) || 0)},
                      ${Math.round(Number(m.bid_cents) || 0)},
                      ${s.id}, ${s.customer_details?.email || null})
              ON CONFLICT (stripe_session) DO NOTHING`;
    if (m.run) await sql`UPDATE runs SET used = true WHERE id = ${m.run}`;
  }
  return new Response('ok', { status: 200 });
}
