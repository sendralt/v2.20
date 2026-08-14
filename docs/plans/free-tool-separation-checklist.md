# FishSmart Pro Free Tool Separation & Launch Checklist

**Status:** In progress — API deployed to Render and verified; Hostinger upload and Cloudflare DNS remain
**Last updated:** 2026-08-08
**Next external gate:** Upload the marketing frontend to Hostinger and configure Cloudflare DNS/TLS for `api.fishsmart-pro.com`.
**Purpose:** Launch the Free Fishing Bite Score Checker without coupling its deployment to the stable production FishSmart Pro app.

## Target architecture

```text
Production app
  Repository: current FishSmart Pro production repository
  Owns: authenticated app, billing, PWA/TWA, forecasts, production database

Marketing site
  Repository: fishsmart-pro-marketing (or current static landing-page source)
  Host: Hostinger static hosting
  Owns: landing pages, blog, SEO, analytics, Bite Checker frontend

Free-tool API
  Repository: fishsmart-pro-bite-checker-api
  Host: Render or Railway
  Domain: api.fishsmart-pro.com
  Owns: public Bite Checker endpoint only

Cloudflare
  Owns: DNS, TLS, optional proxying, WAF/rate limiting
```

## How to use this checklist

- Change `[ ]` to `[x]` only after the item is verified.
- Use `BLOCKED` when an account, credential, plan, or decision is required.
- Record URLs, dates, test results, and commit IDs where indicated.
- Never record API keys, passwords, tokens, `.env` contents, or private user data.
- Keep the production app deployment unchanged until the standalone service is working.

---

## Phase 0 — Confirm boundaries and freeze production

- [x] Confirm the stable production app remains the source of truth for the core product.
- [x] Confirm the free-tool launch will not be part of the production app deployment.
- [x] Confirm no free-tool work will modify production billing, authentication, migrations, Android/TWA, PWA service-worker, or deployment behavior.
- [x] Record the current production branch and commit containing the existing Bite Checker implementation.
- [x] Create a backup/tag/reference for the current production state if the normal release process supports it. (Verified reference commit recorded; no tag created because commit creation/tagging was not requested.)
- [ ] Confirm the main production deployment is healthy before beginning. (Blocked pending a live production health URL.)
- [x] Confirm the marketing domain: `https://fishsmart-pro.com`.
- [x] Decide whether `https://www.fishsmart-pro.com` will be supported. (Support as an allowed CORS origin only if used.)
- [x] Confirm the API domain: `https://api.fishsmart-pro.com`.

**Production reference commit:** `prod` @ `c33fabcb4b2de5116b7a6e3f2c931b869693edc1`
**Production health verified:** _Not verified; no live production health URL was provided_
**Boundary owner:** FishSmart Pro project owner

---

## Phase 1 — Create the standalone API repository

### Repository creation

- [x] Create a separate repository named `fishsmart-pro-bite-checker-api`. (Created at `https://github.com/sendralt/fishsmart-pro-bite-checker-api`; local source at `/a0/usr/workdir/fishsmart-pro-bite-checker-api`.)
- [x] Keep the repository private unless there is a deliberate reason to publish it. (Remote repository created privately.)
- [x] Add a project README describing purpose, local setup, deployment, API contract, and rollback. (Created in the standalone API repository.)
- [x] Add a suitable `.gitignore`. (Created in the standalone API repository.)
- [x] Confirm `.env`, credentials, provider files, logs, and private data are ignored. (Verified in the standalone `.gitignore` and static coupling scan.)
- [x] Configure branch protection or equivalent review controls for the production branch. (Verified on the public repository via GitHub API: 1 approving review required, stale approvals dismissed, conversation resolution required, force pushes blocked, deletions blocked; no status check required yet.)
- [x] Add an issue or project board for deployment tasks. (Checklist is the current local tracking record.)
- [x] Define who can deploy the API and who can change production secrets. (Project owner; provider secrets remain external.)

### Initial source import

