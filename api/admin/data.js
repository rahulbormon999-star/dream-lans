import { sql } from '../../lib/db.js';
import { isAdminSessionValid } from '../../lib/auth.js';
import { getUsageStats } from '../../lib/stats.js';

// সাধারণ Bengali/English স্টপ-ওয়ার্ড (কীওয়ার্ড অ্যানালিটিক্স থেকে বাদ দেওয়া হবে)
const STOPWORDS = new Set([
  'এবং', 'আমি', 'আমার', 'আমাকে', 'তুমি', 'তার', 'তাকে', 'এই', 'সেই', 'যে', 'কি', 'না',
  'হয়', 'হয়েছে', 'ছিল', 'ছিলাম', 'দেখলাম', 'দেখেছি', 'স্বপ্নে', 'স্বপ্ন', 'একটা', 'একটি',
  'তখন', 'পরে', 'সেখানে', 'কেন', 'কীভাবে', 'জন্য', 'সাথে', 'কিন্তু', 'অনেক', 'খুব',
  'the', 'a', 'an', 'is', 'was', 'i', 'my', 'me', 'in', 'on', 'and', 'of', 'to', 'it', 'that',
  'dream', 'dreamed', 'dreaming', 'saw'
]);

function extractTopKeywords(texts, topN = 25) {
  const freq = new Map();
  for (const text of texts) {
    const words = (text || '')
      .toLowerCase()
      .replace(/[.,!?;:()"'।]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !STOPWORDS.has(w));
    for (const w of words) {
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }));
}

export default async function handler(req, res) {
  if (!isAdminSessionValid(req)) {
    return res.status(401).json({ error: 'Admin session invalid, please login again' });
  }

  const mode = req.query.mode || 'stats';

  // ================= ব্যবহারের পরিসংখ্যান (দৈনিক/মাসিক/মোট, গ্রাফের জন্য) =================
  if (mode === 'stats') {
    try {
      const usage = await getUsageStats(14);

      const userGrowth = await sql`
        SELECT
          COUNT(*) AS total_users,
          COUNT(*) FILTER (WHERE created_at > now() - interval '1 day') AS new_today,
          COUNT(*) FILTER (WHERE created_at > now() - interval '7 days') AS new_last_7_days,
          COUNT(*) FILTER (WHERE created_at > now() - interval '30 days') AS new_last_30_days
        FROM users
      `;

      const dailySignups = await sql`
        SELECT DATE(created_at) AS day, COUNT(*) AS count
        FROM users
        WHERE created_at > now() - interval '14 days'
        GROUP BY DATE(created_at)
        ORDER BY day ASC
      `;

      const dreamStats = await sql`
        SELECT
          COUNT(*) AS total_dreams,
          COUNT(*) FILTER (WHERE feedback = 'up') AS total_up,
          COUNT(*) FILTER (WHERE feedback = 'down') AS total_down
        FROM dream_logs
      `;

      return res.status(200).json({
        usage,
        userGrowth: userGrowth[0],
        dailySignups,
        dreamStats: dreamStats[0]
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'সার্ভার এরর' });
    }
  }

  // ================= ফিডব্যাক তালিকা (পেজ-ভিত্তিক) =================
  if (mode === 'feedback') {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
      const offset = (page - 1) * limit;
      const filter = (req.query.filter || 'all').toLowerCase(); // all | up | down

      const countRows = await sql`
        SELECT COUNT(*) FROM dream_logs
        WHERE ${filter} = 'all' OR feedback = ${filter}
      `;
      const total = Number(countRows[0].count);

      const rows = await sql`
        SELECT d.id, d.dream_text, d.ai_response, d.feedback, d.created_at,
               u.id AS user_id, u.email, u.first_name, u.last_name
        FROM dream_logs d
        JOIN users u ON u.id = d.user_id
        WHERE ${filter} = 'all' OR d.feedback = ${filter}
        ORDER BY d.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      return res.status(200).json({ logs: rows, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'সার্ভার এরর' });
    }
  }

  // ================= জনপ্রিয় স্বপ্নের কীওয়ার্ড (RAG ডেটা তৈরির জন্য কাজে লাগবে) =================
  if (mode === 'keywords') {
    try {
      const rows = await sql`
        SELECT dream_text FROM dream_logs ORDER BY created_at DESC LIMIT 500
      `;
      const keywords = extractTopKeywords(rows.map(r => r.dream_text));
      return res.status(200).json({ keywords, sampleSize: rows.length });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'সার্ভার এরর' });
    }
  }

  return res.status(400).json({ error: 'সঠিক mode প্রয়োজন' });
}
