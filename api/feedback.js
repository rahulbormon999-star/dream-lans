import { sql } from '../lib/db.js';
import { getUserIdFromRequest } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: 'Not logged in' });

  try {
    const { logId, feedback } = req.body || {};
    if (!logId || !['up', 'down'].includes(feedback)) {
      return res.status(400).json({ error: 'সঠিক logId ও feedback প্রয়োজন' });
    }

    // নিজের dream_log এই ফিডব্যাক দিতে পারবে, অন্যেরটায় না
    await sql`UPDATE dream_logs SET feedback = ${feedback} WHERE id = ${logId} AND user_id = ${userId}`;

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'সার্ভার এরর' });
  }
}