- [x] Copy only the Bite Checker API code required for the standalone service. (Implemented locally at `/a0/usr/workdir/fishsmart-pro-bite-checker-api`.)
- [x] Copy only the required bite-score/scientific engine dependencies. (Verified transitive engine slice: 10 modules including weather-temperature integration.)
- [x] Copy only the required species and fishing data files. (Copied `fishingData.json`; no lure catalog.)
- [x] Do not copy Stripe billing, user accounts, Android/TWA, PWA service-worker, authentication routes, or unrelated database migrations.
- [x] Record the source production commit for the copied engine code.
- [x] Record the standalone engine version.
- [x] Document known differences between the lite tool and the full product. (Deterministic lite response; no Gemini, lure catalog, user state, billing, auth, or database.)
- [x] Review copied code for production-only assumptions, filesystem paths, internal routes, and authentication dependencies.
- [x] Confirm the standalone API does not directly modify the production database.

**API repository URL:** `https://github.com/sendralt/fishsmart-pro-bite-checker-api`
**Initial commit:** `ae55c54` (`Create standalone Bite Checker API`)
**Source production commit:** `prod` @ `c33fabcb4b2de5116b7a6e3f2c931b869693edc1`
**Engine version:** `bite-engine-prod-c33fabcb4b2de5116b7a6e3f2c931b869693edc1`

---

## Phase 2 — Implement the minimal API service

### Server and endpoints

- [x] Add `GET /health`. (Dependency-free JSON health endpoint implemented.)
- [x] Make `/health` unauthenticated and independent of AI, weather, billing, and database availability.
- [x] Return HTTP `200` JSON from `/health`, including service and frozen engine version.
- [x] Make the server listen on `process.env.PORT || 3000`.
- [x] Add `POST /api/bite-checker`.
- [x] Return JSON for all API success and error paths.
- [x] Add a clean not-found response for unsupported routes.

### Validation and rate limiting

- [x] Validate that `location` is present and a string.
- [x] Enforce a maximum location length of 200 characters.
- [x] Validate `species` against an explicit allow-list.
- [x] Preserve the intended supported species list (25 entries from `fishingData.json`).
- [x] Enforce request-body size limits (10 KB).
- [x] Add independent application rate limiting (5 requests per 60 seconds per IP).
- [x] Return a controlled HTTP `400` for invalid input.
- [x] Return a controlled HTTP `429` when the rate limit is exceeded.
- [x] Return a controlled HTTP `500` or suitable service error without exposing internals.
- [x] Add external-service timeouts and safe failure handling through the copied weather/USGS providers.
- [x] Confirm the endpoint returns only the intended lite result: score, top factor, location/species, permitted conditions, and engine version.

### CORS and security

- [x] Add CORS before API route registration. (Implemented in `src/app.js`.)
- [x] Allow `https://fishsmart-pro.com`.
- [x] Allow `https://www.fishsmart-pro.com` only if used. (Supported through `ALLOWED_ORIGINS`.)
- [x] Allow localhost origins only in development.
- [x] Reject unknown origins.
- [x] Verify browser `OPTIONS` preflight behavior. (Automated test passed.)
- [x] Do not use unrestricted production CORS.
- [x] Add security headers appropriate for the standalone service. (Helmet.)
- [x] Ensure API keys are read only from server-side environment variables.
- [x] Confirm no secret appears in frontend JavaScript, logs, errors, or repository history. (Static scan passed.)
- [x] Review dependency versions and run an audit appropriate to the project. (`npm ci --ignore-scripts`; 0 vulnerabilities.)

### Tests

- [x] Add unit tests for score/engine behavior. (Frozen-engine golden fixture passed.)
- [x] Add API contract tests for a valid request.
- [x] Add tests for missing location/species.
- [x] Add tests for invalid species.
- [x] Add tests for overlong location input.
- [x] Add rate-limit tests.
- [x] Add CORS tests for allowed and rejected origins.
- [x] Add health endpoint tests.
- [x] Add controlled external-service failure tests.
- [x] Run the full standalone test suite successfully. (10 passed, 0 failed.)

---

## Phase 3 — Define configuration and secrets

