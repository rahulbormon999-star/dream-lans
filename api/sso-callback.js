import { sql } from '../lib/db.js';
import { verifySsoToken, setSessionCookie } from '../lib/auth.js';

export default async function handler(req, res) {
  const token = req.query.token;
  if (!token) {
    return res.redirect(302, '/?ssoError=' + encodeURIComponent('টোকেন পাওয়া যায়নি'));
  }

  const payload = verifySsoToken(token);
  if (!payload) {
    return res.redirect(302, '/?ssoError=' + encodeURIComponent('টোকেনের মেয়াদ শেষ, আবার চেষ্টা করুন'));
  }

  try {
    // devonix_user_id দিয়ে আগে থেকে একাউন্ট থাকলে খোঁজা হচ্ছে
    let rows = await sql`SELECT id, banned FROM users WHERE devonix_user_id = ${payload.userId}`;
    let userId;

    if (rows.length === 0) {
      // Dev-Onix থেকে আসা ইমেইল দিয়ে আগে email-login করা কোনো একাউন্ট থাকলে সেটার সাথে যুক্ত করা হচ্ছে
      const byEmail = payload.email ? await sql`SELECT id, banned FROM users WHERE email = ${payload.email}` : [];

      if (byEmail.length > 0) {
        if (byEmail[0].banned) return res.redirect(302, '/?ssoError=' + encodeURIComponent('একাউন্ট ব্যান করা হয়েছে'));
        userId = byEmail[0].id;
        await sql`
          UPDATE users SET devonix_user_id = ${payload.userId}, auth_provider = 'devonix',
                 first_name = COALESCE(first_name, ${payload.firstName || null}),
                 last_name = COALESCE(last_name, ${payload.lastName || null})
          WHERE id = ${userId}
        `;
      } else {
        const inserted = await sql`
          INSERT INTO users (email, first_name, last_name, devonix_user_id, auth_provider)
          VALUES (${payload.email || null}, ${payload.firstName || null}, ${payload.lastName || null}, ${payload.userId}, 'devonix')
          RETURNING id
        `;
        userId = inserted[0].id;
      }
    } else {
      if (rows[0].banned) return res.redirect(302, '/?ssoError=' + encodeURIComponent('একাউন্ট ব্যান করা হয়েছে'));
      userId = rows[0].id;
      // প্রতিবার Dev-Onix থেকে সবশেষ নাম/ইমেইল সিঙ্ক করে রাখা হচ্ছে
      await sql`
        UPDATE users SET first_name = ${payload.firstName || null}, last_name = ${payload.lastName || null},
               email = COALESCE(${payload.email || null}, email)
        WHERE id = ${userId}
      `;
    }

    setSessionCookie(res, userId);
    return res.redirect(302, '/');
  } catch (err) {
    console.error(err);
    return res.redirect(302, '/?ssoError=' + encodeURIComponent('সার্ভার এরর, আবার চেষ্টা করুন'));
  }
}
