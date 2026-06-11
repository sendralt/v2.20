# FishSmart Pro Pricing (Authoritative)

- Pro Monthly: $4.99/mo
- Pro Yearly: $29.99/yr (~$2.50/mo, 50% savings vs monthly)
- Free tier: 3 AI forecast uses (session-based, no billing)

Prices are defined in Stripe Dashboard. Server reads price IDs from env vars (`STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`) — never hardcoded.
