// Replay verification: run the SAME game code the players run (fetched from
// this deployment) inside jsdom, feed it the recorded inputs, and let it
// recompute the score. The sim uses only exact IEEE ops + a seeded PRNG
// (see "deterministic toolkit" in index.html), so the result is bit-exact.
import { JSDOM, VirtualConsole } from 'jsdom';
import { SITE } from './_lib.js';

let cachedHtml = null, cachedAt = 0;
async function gameHtml() {
  if (cachedHtml && Date.now() - cachedAt < 60_000) return cachedHtml;
  const r = await fetch(SITE + '/', { headers: { 'user-agent': 'droneraid-verifier' } });
  if (!r.ok) throw new Error('cannot fetch game html: ' + r.status);
  cachedHtml = await r.text();
  cachedAt = Date.now();
  return cachedHtml;
}

export async function verifyReplay(replay, seed) {
  const vw = Math.round(Number(replay.vw));
  if (!(vw >= 320 && vw <= 432 && vw % 2 === 0)) return { ok: false, error: 'bad viewport' };
  const html = await gameHtml();
  const vc = new VirtualConsole();   // swallow the game's console noise
  const dom = new JSDOM(html, {
    url: SITE + '/',
    runScripts: 'dangerously',
    virtualConsole: vc,
    beforeParse(w) {
      w.__VERIFY__ = true;
      // reproduce the recorded viewport: VW = round(VH*AR/2)*2 with AR=vw/180
      Object.defineProperty(w, 'innerWidth', { value: vw, configurable: true });
      Object.defineProperty(w, 'innerHeight', { value: 180, configurable: true });
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.requestAnimationFrame = () => 0;
      w.fetch = () => Promise.resolve({ ok: true, json: async () => ({}), text: async () => '' });
      const noopCtx = new Proxy({}, { get: (t, p) => (typeof p === 'string' ? () => {} : undefined), set: () => true });
      w.HTMLCanvasElement.prototype.getContext = () => noopCtx;
    },
  });
  try {
    const run = dom.window.__verifyRun;
    if (typeof run !== 'function') return { ok: false, error: 'verifier entry missing' };
    const res = run({ ...replay, seed });
    return res && typeof res === 'object' ? res : { ok: false, error: 'no result' };
  } finally {
    dom.window.close();
  }
}
