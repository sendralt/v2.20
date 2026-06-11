# Changelog

All notable changes to FishSmart Pro will be documented in this file.

## v2.16 (2026-05-18)

### Security
- **DOMPurify XSS Hardening**: Client-side DOMPurify sanitization (`public/purify.min.js`) applied before all `innerHTML` assignments in `app.js`
- **Cookie-Backed Device Tracking**: Migration `006-cookie-device-tracking.sql` replaces localStorage UUID with HttpOnly cookie as authoritative free-tier tracking key

### Added
- **Toast Notification System**: Non-blocking error/success/info toasts with auto-dismiss (4s), replaces `alert()` for API errors
- **Form State Persistence**: Water body, species, clarity, and boat mode saved to `localStorage` (`fishsmart_form`) and restored on page load
- **Focus Trapping**: Keyboard focus trapped inside history modal and paywall overlay for accessibility
- **Aria-Live Regions**: `aria-live="polite"` on results section, `aria-live="assertive"` on loading text for screen-reader announcements
- **Shared CSS**: Extracted common styles into `public/css/shared.css` to eliminate duplication across `index.html` and `privacy.html`

### Changed
- **Inline Form Validation**: Replaced `alert()` with per-field validation messages, red border glow, and `role="alert"` containers
- **Accessibility (P1)**: `aria-label` and `aria-pressed` added to clarity buttons, bottom nav, history panel, and paywall close
- **Accessibility (P2)**: Bottom nav label size increased from `text-[10px]` to `text-xs` (12px) for readability
- **Privacy.html Bottom Nav**: Added History button, `text-xs` labels, `aria-labels`, and `aria-current` to match main app navigation
- **Reduced Motion Support**: `prefers-reduced-motion: reduce` media query disables animations and hides decorative particles/waves

### Removed
- **Dead HTML**: Cleaned commented-out Step badge and Conditions card blocks from `index.html`

### Infrastructure
- New file: `public/css/shared.css`
- New file: `public/purify.min.js` (DOMPurify 3.2.5)
- Android `build.gradle`: versionName bumped to `2.15` (versionCode 15)

## v2.12 (feature/offline-data-export)

### Added
- **Forecast History**: Past forecasts saved to server (up to 50 per device), viewable from History tab
- **Data Export**: Export forecast history as JSON or CSV from History panel
- **History API**: 5 new endpoints (`GET/DELETE /api/history`, `GET /api/history/:id`, `GET /api/history/export`)
- **Scientific Activity Forecast**: 12-hour activity array now derived from engine factors (time-of-day multiplier, pressure trend, metabolic efficiency) instead of LLM generation
- **Activity Forecast Engine**: New `src/engine/activity-forecast.js` with 8 unit tests
- **Offline History**: Service Worker Stale-While-Revalidate caching for `/api/history` endpoints

### Changed
- Activity forecast removed from LLM prompt — no longer asking AI to guess hourly activity
- Service Worker cache version bumped to v8
- Offline page updated to mention cached history availability
- Privacy policy updated with forecast history storage disclosure

### Removed
- Orphaned manifest shortcuts (`/?view=forecast`, `/?view=lures`) — no routing implementation existed

### Infrastructure
- New migration: `005-forecast-history.sql`
- New service: `src/services/forecast-history.js`
- Test count: 86 → 94 (all passing)

## v2.11

### Core
- Multi-factor scientific bite score engine (pressure trend, metabolic efficiency, water temp, wind, cloud, clarity, time-of-day)
- AI-powered fishing strategy via Google Gemini (strategy, safety, intel, solunar)
- Lure recommendation engine with per-species scoring
- Live water temperature from USGS monitoring stations
- Pressure trend classification (5 levels from hPa/hr rate)

### Billing
- Stripe integration with checkout sessions and customer portal
- Google Play Billing for Android TWA
- Session-based auth with 7-day past-due grace period
- Promo code system with per-device and global limits
- Free tier: 3 AI forecast uses

### PWA
- Service Worker with multi-strategy caching
- Android Trusted Web Activity wrapper
- Play Store assets (screenshots, icons, feature graphic)

### Security
- Strict Content Security Policy
- Input sanitization (whitelist-based)
- URI validation middleware
- Rate limiting on all endpoints
