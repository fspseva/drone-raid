import { issueRunToken, json } from './_lib.js';

// POST /api/run-start -> { token }  (issued when a campaign starts; one claim each)
export async function POST(request) {
  return json({ token: await issueRunToken() });
}
