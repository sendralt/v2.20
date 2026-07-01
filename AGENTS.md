# AGENTS.md — FishSmart Pro

> AI agent instructions for working on this codebase.
> Read this file before making any changes.

---

## Project Overview

**FishSmart Pro** is an AI-powered fishing intelligence PWA that combines live weather data, USGS water temperatures, and a multi-factor scientific engine with Google Gemini AI to produce detailed, transparent fishing forecasts.

- **Version:** 2.19
- **License:** MIT
- **Repo:** https://github.com/sendralt/v2.20.git
- **Deployment:** Render (Node.js web service)
- **Android:** Published on Google Play as a Trusted Web Activity (TWA)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js ≥ 18.0.0 |
| Framework | Express.js |
| AI | Google Gemini (`@google/generative-ai`) |
| Database | PostgreSQL (`pg`) |
| Payments | Stripe Billing + Google Play Billing |
| Frontend | Tailwind CSS 3.x, Vanilla JS, DOMPurify (XSS hardening) |
| PWA | Service Worker, Web App Manifest |
| Android | Bubblewrap TWA wrapper (Gradle) |
| Security | Helmet, strict CSP, input sanitization, HttpOnly cookies |
| Dependencies | express, helmet, cookie-parser, express-rate-limit, stripe, googleapis, jsdom, dompurify, dotenv |

---

## Monorepo Structure

```
fshsmrtpro/
├── app/                    # Core PWA application (npm workspace)
│   ├── server.js           # Express server entry point
│   ├── src/
│   │   ├── config/         # Environment configuration (env.js)
│   │   ├── data/           # Data loader (species, lures, fishing data)
│   │   ├── engine/         # Scientific engine modules
│   │   │   ├── bite-score.js
│   │   │   ├── activity-forecast.js
│   │   │   ├── lunar.js
│   │   │   ├── water-temp.js
│   │   │   ├── metabolic.js
│   │   │   ├── spawning.js
│   │   │   ├── dissolved-oxygen.js
│   │   │   ├── thermocline.js
│   │   │   ├── pressure-trend.js
│   │   │   ├── photoperiod.js
│   │   │   └── lure-scorer.js
│   │   ├── middleware/     # Auth, CSP, sanitization, billing, free-tier
│   │   ├── routes/         # API, billing, webhooks
│   │   ├── services/       # AI, weather, Stripe, Google Play, DB, history
│   │   ├── lib/            # Shared utilities (safe-fetch)
│   │   └── input.css       # Tailwind source CSS
│   ├── data/               # Static JSON data (lures, fishingData)
│   ├── migrations/         # SQL migrations (001–007)
│   ├── public/             # Static frontend (HTML, CSS, JS, icons, SW)
│   ├── tests/              # Node.js native test runner tests
│   └── package.json
├── android/                # TWA wrapper (Gradle, keystore, manifest)
├── landing-page/           # Marketing site (static HTML/CSS/JS)
├── store-assets/           # Play Store screenshots & listing
├── docs/                   # Specs, plans, research, DOX-TREE.md
├── tools/                  # sync-versions.js
├── server.js               # Root entry → delegates to app/server.js
├── package.json            # Monorepo root (workspaces: ["app"])
├── .env                    # Environment variables (gitignored)
├── README.md
└── CHANGELOG.md
```

---

## Development Commands

All commands run from the **monorepo root** unless noted.

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with auto-rebuild CSS + `--watch` |
| `npm start` | Start production server |
| `npm run build:css` | Build & minify Tailwind CSS output |
| `npm test` | Run test suite (`node --test tests/*.test.js`) |
| `npm run sync-versions` | Dry-run version sync across files |
| `npm run sync-versions:write` | Write synced version changes |

**CSS rebuild** runs automatically as a `predev` hook before `npm run dev`.

---

## Environment Variables

All secrets live in the root `.env` file (gitignored). The app loads via:
```js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
```

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | Google Gemini AI for forecast generation |
| `IPGEOLOCATION_API_KEY` | IP-based geolocation fallback |
| `OPENWEATHER_API_KEY` | Live weather data |
| `DATABASE_URL` | PostgreSQL connection string |
| `STRIPE_SECRET_KEY` | Stripe API key for billing |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification |
| `STRIPE_PRICE_MONTHLY` | Stripe price ID for Pro Monthly ($4.99/mo) |
| `STRIPE_PRICE_YEARLY` | Stripe price ID for Pro Yearly ($29.99/yr) |
| `STRIPE_PORTAL_CONFIG_ID` | Stripe customer portal configuration ID |
| `APP_URL` | Public app URL (for redirects, CORS, webhooks) |

> **Never hardcode prices or API keys.** Price IDs come from Stripe Dashboard → env vars.

---

## Pricing (Authoritative)

| Tier | Price |
|------|-------|
| Free | 3 AI forecast uses (session-based, no billing) |
| Pro Monthly | $4.99/mo |
| Pro Yearly | $29.99/yr (~$2.50/mo, 50% savings) |

---

## Architecture Notes