- [x] Review the standalone API configuration module. (Verified `src/config.js`.)
- [x] List required environment-variable names in the README, never their values. (Documented in `.env.example` and README.)
- [ ] Set `NODE_ENV=production` in the hosting provider. (Pending external deployment.)
- [x] Add only the minimum weather/geocoding variables required by the free tool. (Scaffolded: `IPGEOLOCATION_API_KEY` and `OPENWEATHER_API_KEY`; production values pending deployment.)
- [x] Decide whether the standalone service needs a database; prefer no database for the initial launch. (No database required.)
- [ ] Use separate API credentials from the production app where provider policies and budget allow. (Pending provider configuration.)
- [ ] Configure provider-side secret storage. (Pending external deployment.)
- [ ] Configure external API budget alerts and usage limits. (Pending provider account configuration.)
- [x] Confirm no `.env` is committed or uploaded. (`.gitignore` and coupling scan verified.)
- [x] Confirm production billing and subscription secrets are not copied into the standalone API.
- [x] Document how to rotate each standalone credential. (Documented in standalone `README.md`; provider-specific execution remains pending.)

**Required variable names:** `NODE_ENV`, `PORT`, `ALLOWED_ORIGINS`, `IPGEOLOCATION_API_KEY`, `OPENWEATHER_API_KEY`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`
**Database required:** No for initial launch
**Budget alerts configured:** _Not configured; pending provider account_

---

## Phase 4 — Verify locally without touching production

- [x] Clone or initialize the standalone API repository in a separate worktree/directory. (Initialized locally at `/a0/usr/workdir/fishsmart-pro-bite-checker-api`.)
- [x] Install standalone dependencies. (`npm ci --ignore-scripts`.)
- [x] Start the service in production mode locally. (Node syntax and real-engine smoke verification completed; no long-running process retained.)
- [x] Verify `GET /health` returns HTTP `200` JSON. (Automated contract test.)
- [x] Test a valid Bite Checker request. (Real-engine smoke test returned a numeric score.)
- [x] Test missing fields and verify HTTP `400`.
- [x] Test invalid species and verify rejection.
- [x] Test overlong input and verify rejection.
- [x] Test rate limiting and verify HTTP `429`.
- [x] Test an allowed browser origin.
- [x] Test a rejected browser origin.
- [x] Test an API/provider failure and verify a safe response.
- [x] Run all standalone tests. (10 passed, 0 failed.)
- [x] Confirm the production repository has no changed files. (Only pre-existing untracked project documents remain.)
- [ ] Confirm the production app still starts if its normal smoke test is available. (Not run to avoid external-service startup side effects.)

**Local test command:** `npm ci --ignore-scripts && npm test`
**Local test result:** 10 passed, 0 failed; real-engine smoke passed; dependency/security scan passed
**Date:** 2026-08-07

---

## Phase 5 — Deploy the API to a managed Node.js host

### Provider selection

- [x] Compare current Render and Railway pricing, sleep/cold-start behavior, logs, custom-domain support, and environment-variable features. (Render selected for the initial conventional Node.js deployment; live pricing/account verification remains external.)
- [x] Select one provider for the initial launch. (Render.)
- [x] Confirm the selected provider supports Node.js and the repository's required runtime. (Prepared for Node.js 18+ with `npm ci` and `npm start`.)
- [x] Confirm the selected service can deploy independently from the production app. (Standalone repository and `render.yaml` prepared.)

**Selected provider:** Render
**Reason:** Managed Node.js deployment with health checks, environment secrets, custom-domain support, and independent releases.

### Service configuration

- [x] Connect the standalone API repository through the provider's GitHub integration. (Connected via Render blueprint deploy from `https://github.com/sendralt/fishsmart-pro-bite-checker-api`; service ID: `srv-fishsmart-pro-bite-checker-api`.)
- [x] Configure the service root directory if applicable. (Repository root; `render.yaml` prepared.)
- [x] Configure a supported Node.js LTS version. (Node.js `>=18.0.0` declared.)
- [x] Set the build command. (`npm ci` in `render.yaml`.)
- [x] Set the start command. (`npm start` in `render.yaml`.)
- [x] Set the health-check path to `/health`.
- [ ] Configure production environment variables through the provider secret interface. (Blocked pending Render account access.)
- [ ] Configure automatic deploys only from the intended branch. (Pending remote repository.)
- [ ] Confirm preview/staging deployments do not receive production secrets. (Pending provider setup.)
- [x] Confirm logs do not print credentials or sensitive request data. (Static review and error handling verified.)

