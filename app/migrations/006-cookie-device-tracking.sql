-- Cookie-backed free tier device tracking
-- Replaces localStorage UUID with HttpOnly cookie as authoritative key
-- Pre-launch: drop old table (no production data to preserve)

DROP TABLE IF EXISTS free_tier_usage;

CREATE TABLE free_tier_usage (
  cookie_id TEXT PRIMARY KEY,
  fingerprint_hash TEXT,
  ip_address TEXT,
  total_uses INTEGER NOT NULL DEFAULT 0,
  last_used TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fingerprint/IP cross-check when cookie is missing
CREATE INDEX IF NOT EXISTS idx_free_tier_fingerprint ON free_tier_usage(fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_free_tier_ip ON free_tier_usage(ip_address);
