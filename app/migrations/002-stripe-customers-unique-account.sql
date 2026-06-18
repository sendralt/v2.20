-- Enforce one Stripe customer per account.
-- Prevents the race in getOrCreateCustomer where two concurrent requests
-- could create two Stripe customers for the same accountId.
-- Run against PostgreSQL 15+.

CREATE UNIQUE INDEX IF NOT EXISTS uq_stripe_customers_account_id
  ON stripe_customers(account_id);
