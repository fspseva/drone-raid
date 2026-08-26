import { issueRunToken, json } from './_lib.js';

// POST /api/run-start -> { token, seed }  (a signed campaign run: the seed
// drives the sim's PRNG; the recorded replay is verified against it at claim)
export async function POST() {
  return json(await issueRunToken());
}