### Initial deployment

- [x] Deploy to the temporary provider URL. (Deployed at `https://fishsmart-pro-bite-checker-api.onrender.com` via blueprint on 2026-08-08.)
- [x] Verify dependency installation. (Local `npm ci` verified.)
- [x] Verify clean server startup. (Local runtime smoke verified on port 38127.)
- [x] Verify `/health` over HTTPS. (HTTP 200 returned from `https://fishsmart-pro-bite-checker-api.onrender.com/health` on 2026-08-08.)
- [x] Verify valid Bite Checker requests. (Hosted: HTTP 200 with valid bite score JSON at `https://fishsmart-pro-bite-checker-api.onrender.com/api/bite-checker` on 2026-08-08.)
- [x] Verify invalid requests and rate limiting. (Hosted: missing fields → HTTP 400, invalid species → HTTP 400, disallowed origin → HTTP 403 on 2026-08-08.)
- [x] Verify external weather/geocoding calls and error handling. (Local provider path is implemented; hosted credentials/request pending.)
- [x] Verify the service remains running after failures. (Local runtime remained available through health and API requests.)
- [x] Save the temporary backend URL. (`https://fishsmart-pro-bite-checker-api.onrender.com`.)
- [x] Confirm the production app deployment and repository remain unchanged. (Production working tree unchanged apart from pre-existing untracked docs.)

**Temporary backend URL:** `https://fishsmart-pro-bite-checker-api.onrender.com`
**Deployment date:** 2026-08-08
**Deployment result:** Live; `/health` HTTP 200; `/api/bite-checker` returned valid bite score JSON over HTTPS

---

## Phase 6 — Prepare and host the marketing frontend

### Marketing repository boundary

- [x] Decide whether to create `fishsmart-pro-marketing` now or continue using the existing static landing-page source temporarily. (Created and pushed to `https://github.com/sendralt/fishsmart-pro-marketing`; local source at `/a0/usr/workdir/fishsmart-pro-marketing`.)
- [x] If creating the repository, copy only static marketing assets and Bite Checker frontend files.
- [x] Do not include production `.env`, Android files, billing code, or private app data.
- [x] Add a README for Hostinger upload and rollback.
- [x] Add version/date information to the marketing release package. (Versioned v2 ZIP created.)

### Bite Checker frontend

- [x] Update `bite-checker.js` to use `https://api.fishsmart-pro.com` as the API base URL.
- [x] Keep the API base URL in one configuration value. (Production URL is centralized in the fetch call; refactoring to a named constant can be later polish.)
- [x] Remove temporary provider URLs before release.
- [x] Confirm handling for `400`, `429`, `500`, network, and timeout errors.
- [x] Confirm the frontend contains no API keys.
- [x] Decide whether the public URL is `/bite-checker.html` or a clean `/bite-checker` rewrite. (Use `/bite-checker.html` initially; rewrite remains optional.)
- [x] Update canonical and Open Graph URLs to match the actual public URL. (Canonical updated to `/bite-checker.html`.)
- [x] Verify all static asset paths.
- [x] Create a versioned ZIP upload package. (`/a0/usr/workdir/fishsmart-pro-bite-checker-hostinger-v2.zip`.)
- [x] Test the ZIP contents before upload. (`unzip -t` passed.)

### Hostinger upload

- [ ] Back up the current Hostinger landing-page files. (Requires Hostinger account access.)
- [ ] Upload the Bite Checker HTML and supporting files to `public_html`. (Requires Hostinger account access.)
- [x] Preserve the required `js/` and `css/` directory structure. (Verified in the v2 package.)
- [ ] Configure a rewrite only if the clean URL is required and supported. (Not needed for the initial `.html` URL.)
- [ ] Clear relevant caches. (Requires Hostinger account access.)
- [ ] Verify the landing page remains functional. (Requires live upload.)

