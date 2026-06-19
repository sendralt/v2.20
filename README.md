# FishSmart Pro 🎣

> AI-powered fishing intelligence platform with real-time environmental analysis and science-backed bite predictions.

FishSmart Pro is a privacy-first Progressive Web App (PWA) that combines live weather data, USGS water temperatures, and a multi-factor scientific engine with Gemini AI to produce detailed fishing forecasts — explaining *why* fish will bite, not just *if*.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![Version](https://img.shields.io/badge/version-2.19-blue)](CHANGELOG.md)

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| **AI Bite Score™** | Scientific multi-factor scoring (pressure trend, metabolic efficiency, water temp, wind, clarity, time-of-day) with transparent reasoning |
| **12-Hour Activity Forecast** | Hourly bite activity derived from engine factors — not guessed by an LLM |
| **Live Water Temperature** | Real-time data from USGS monitoring stations |
| **Smart Lure Picks** | Species-specific lure recommendations with match scoring |
| **20+ Freshwater Species** | Bass, walleye, trout, pike, crappie, catfish and more |
| **Forecast History** | Up to 50 past forecasts per device with JSON/CSV export |
| **Offline Mode** | Service Worker caching with Stale-While-Revalidate for history endpoints |
| **Privacy-First** | No social features. No spot burning. Your fishing spots stay yours. |
| **PWA + Android TWA** | Installable on any device; published on Google Play as a Trusted Web Activity |

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js ≥ 18.0.0 |
| **Framework** | Express.js |
| **AI** | Google Gemini (`@google/generative-ai`) |
| **Database** | PostgreSQL (`pg`) |
| **Payments** | Stripe Billing + Google Play Billing |
| **Frontend** | Tailwind CSS, Vanilla JS, DOMPurify (XSS hardening) |
| **PWA** | Service Worker, Web App Manifest |
| **Android** | Bubblewrap TWA wrapper |
| **Security** | Helmet, strict CSP, input sanitization, HttpOnly cookies |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18.0.0
- **PostgreSQL** database (or Render/Neon hosted instance)
- API keys for external services (see [Environment Variables](#-environment-variables))

### Installation

```bash
# Clone the repository
git clone https://github.com/sendralt/v2.20.git
cd v2.20

# Install dependencies (from monorepo root)
npm install

# Copy environment template and fill in values
cp app/.env.example app/.env
# Edit app/.env with your API keys

# Build Tailwind CSS (required before first run)
npm run build:css

# Start development server
npm run dev
# → App running at http://localhost:3000
```

### Production

```bash
npm start
# → Server starts on PORT (default: 3000)
```

---

## 🔧 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | ✅ Yes | Google Gemini AI API key for forecast generation |
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string |
| `OPENWEATHER_API_KEY` | ✅ Yes | OpenWeather API key for live weather data |
| `IPGEOLOCATION_API_KEY` | ⬜ No | IP geolocation for default location detection |
| `PORT` | ⬜ No | Server port (default: `3000`) |
| `NODE_ENV` | ⬜ No | Environment: `development` or `production` |
| `APP_URL` | ⬜ No | Public app URL for OAuth/callbacks (default: `http://localhost:3000`) |
| **Rate Limiting** | | |
| `RATE_LIMIT_WINDOW_MS` | ⬜ No | Rate limit window in ms (default: `900000` = 15 min) |
| `RATE_LIMIT_MAX` | ⬜ No | Max requests per window (default: `10`) |
| **Stripe Billing** | | |
| `STRIPE_SECRET_KEY` | ⬜ No | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | ⬜ No | Stripe webhook signing secret |
| `STRIPE_PUBLISHABLE_KEY` | ⬜ No | Stripe publishable key for client-side |
| `STRIPE_PRICE_MONTHLY` | ⬜ No | Stripe Price ID for Pro Monthly ($4.99/mo) |
| `STRIPE_PRICE_YEARLY` | ⬜ No | Stripe Price ID for Pro Yearly ($29.99/yr) |
| `STRIPE_PORTAL_CONFIG_ID` | ⬜ No | Stripe Customer Portal configuration ID |
| **Google Play Billing** | | |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY` | ⬜ No | Google Play service account JSON key |
| `ANDROID_PACKAGE_NAME` | ⬜ No | Android app package (e.g., `com.fishsmart.pro`) |
| `PLAY_INTEGRITY_ENABLED` | ⬜ No | Enable Play Integrity verification (`true`/`false`) |
| `PLAY_INTEGRITY_PROJECT_NUMBER` | ⬜ No | Google Cloud project number for Play Integrity |
| **Session/Auth** | | |
| `SESSION_TOKEN_EXPIRY` | ⬜ No | Session token lifetime in seconds |
| `VERIFICATION_CACHE_TTL` | ⬜ No | Verification cache TTL in seconds |

---

## 💰 Pricing Tiers

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | 3 AI forecast uses per session |
| **Pro Monthly** | $4.99/mo | Unlimited forecasts, history, data export |
| **Pro Yearly** | $29.99/yr (~$2.50/mo) | Everything in Pro, 50% savings |

Prices are defined in Stripe Dashboard. The server reads price IDs from environment variables — never hardcoded.

---

## 📂 Project Structure

```
v2.20/
├── app/                         # Main application workspace
│   ├── server.js                # Express server entry point
│   ├── src/
│   │   ├── config/env.js        # Environment configuration
│   │   ├── engine/              # Scientific scoring modules
│   │   │   ├── bite-score.js    # Multi-factor bite probability engine
│   │   │   ├── activity-forecast.js  # 12-hour activity prediction
│   │   │   ├── metabolic.js     # Species metabolic efficiency by water temp
│   │   │   ├── pressure-trend.js    # Barometric pressure trend analysis
│   │   │   ├── water-temp.js    # USGS water temperature integration
│   │   │   └── lure-scorer.js   # Species-specific lure recommendation
│   │   ├── services/            # Business logic layer
│   │   │   ├── ai.js            # Gemini AI forecast generation
│   │   │   ├── weather.js       # OpenWeather data fetching
│   │   │   ├── db.js            # PostgreSQL connection pool
│   │   │   ├── stripe.js        # Stripe Billing integration
│   │   │   ├── stripe-webhook-handler.js
│   │   │   ├── subscription.js  # Free-tier usage tracking
│   │   │   ├── entitlement-service.js  # Unified entitlement resolution
│   │   │   ├── forecast-history.js  # Forecast persistence & export
│   │   │   ├── session-auth.js  # JWT session management
│   │   │   └── google-play-billing.js
│   │   ├── routes/
│   │   │   ├── api.js           # Core API endpoints
│   │   │   ├── billing.js       # Stripe checkout & portal routes
│   │   │   └── webhooks.js      # Stripe webhook handler
│   │   ├── middleware/
│   │   │   ├── csp.js           # Strict Content Security Policy
│   │   │   ├── sanitization.js  # Input sanitization & URI validation
│   │   │   ├── auth.js          # Session authentication
│   │   │   └── billing-auth.js  # Stripe billing auth middleware
│   │   └── data/loader.js       # Species & lure data loader
│   ├── public/                  # Static frontend assets (PWA)
│   │   ├── index.html           # Main application page
│   │   ├── privacy.html         # Privacy policy page
│   │   ├── offline.html         # Offline fallback page
│   │   ├── sw.js                # Service Worker
│   │   ├── manifest.json        # PWA Web App Manifest
│   │   ├── js/                  # Client-side JavaScript
│   │   ├── css/                 # Compiled Tailwind + shared styles
│   │   └── .well-known/         # Android asset links
│   ├── tests/                   # Test suite (node --test)
│   ├── migrations/              # PostgreSQL schema migrations
│   ├── data/                    # Species, lure, and behavior data (JSON)
│   └── scripts/                 # CSS build, promo code utilities
├── android/                     # TWA wrapper for Google Play
├── docs/                        # Documentation & research notes
├── store-assets/                # App store screenshots & promo assets
├── tools/                       # Version sync utilities
├── package.json                 # Monorepo root
└── CHANGELOG.md                 # Version history
```

---

## 🧠 Scientific Engine

FishSmart Pro doesn't just ask an LLM to guess. Forecasts are powered by a multi-factor scoring engine that runs **before** AI enhancement:

```
┌─────────────────────────────────────────────────────────┐
│                   User Input                            │
│  (location, species, water body, clarity, conditions)   │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│                 Scientific Engine                        │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │  Pressure   │  │  Metabolic   │  │  Water Temp    │ │
│  │  Trend      │  │  Efficiency  │  │  (USGS live)   │ │
│  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘ │
│         │                │                   │          │
│  ┌──────┴──────┐  ┌──────┴───────┐          │          │
│  │  Wind/Cloud │  │  Clarity     │          │          │
│  │  Factor     │  │  Factor      │          │          │
│  └──────┬──────┘  └──────┴───────┘          │          │
│         └──────────────┼────────────────────┘          │
│                        ▼                               │
│              ┌─────────────────┐                        │
│              │   BITE SCORE    │                        │
│              │   (EMA smoothed) │                        │
│              └────────┬────────┘                        │
│                       ▼                                │
│         ┌──────────────────────────┐                    │
│         │  12-Hour Activity Array  │                    │
│         │  (engine-derived, no AI) │                    │
│         └──────────────────────────┘                    │
└───────────────────────┬─────────────────────────────────┘
                        ▼                                  
┌───────────────────────────────────────────────────────┐
│                   Gemini AI Layer                      │
│  • Natural-language forecast explanation              │
│  • Lure recommendations (engine-scored)               │
│  • Strategy & technique tips (species-specific)       │
│  • Structured JSON response with DOMPurify sanitizing │
└───────────────────────────────────────────────────────┘
```

### Bite Score Factors

| Factor | Source | Weight Logic |
|--------|--------|-------------|
| **Barometric Pressure Trend** | OpenWeather + historical cache | Falling = feeding, rising = slowdown |
| **Metabolic Efficiency** | Species-specific water temp curve | Cold-blooded metabolism peaks at optimal temps |
| **Water Temperature** | USGS stations (live) or weather fallback | Cross-referenced with species preferences |
| **Wind Speed/Direction** | OpenWeather | Moderate chop stimulates; strong wind suppresses |
| **Cloud Cover** | OpenWeather | Overcast extends feeding windows |
| **Water Clarity** | User input | Stained = reaction baits; clear = finesse |
| **Time of Day** | Solar position | Dawn/dusk peaks, midday lulls |

Scores are **EMA-smoothed** per location to reduce volatility, with a bounded LRU cache (500 locations, 24h TTL).

---

## 📡 API Reference

### Core Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/` | — | Main application page |
| `GET` | `/health` | — | Health check (DB, AI, weather status) |
| `GET` | `/beta-signup` | — | Beta signup page |

### Weather & Forecast

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/weather?lat=&lon=` | — | Current weather conditions |
| `POST` | `/api/generate` | ✅ | Generate AI fishing forecast |

**POST `/api/generate`**

```json
// Request
{
  "lat": 35.5951,
  "lon": -82.5515,
  "species": "Largemouth Bass",
  "waterBody": "French Broad River",
  "clarity": "Clear",
  "notes": "Optional angler notes (max 200 chars)"
}

// Response (200)
{
  "success": true,
  "forecast": {
    "biteScore": 78,
    "confidence": "high",
    "summary": "Strong morning bite expected...",
    "factors": { ... },
    "lures": [{ "name": "Texas Rig Worm", "score": 92, "reason": "..." }],
    "activityForecast": [{ "hour": "06:00", "score": 85 }, ...],
    "strategy": "..."
  },
  "usage": { "used": 2, "limit": 3, "remaining": 1 }
}
```

### Forecast History

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/history` | ✅ | List past forecasts (max 50) |
| `GET` | `/api/history/:id` | ✅ | Get specific forecast by ID |
| `GET` | `/api/history/export?format=json|csv` | ✅ | Export forecast history |
| `DELETE` | `/api/history/:id` | ✅ | Delete specific forecast |
| `DELETE` | `/api/history` | ✅ | Clear all forecasts for device |

### Auth & Subscription

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/session` | — | Create session (device to session token) |
| `GET` | `/api/auth/validate` | ✅ | Validate session token |
| `POST` | `/api/auth/logout` | ✅ | Destroy session |
| `GET` | `/api/usage` | ✅ | Check free-tier usage |
| `GET` | `/api/tokens` | ✅ | AI token usage report |

### Billing

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/subscribe` | ✅ | Create Stripe Checkout Session |
| `POST` | `/api/google-play/verify` | ✅ | Verify Google Play purchase token |
| `GET` | `/api/google-play/products` | — | List Google Play subscription products |
| `POST` | `/api/promo` | ⚡ Rate-limited | Redeem promo code for Pro access |
| `POST` | `/api/webhooks/stripe` | Webhook sig | Stripe webhook receiver (raw body) |

---

## 🧪 Testing

Tests use Node.js built-in test runner (`node --test`).

```bash
# Run all tests
npm test

# Run from app directory with specific file
node --test tests/bite-score.test.js

# Run benchmarks
node tests/benchmark-bite-score.js
node tests/benchmark-activity-forecast.js
node tests/benchmark-pressure-trend.js
```

### Test Coverage

| Test File | Module Tested |
|-----------|--------------|
| `multi-factor.test.js` | Bite score integration |
| `activity-forecast.test.js` | 12-hour activity engine |
| `metabolic.test.js` | Species metabolic curves |
| `pressure-trend.test.js` | Pressure trend analysis |
| `water-temp.test.js` | USGS water temperature |
| `lure-scorer.test.js` | Lure recommendation scoring |
| `ai.test.js` | Gemini AI service |
| `subscription-payment-fallback.test.js` | Free-tier + Stripe fallback |
| `session-auth.test.js` | Session token lifecycle |
| `stripe-service.test.js` | Stripe checkout & portal |
| `stripe-webhook-handler.test.js` | Webhook processing |
| `entitlement-service.test.js` | Unified entitlement logic |
| `billing-auth.test.js` | Billing middleware |
| `auth-stripe-entitlement.test.js` | Auth + Stripe integration |

---

## 🔒 Security

FishSmart Pro implements defense-in-depth security:

| Layer | Implementation |
|-------|---------------|
| **CSP** | Strict Content Security Policy (custom, overrides Helmet) |
| **Headers** | HSTS, X-Frame-Options: DENY, X-Content-Type-Options, Referrer-Policy |
| **Input Sanitization** | Whitelist-based sanitization on all request bodies |
| **URI Validation** | Request URI validation middleware |
| **XSS Prevention** | DOMPurify on all client-side `innerHTML` assignments |
| **Cookies** | HttpOnly device tracking cookies (not localStorage UUIDs) |
| **Rate Limiting** | Per-endpoint limits (10 req/15 min for AI; 5 req/min for promo) |
| **Body Size** | 100kb JSON / URL-encoded limit |
| **Webhooks** | Stripe signature verification on raw body |
| **Info Suppression** | `x-powered-by` header disabled |

---

## 🚢 Deployment

### Render (Recommended)

1. Connect the GitHub repository to Render
2. Set build command: `npm install && npm run build:css`
3. Set start command: `npm start`
4. Configure all environment variables in Render dashboard
5. Run database migrations: `psql $DATABASE_URL -f app/migrations/*.sql`

### Database Migrations

```bash
# Apply migrations in order
psql $DATABASE_URL -f app/migrations/001-stripe-billing.sql
psql $DATABASE_URL -f app/migrations/002-stripe-customers-unique-account.sql
psql $DATABASE_URL -f app/migrations/003-free-tier-usage.sql
psql $DATABASE_URL -f app/migrations/004-promo-codes.sql
psql $DATABASE_URL -f app/migrations/005-forecast-history.sql
psql $DATABASE_URL -f app/migrations/006-cookie-device-tracking.sql
```

### Android (Google Play TWA)

The `android/` directory contains a Bubblewrap Trusted Web Activity wrapper:

```bash
cd android
./gradlew assembleRelease
# Upload APK/AAB to Google Play Console
```

The Android Digital Asset Links file is served from:
```
https://your-domain.com/.well-known/assetlinks.json
```

---

## 🔧 Development

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with `--watch` auto-reload |
| `npm start` | Start production server |
| `npm run build:css` | Build & minify Tailwind CSS |
| `npm run build:css:debug` | Build CSS with debug logging |
| `npm test` | Run test suite (`node --test`) |
| `npm run sync-versions` | Check version consistency across files |
| `npm run sync-versions:write` | Auto-fix version mismatches |

### CSS Development

Tailwind CSS source: `app/src/input.css`  
Compiled output: `app/public/css/tailwind.css`

The dev server runs `predev` -> `build:css` automatically before starting.

---

## 📝 License

MIT License — see [LICENSE](LICENSE) file.

---

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md) for full version history.

---

## 🤝 Privacy

FishSmart Pro is built privacy-first:

- **No social features** — no sharing, no feed, no spot burning
- **No third-party tracking** — no analytics SDKs, no ad networks
- **Your data stays yours** — forecast history is per-device, exportable, and deletable
- **Minimal data collection** — only what's needed to generate forecasts

See full [Privacy Policy](app/public/PRIVACY.md).
