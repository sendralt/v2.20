-- Billing device links
-- FIX: subscribers lost premium after session-token rotation (24h expiry, Render
-- restarts wiping the in-memory session store, 401 auto-recovery minting new tokens).
-- billing_sessions binds a billing account to ONE token hash; every rotation orphaned
-- the link and silently demoted the subscriber to the free tier (paywall every 3rd
-- forecast, even after subscribing or restoring).

-- Stable device identity: the HttpOnly fishsmart_did cookie (already tracked by
-- migration 006) becomes the durable key linking a device to its billing account.

CREATE TABLE IF NOT EXISTS billing_device_links (
  cookie_id TEXT PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_device_links_account ON billing_device_links(account_id);

-- Backfill: seed device links from existing billing sessions where possible.
-- There is no historical join key between billing_sessions and the device cookie,
-- so links are established lazily by the billing-link-service on first contact.