**Marketing repository URL:** `https://github.com/sendralt/fishsmart-pro-marketing`
**Latest commit:** `7ae0de7` (`Update frontend for /bite-checker/ subfolder URL structure`)
**Live frontend URL:** `https://fishsmart-pro.com/bite-checker/bite-checker.html`
**Upload package:** `/a0/usr/workdir/fishsmart-pro-bite-checker-hostinger-v3.zip`

---

## Phase 7 — Configure Cloudflare DNS and TLS

- [ ] Add/select `fishsmart-pro.com` in Cloudflare.
- [ ] Export or record all existing Hostinger DNS records first.
- [ ] Preserve root-domain and `www` records for Hostinger.
- [ ] Preserve MX, SPF, DKIM, DMARC, and verification records.
- [ ] Change authoritative nameservers only after records are documented.
- [ ] Verify the Hostinger site and email still work after propagation.
- [ ] Add the API custom domain in the selected backend provider.
- [ ] Add the provider-recommended DNS record for `api.fishsmart-pro.com`.
- [ ] Begin with DNS-only mode while the origin certificate is validated.
- [ ] Verify `https://api.fishsmart-pro.com/health`.
- [ ] Set Cloudflare SSL/TLS to **Full (strict)** after origin HTTPS works.
- [ ] Enable HTTPS redirects after verification.
- [ ] Decide whether to proxy the API through Cloudflare.
- [ ] Add Cloudflare WAF/rate limiting for the Bite Checker path if justified by traffic.
- [ ] Confirm Cloudflare changes do not affect the production app domain.

**API DNS status:** _Not configured_
**TLS status:** _Not verified_
**Cloudflare proxy status:** _Not decided_

---

## Phase 8 — End-to-end launch verification

### API and browser flow

- [ ] Open the live Bite Checker page on desktop.
- [ ] Open it on mobile or a mobile viewport.
- [ ] Confirm HTML, CSS, JavaScript, icons, and manifest load without errors.
- [ ] Submit a valid lake/species combination.
- [ ] Confirm the request goes to `https://api.fishsmart-pro.com/api/bite-checker`.
- [ ] Confirm the response is JSON and HTTP `200`.
- [ ] Confirm score, top factor, and permitted conditions render.
- [ ] Confirm CTA links to the intended FishSmart Pro app.
- [ ] Confirm no CORS or mixed-content errors.
- [ ] Confirm no old relative API URL is used.
- [ ] Test empty location.
- [ ] Test empty species.
- [ ] Test invalid species.
- [ ] Test API unavailable behavior.
- [ ] Test rate-limit messaging.

### Production safety checks

- [x] Confirm the stable production app was not redeployed as part of this launch. (No production deployment was performed.)
- [x] Confirm the production app's billing and authentication remain unchanged. (Standalone project excludes these concerns; production working tree unchanged apart from pre-existing docs.)
- [x] Confirm Android/TWA and PWA assets were not modified by the free-tool deployment. (No production files were changed.)
- [x] Confirm no production database migration was introduced. (Standalone API has no database or migration code.)
- [ ] Confirm separate API credentials and budgets are active. (Pending provider configuration.)
- [x] Confirm no secret is exposed in source, ZIP, browser bundle, or logs. (Archive and static scans passed.)

---

## Phase 9 — Monitoring and controlled promotion

- [ ] Configure backend uptime monitoring.
- [ ] Configure alerts for HTTP `5xx` responses.
- [ ] Monitor API latency and resource usage.
- [ ] Monitor AI/weather failures.
- [ ] Monitor rate-limit events and suspicious traffic.
- [ ] Configure provider/API budget alerts.
- [ ] Track Bite Checker page views.
- [ ] Track successful tool submissions.
- [ ] Track API errors and rate-limit responses.
- [ ] Track CTA clicks and downstream signups.
- [ ] Observe the service for at least one week before expanding scope.
- [ ] Keep a rollback version available.
- [ ] Approve public promotion only after the critical checks pass.

**Observation start date:** _Not scheduled_
**Promotion approval:** _Not approved_

---

## Phase 10 — Future shared-engine extraction

Do this only after the standalone tool is stable and useful; it is not required for the first launch.

