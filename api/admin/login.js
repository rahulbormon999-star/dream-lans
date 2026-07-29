import { verifyAdminPassword, setAdminSessionCookie } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password } = req.body || {};
  const result = verifyAdminPassword(password);

  if (result === 'MISSING_ENV') {
    return res.status(500).json({ error: 'সার্ভারে ADMIN_PASSWORD এখনো সেট করা হয়নি (Vercel Environment Variables চেক করুন)' });
  }

  if (!result) {
    return res.status(401).json({ error: 'ভুল পাসওয়ার্ড' });
  }

  setAdminSessionCookie(res);
  return res.status(200).json({ success: true });
}
