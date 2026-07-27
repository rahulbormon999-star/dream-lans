-- ================= Dream Lens ডাটাবেজ স্কিমা (Neon Postgres) =================

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE,
  first_name TEXT,
  last_name TEXT,
  devonix_user_id INT,                      -- SSO দিয়ে Dev-Onix থেকে এলে সেই ইউজারের ID
  auth_provider TEXT NOT NULL DEFAULT 'email', -- 'email' | 'devonix'
  banned BOOLEAN DEFAULT FALSE,
  ban_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_devonix ON users(devonix_user_id);
CREATE INDEX IF NOT EXISTS idx_users_banned ON users(banned);

-- ইমেইল OTP (পাসওয়ার্ডহীন লগইন)
CREATE TABLE IF NOT EXISTS email_otps (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  ip TEXT,
  attempts INT DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps(email);

-- স্প্যাম রেজিস্ট্রেশন/OTP রিকোয়েস্ট ঠেকাতে rate-limit ট্র্যাকিং
CREATE TABLE IF NOT EXISTS otp_requests (
  id SERIAL PRIMARY KEY,
  ip TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otp_requests_created ON otp_requests(created_at);

-- প্রতিটা স্বপ্ন বিশ্লেষণের রেকর্ড (ফিডব্যাক ও "কী বেশি জিজ্ঞেস করা হচ্ছে" বিশ্লেষণের জন্য)
CREATE TABLE IF NOT EXISTS dream_logs (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  dream_text TEXT NOT NULL,
  ai_response TEXT,
  feedback TEXT,                            -- 'up' | 'down' | NULL
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dream_logs_user ON dream_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_dream_logs_created ON dream_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dream_logs_feedback ON dream_logs(feedback);

-- ভবিষ্যতের পেমেন্ট/সাবস্ক্রিপশন সিস্টেমের জন্য জায়গা প্রস্তুত রাখা (এখনই ব্যবহার হচ্ছে না)
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';   -- 'free' | 'pro' ইত্যাদি
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

-- অ্যাডমিন কার্যক্রমের audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  target_user_id INT,
  ip TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
