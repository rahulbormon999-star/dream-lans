import crypto from 'crypto';

export function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

export function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

export function verifyOtpHash(otp, hash) {
  const inputHash = hashOtp(otp);
  const a = Buffer.from(inputHash);
  const b = Buffer.from(hash);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