### Server
- Root `server.js` delegates to `app/server.js` (keeps Render deployment path unchanged).
- Express middleware chain order: **strictCSP → Helmet → cookieParser → body parsers → sanitization → URI validation → static files → routes**.
- Webhook routes (`/api/webhooks`) skip JSON parsing — they use `express.raw()` for Stripe signature verification.
- A global `fetch` patch disables gzip for external HTTPS APIs (Node fetch doesn't auto-decompress).

### Scientific Engine (`src/engine/`)
Deterministic, testable modules — **not** AI-generated:
- `bite-score.js` — Multi-factor AI Bite Score™ (pressure, metabolic, water temp, wind, clarity, time)
- `activity-forecast.js` — 12-hour hourly activity derived from engine factors
- `lunar.js` — Deterministic moon phase calculation (never AI-guessed)
- `water-temp.js` — USGS real-time water temperature integration
- `metabolic.js`, `spawning.js`, `dissolved-oxygen.js`, `thermocline.js`, `pressure-trend.js`, `photoperiod.js`

### AI Service (`src/services/ai.js`)
- Uses Gemini to generate natural-language fishing strategy from engine data.
- Moon phase is **computed deterministically** via `lunar.js` and injected into the prompt — the AI is instructed not to guess it.
- Offline fallback returns engine-derived strategy without AI.

### Billing
- Stripe Billing for web (subscriptions via Stripe Checkout + Customer Portal).
- Google Play Billing for Android TWA in-app purchases.
- `entitlement-service.js` unifies entitlement checks across both providers.

### Database
- PostgreSQL with 7 migration files (`app/migrations/001-007`).
- Covers: Stripe billing, device tracking (HttpOnly cookies), forecast history, promo codes, free-tier usage.

### Security
- Strict Content Security Policy (custom middleware, overrides Helmet CSP).
- Input sanitization + URI validation middleware.
- DOMPurify on all client-side HTML rendering.
- HttpOnly cookies for device tracking (no localStorage tokens).
- Rate limiting via `express-rate-limit`.

---

## Testing

Tests use Node.js native test runner (`node --test`):

```bash
npm test                    # Run all tests
node --test app/tests/*.test.js  # Run from app directory
```

Key test files: `engine-integration.test.js`, `bite-score.test.js`, `lunar.test.js`, `activity-forecast.test.js`, `ai.test.js`, `free-tier.test.js`, `lure-scorer.test.js`, etc.

---

## Coding Conventions

1. **Vanilla JS only** — No React, Vue, or frontend frameworks. Frontend is plain HTML/CSS/JS.
2. **CommonJS modules** — Use `require()` / `module.exports`, not ESM `import/export`.
3. **Strict mode** — Every file starts with `'use strict';`.
4. **`'use strict'`** at the top of every JS file.
5. **No hardcoded secrets** — All keys/IDs via environment variables.
6. **No hardcoded prices** — Stripe price IDs from env vars.
7. **Deterministic engine values** — Moon phase, bite scores, and activity forecasts must be computed, never AI-guessed.
8. **Security-first** — Sanitize all inputs, validate URIs, use DOMPurify on client rendering.
9. **Atomic commits** — Follow Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, etc.).
10. **Test before ship** — Run `npm test` before any commit.

---

## Version Sync

Versions are kept in sync across `package.json` (root + app), `android/app/build.gradle`, `twa-manifest.json`, and `CHANGELOG.md` using:

```bash
npm run sync-versions        # Check for drifts (dry run)
npm run sync-versions:write # Fix drifts automatically
```

When bumping the version, update in this order or use the sync tool.

---

## Git Workflow

- **Branch** for all features and fixes (no direct commits to main).
- **Conventional Commits** format for all messages.
- **Atomic commits** — one logical change per commit.
- **PR description** should explain what, why, and how.
- Run `npm test` before opening a PR.

---

## Key Files to Know

| File | Why It Matters |
|------|---------------|
| `app/server.js` | Main Express app setup, middleware chain, route mounting |
| `app/src/config/env.js` | Centralized environment variable validation |
| `app/src/engine/*.js` | Scientific calculation modules — the core IP |
| `app/src/services/ai.js` | Gemini AI integration + offline fallback |
| `app/src/services/stripe.js` | Stripe billing logic |
| `app/src/services/google-play-billing.js` | Android IAP verification |
| `app/src/middleware/free-tier-check.js` | Free tier enforcement (3 uses/session) |
| `app/src/middleware/billing-auth.js` | Pro entitlement verification |
| `app/migrations/*.sql` | Database schema changes |
| `tools/sync-versions.js` | Cross-file version synchronization |
| `.env` | All environment secrets (never commit) |

---

## Do NOT

- ❌ Do not rename the project directory or modify `.a0proj/`
- ❌ Do not hardcode API keys, prices, or secrets
- ❌ Do not commit `.env` files
- ❌ Do not let AI guess deterministic values (moon phase, scores)
- ❌ Do not skip the security middleware chain when adding routes
- ❌ Do not add frontend frameworks (React/Vue) — this is a vanilla JS PWA
- ❌ Do not modify `package-lock.json` manually
