import { verifyAdminPassword, setAdminSessionCookie } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { password } = req.body || {};
    const result = verifyAdminPassword(password);

    if (result === 'MISSING_ENV') {
      return res.status(500).json({ error: 'সার্ভারে ADMIN_PASSWORD এখনো সেট করা হয়নি (Vercel Environment Variables চেক করুন)' });
    }

    if (!result) {
      return res.status(401).json({ error: 'ভুল পাসওয়ার্ড' });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: 'সার্ভারে JWT_SECRET এখনো সেট করা হয়নি (Vercel Environment Variables চেক করুন)' });
    }

    setAdminSessionCookie(res);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    // ================= সাময়িক ডিবাগিং (সমস্যা ধরার পর এই লাইনটা বদলে ফেলবেন) =================
    return res.status(500).json({ error: 'সার্ভার এরর: ' + (err.message || 'Unknown error') });
  }
}
