import { sql } from '../lib/db.js';
import { generateOtp, hashOtp, verifyOtpHash } from '../lib/otp.js';
import { sendOtpEmail } from '../lib/email.js';
import { getClientIp, isValidEmail } from '../lib/security.js';
import { setSessionCookie } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body || {};
  if (action === 'request') return handleRequest(req, res);
  if (action === 'verify') return handleVerify(req, res);
  return res.status(400).json({ error: 'সঠিক action প্রয়োজন' });
}

// ================= ধাপ ১: ইমেইলে OTP পাঠানো =================
async function handleRequest(req, res) {
  try {
    const { email } = req.body || {};
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'সঠিক ইমেইল দিন' });
    }

    const existing = await sql`SELECT id, banned FROM users WHERE email = ${email}`;
    if (existing.length > 0 && existing[0].banned) {
      return res.status(403).json({ error: 'এই একাউন্ট ব্যান করা হয়েছে' });
    }

    // Rate limit: একই ইমেইলে ১৫ মিনিটে সর্বোচ্চ ৩ বার
    const recentForEmail = await sql`
      SELECT COUNT(*) FROM email_otps WHERE email = ${email} AND created_at > now() - interval '15 minutes'
    `;
    if (Number(recentForEmail[0].count) >= 3) {
      return res.status(429).json({ error: 'অনেকবার কোড পাঠানো হয়েছে, ১৫ মিনিট পর আবার চেষ্টা করুন' });
    }

    // Rate limit: একই IP থেকে ১ ঘণ্টায় সর্বোচ্চ ১০ বার
    const ip = getClientIp(req);
    const recentForIp = await sql`
      SELECT COUNT(*) FROM email_otps WHERE ip = ${ip} AND created_at > now() - interval '1 hour'
    `;
    if (Number(recentForIp[0].count) >= 10) {
      return res.status(429).json({ error: 'অনেকবার চেষ্টা হয়েছে, কিছুক্ষণ পর আবার চেষ্টা করুন' });
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);

    await sql`DELETE FROM email_otps WHERE email = ${email}`;
    await sql`
      INSERT INTO email_otps (email, otp_hash, ip, expires_at)
      VALUES (${email}, ${otpHash}, ${ip}, now() + interval '10 minutes')
    `;

    await sendOtpEmail(email, otp);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'কোড পাঠানো যায়নি, পরে আবার চেষ্টা করুন' });
  }
}

// ================= ধাপ ২: OTP যাচাই + লগইন/রেজিস্ট্রেশন (একই ধাপে) =================
async function handleVerify(req, res) {
  try {
    const { email, otp } = req.body || {};
    if (!isValidEmail(email) || !otp) {
      return res.status(400).json({ error: 'ইমেইল ও কোড প্রয়োজন' });
    }

    const otpRows = await sql`SELECT otp_hash, expires_at, attempts FROM email_otps WHERE email = ${email}`;
    if (otpRows.length === 0) {
      return res.status(400).json({ error: 'কোনো কোড পাওয়া যায়নি, আগে কোড চান' });
    }
    const otpRow = otpRows[0];

    if (new Date(otpRow.expires_at) < new Date()) {
      await sql`DELETE FROM email_otps WHERE email = ${email}`;
      return res.status(400).json({ error: 'কোডের মেয়াদ শেষ হয়ে গেছে, নতুন কোড চান' });
    }

    if (otpRow.attempts >= 5) {
      await sql`DELETE FROM email_otps WHERE email = ${email}`;
      return res.status(429).json({ error: 'অনেকবার ভুল কোড দেওয়া হয়েছে, নতুন কোড চান' });
    }

    if (!verifyOtpHash(otp, otpRow.otp_hash)) {
      await sql`UPDATE email_otps SET attempts = attempts + 1 WHERE email = ${email}`;
      return res.status(400).json({ error: 'কোড সঠিক নয়' });
    }

    // কোড ঠিক থাকলে ইউজার থাকলে লগইন, না থাকলে নতুন একাউন্ট তৈরি (এক ধাপেই)
    let rows = await sql`SELECT id, banned FROM users WHERE email = ${email}`;
    let userId;

    if (rows.length === 0) {
      const inserted = await sql`
        INSERT INTO users (email, auth_provider) VALUES (${email}, 'email') RETURNING id
      `;
      userId = inserted[0].id;
    } else {
      if (rows[0].banned) return res.status(403).json({ error: 'এই একাউন্ট ব্যান করা হয়েছে' });
      userId = rows[0].id;
    }

    await sql`DELETE FROM email_otps WHERE email = ${email}`;
    setSessionCookie(res, userId);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'লগইন করা যায়নি, পরে আবার চেষ্টা করুন' });
  }
                                                                              }
