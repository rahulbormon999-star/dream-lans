import jwt from 'jsonwebtoken';
import crypto from 'crypto';

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      cookies[key] = decodeURIComponent(val);
    }
  });
  return cookies;
}

// ================= ইউজার সেশন (Dream Lens এর নিজস্ব) =================
export function getUserIdFromRequest(req) {
  const cookies = parseCookies(req);
  const token = cookies.dl_session;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload.userId;
  } catch {
    return null;
  }
}

export function setSessionCookie(res, userId) {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '90d' });
  res.setHeader(
    'Set-Cookie',
    `dl_session=${token}; HttpOnly; Path=/; Max-Age=${90 * 24 * 60 * 60}; SameSite=Lax; Secure`
  );
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `dl_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure`);
}

// ================= অ্যাডমিন সেশন =================
export function verifyAdminPassword(inputPassword) {
  const real = process.env.ADMIN_PASSWORD || '';
  const input = inputPassword || '';

  if (!real) {
    // env variable-ই সেট করা নেই, এটা "ভুল পাসওয়ার্ড" থেকে আলাদা সমস্যা
    return 'MISSING_ENV';
  }

  const realBuf = Buffer.from(real);
  const inputBuf = Buffer.from(input);
  if (realBuf.length !== inputBuf.length) {
    crypto.timingSafeEqual(Buffer.alloc(realBuf.length), Buffer.alloc(realBuf.length));
    return false;
  }
  return crypto.timingSafeEqual(realBuf, inputBuf);
}

export function setAdminSessionCookie(res) {
  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.setHeader(
    'Set-Cookie',
    `dl_admin_session=${token}; HttpOnly; Path=/; Max-Age=${12 * 60 * 60}; SameSite=Strict; Secure`
  );
}

export function clearAdminSessionCookie(res) {
  res.setHeader('Set-Cookie', `dl_admin_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict; Secure`);
}

export function isAdminSessionValid(req) {
  const cookies = parseCookies(req);
  const token = cookies.dl_admin_session;
  if (!token) return false;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

// ================= SSO টোকেন যাচাই (Dev-Onix থেকে আসা) =================
// দ্রষ্টব্য: এখানে Dev-Onix এর SSO_SHARED_SECRET ব্যবহার হয়, Dream Lens এর নিজের JWT_SECRET না
export function verifySsoToken(token) {
  try {
    const payload = jwt.verify(token, process.env.SSO_SHARED_SECRET);
    if (payload.purpose !== 'sso') return null;
    return payload;
  } catch {
    return null;
  }
}
