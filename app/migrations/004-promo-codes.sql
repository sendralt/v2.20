-- Promo code system for FishSmart Pro
-- Codes are inserted directly into the DB by admin

CREATE TABLE IF NOT EXISTS promo_codes (
  code TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('unlimited', 'timed')),
  duration_days INTEGER,              -- NULL for unlimited, days for timed
  max_redemptions INTEGER,            -- NULL = no global limit
  times_redeemed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  code TEXT NOT NULL REFERENCES promo_codes(code) ON DELETE CASCADE,
  fingerprint_hash TEXT NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (code, fingerprint_hash)
);
