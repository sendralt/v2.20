-- Persistent free tier usage tracking per device fingerprint
-- Prevents abuse by persisting usage across server restarts

CREATE TABLE IF NOT EXISTS free_tier_usage (
  fingerprint_hash TEXT PRIMARY KEY,
  total_uses INTEGER NOT NULL DEFAULT 0,
  last_used TIMESTAMPTZ NOT NULL DEFAULT now()
);
