import { sql } from '../../lib/db.js';
import { isAdminSessionValid } from '../../lib/auth.js';
import { getClientIp } from '../../lib/security.js';

export default async function handler(req, res) {
  if (!isAdminSessionValid(req)) {
    return res.status(401).json({ error: 'Admin session invalid, please login again' });
  }

  if (req.method === 'GET') {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
      const offset = (page - 1) * limit;
      const search = (req.query.search || '').trim();
      const pattern = `%${search}%`;

      const statsRows = await sql`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE auth_provider = 'devonix') AS via_devonix,
          COUNT(*) FILTER (WHERE auth_provider = 'email') AS via_email,
          COUNT(*) FILTER (WHERE banned = true) AS banned
        FROM users
      `;

      const countRows = await sql`
        SELECT COUNT(*) FROM users
        WHERE ${search} = '' OR first_name ILIKE ${pattern} OR last_name ILIKE ${pattern} OR email ILIKE ${pattern}
      `;
      const total = Number(countRows[0].count);

      const rows = await sql`
        SELECT id, email, first_name, last_name, auth_provider, banned, ban_reason, created_at,
               (SELECT COUNT(*) FROM dream_logs d WHERE d.user_id = users.id) AS dream_count
        FROM users
        WHERE ${search} = '' OR first_name ILIKE ${pattern} OR last_name ILIKE ${pattern} OR email ILIKE ${pattern}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      return res.status(200).json({
        users: rows, total, page, limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        stats: statsRows[0]
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'সার্ভার এরর' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { id, action, reason } = req.body || {};
      if (!id || !['delete', 'ban', 'unban'].includes(action)) {
        return res.status(400).json({ error: 'সঠিক id ও action প্রয়োজন' });
      }

      const ip = getClientIp(req);

      if (action === 'delete') {
        await sql`DELETE FROM users WHERE id = ${id}`;
        await sql`INSERT INTO audit_log (action, target_user_id, ip) VALUES ('delete_user', ${id}, ${ip})`;
      } else if (action === 'ban') {
        await sql`UPDATE users SET banned = TRUE, ban_reason = ${reason || null} WHERE id = ${id}`;
        await sql`INSERT INTO audit_log (action, target_user_id, ip) VALUES ('ban_user', ${id}, ${ip})`;
      } else if (action === 'unban') {
        await sql`UPDATE users SET banned = FALSE, ban_reason = NULL WHERE id = ${id}`;
        await sql`INSERT INTO audit_log (action, target_user_id, ip) VALUES ('unban_user', ${id}, ${ip})`;
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'সার্ভার এরর' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
          }
