import { sql } from '../lib/db.js';
import { getUserIdFromRequest } from '../lib/auth.js';

export default async function handler(req, res) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: 'Not logged in' });

  try {
    const rows = await sql`SELECT id, email, first_name, last_name, banned, auth_provider FROM users WHERE id = ${userId}`;
    if (rows.length === 0) return res.status(401).json({ error: 'অ্যাকাউন্ট আর নেই' });
    if (rows[0].banned) return res.status(403).json({ error: 'আপনার একাউন্ট ব্যান করা হয়েছে' });

    return res.status(200).json({ user: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'সার্ভার এরর' });
  }
}
