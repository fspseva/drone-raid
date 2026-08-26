import { boardEntries, json } from './_lib.js';

// GET /api/board            -> { entries: [{rank, name, promo, url, score, bid}] }
// GET /api/board?session=cs -> also { you: { rank, score, bid } } for that claim
export async function GET(request) {
  const session = new URL(request.url).searchParams.get('session');
  const rows = await boardEntries();
  let you = null;
  const entries = rows.map((r, i) => {
    const e = {
      rank: i + 1,
      name: r.name,
      promo: r.promo,
      url: r.url,
      score: Number(r.score),
      bid: r.bid_cents / 100,
    };
    if (session && r.stripe_session === session) you = e;
    return e;
  });
  return json({ entries, you });
}
