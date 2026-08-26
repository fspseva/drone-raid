import { sql, ensureSchema } from './_lib.js';

export async function GET() {
  const out = {
    db: false,
    stripeMode: (process.env.STRIPE_SECRET_KEY || '').includes('_live_') ? 'live'
      : (process.env.STRIPE_SECRET_KEY || '').includes('_test_') ? 'test' : 'missing',
    webhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
    runTokenSecret: !!process.env.RUN_TOKEN_SECRET,
  };
  try {
    await ensureSchema();
    const r = await sql`SELECT count(*)::int AS n FROM entries`;
    out.db = true;
    out.entries = r[0].n;
  } catch (e) {
    out.dbError = String(e.message || e).slice(0, 200);
  }
  return new Response(JSON.stringify(out), {
    status: out.db ? 200 : 500,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