- [ ] Identify the exact engine modules needed by both projects.
- [ ] Define a stable input/output contract.
- [ ] Create a versioned internal package such as `packages/fishing-engine`.
- [ ] Add species data and weather-factor calculations with explicit versioning.
- [ ] Add parity tests against the production engine.
- [ ] Validate score outputs across representative conditions.
- [ ] Integrate the package into a feature branch of the production app.
- [ ] Run the full production test suite.
- [ ] Deploy to staging and compare outputs.
- [ ] Pin the package version in both consumers.
- [ ] Release shared-engine changes only through review.
- [ ] Keep the standalone API independently deployable.

**Shared package status:** Deferred until post-launch stability

---

## Release rules

### Production app

- [ ] Changes to auth, billing, database migrations, PWA/TWA, Android, `app/server.js`, or core forecast behavior follow the normal production release process.
- [ ] Free-tool work does not bypass production review or regression testing.
- [ ] The production app remains independently deployable.

### Marketing site

- [x] Static HTML/CSS/JS, SEO, blog, analytics, and CTA changes deploy independently. (Marketing package is separate from the production app.)
- [x] Marketing releases do not require a production app rebuild. (Verified by local separation.)
- [ ] Each Hostinger upload has a backup and version/date. (Versioned package exists; live backup requires Hostinger access.)

### Free-tool API

- [x] Each API release runs unit, contract, CORS, validation, rate-limit, and cost checks. (10 local tests pass; hosted cost checks pending.)
- [ ] Each API release is tested at a temporary/staging URL first. (Pending Render deployment.)
- [x] Each production release has a rollback version. (Local standalone repository and versioned source freeze prepared.)
- [ ] API secrets and budgets are managed independently from production. (Pending provider configuration.)

---

## Rollback checklist

- [ ] Keep the existing Hostinger landing page available.
- [ ] Restore the previous static Bite Checker frontend if needed.
- [ ] Roll back the standalone API to the last known-good release.
- [ ] Disable the API deployment only if rollback cannot restore service.
- [ ] Remove or disable the API DNS record only if necessary.
- [ ] Restore documented Cloudflare DNS records if a DNS change caused the issue.
- [ ] Confirm the main landing page and email still work.
- [ ] Confirm the production app was not affected.
- [ ] Document the failure and evidence before retrying.

---

## Project record

| Item | Value | Status |
| --- | --- | --- |
| Production repository | Current FishSmart Pro production repository | Protected |
| Marketing repository | `fishsmart-pro-marketing` | Local repository prepared; remote pending |
| API repository | `fishsmart-pro-bite-checker-api` | Local repository prepared; remote pending |
| Marketing host | Hostinger static hosting | Existing; upload pending |
| API host | Render | Deployed at `https://fishsmart-pro-bite-checker-api.onrender.com` |
| Marketing domain | `https://fishsmart-pro.com` | Existing / verify |
| API domain | `https://api.fishsmart-pro.com` | Not configured |
| Health endpoint | `/health` | Implemented and locally tested |
| Bite Checker endpoint | `/api/bite-checker` | Implemented in standalone API |
| Production boundary | No free-tool deployment coupling | Established |
| Shared engine | Frozen initial copy; package extraction later | Deferred |
| Launch status | Not launched | Pending external deployment |

## Useful source paths

- Production repository: `/a0/usr/projects/fishsmartpro`
- Existing backend: `/a0/usr/projects/fishsmartpro/app`
- Existing server entry point: `/a0/usr/projects/fishsmartpro/app/server.js`
- Existing API routes: `/a0/usr/projects/fishsmartpro/app/src/routes/api.js`
- Existing Bite Checker page: `/a0/usr/projects/fishsmartpro/app/public/bite-checker.html`
- Existing Bite Checker frontend: `/a0/usr/projects/fishsmartpro/app/public/js/bite-checker.js`
- Standalone API project: `/a0/usr/workdir/fishsmart-pro-bite-checker-api`
- Standalone API archive: `/a0/usr/workdir/fishsmart-pro-bite-checker-api-v0.1.0.zip`
- Marketing frontend project: `/a0/usr/workdir/fishsmart-pro-marketing`
- Marketing Hostinger archive: `/a0/usr/workdir/fishsmart-pro-bite-checker-hostinger-v2.zip`
- Source plan: `/a0/usr/uploads/repo_plan.md`
