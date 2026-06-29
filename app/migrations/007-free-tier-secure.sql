-- Secure anonymous free-tier tracking (stateless HMAC token + IP/device fallback)
-- Replaces phantom account creation and in-memory sessions for anonymous users.
-- Table name is _v2 to avoid conflicts with the existing free_tier_usage table
-- created by migrations 003/006.

CREATE TABLE IF NOT EXISTS free_tier_usage_v2 (
  ip_hash TEXT PRIMARY KEY,
  device_hash TEXT,
  total_uses INTEGER NOT NULL DEFAULT 0,
  first_used TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_free_tier_v2_device ON free_tier_usage_v2(device_hash);
