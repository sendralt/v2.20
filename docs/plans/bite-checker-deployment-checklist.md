# FishSmart Pro Bite Checker Deployment Checklist

**Status:** Not started
**Last updated:** 2026-08-06
**Recommended architecture:** Static frontend on Hostinger + Node.js backend on Render or Railway + Cloudflare DNS/TLS

## How to use this checklist

- Replace `[ ]` with `[x]` when a task is verified complete.
- Add the date, URL, screenshot, log excerpt, or command output beneath a task when useful.
- Use `BLOCKED` when progress depends on an external account, credential, plan upgrade, or decision.
- Do not place API keys, passwords, tokens, `.env` contents, or private customer data in this document.

## Architecture decision

- [ ] Confirm the landing-page domain: `https://fishsmart-pro.com`
- [ ] Confirm whether `https://www.fishsmart-pro.com` will also be supported.
- [ ] Confirm the API subdomain: `https://api.fishsmart-pro.com`
- [ ] Choose the managed Node.js host: `Render` / `Railway` / `Hostinger Node.js`.
- [ ] Confirm that the initial deployment will preserve the existing Express backend rather than migrate to Cloudflare Workers.
- [ ] Record the final decision here:

**Hosting decision:** _Not selected_
**Decision date:** _Not selected_
**Reason:** _Not recorded_

## Phase 1 — Prepare the backend code

### Health and port handling

- [ ] Add a lightweight unauthenticated `GET /health` endpoint returning HTTP `200` and JSON such as `{"ok":true}`.
- [ ] Confirm the server listens on `process.env.PORT || 3000`.
- [ ] Confirm the health endpoint does not require the database, AI service, weather service, billing, or user authentication.
- [ ] Confirm the provider's health-check path will be `/health`.

### CORS

- [ ] Add production CORS handling before the API routes.
- [ ] Allow only `https://fishsmart-pro.com`.
- [ ] Allow `https://www.fishsmart-pro.com` only if that origin is actually used.
- [ ] Keep localhost origins limited to development mode.
- [ ] Reject unknown origins.
- [ ] Verify that `OPTIONS` preflight requests succeed for the Bite Checker endpoint.
- [ ] Confirm production CORS does not use unrestricted `Access-Control-Allow-Origin: *`.

### Public Bite Checker API

- [ ] Confirm `POST /api/bite-checker` is public and does not require app authentication.
- [ ] Preserve required location validation.
- [ ] Preserve the allowed-species validation.
- [ ] Preserve the maximum location length check.
- [ ] Preserve the application rate limit of 5 requests per minute per IP.
- [ ] Preserve request-body size limits.
- [ ] Preserve controlled `400`, `429`, and `500` responses.
- [ ] Confirm no API key or secret is included in frontend JavaScript.
- [ ] Confirm the API returns only the lite result intended for the free tool.

### Security review

- [ ] Confirm administrator and token-usage routes remain authenticated.
- [ ] Confirm Stripe webhook signature verification remains enabled where applicable.
- [ ] Confirm billing and database routes remain protected.
- [ ] Confirm error responses do not expose secrets, stack traces, or private data.
- [ ] Add timeouts or verify existing timeouts for external AI/weather requests.
- [ ] Confirm input validation prevents excessive request cost.

## Phase 2 — Identify production configuration

- [ ] Review `/a0/usr/projects/fishsmartpro/app/src/config/env.js`.
- [ ] Create a list of required production environment-variable names without recording their values here.
- [ ] Confirm the minimum Bite Checker service variables, likely including the configured Gemini/weather variables.
- [ ] Decide whether `DATABASE_URL` is required for the deployed service.
- [ ] Decide whether Stripe and Google Play variables are needed by this deployment.
- [ ] Set `NODE_ENV=production` in the hosting provider.
- [ ] Confirm no `.env`, `.a0proj/secrets.env`, API key, or credential will be committed or uploaded.
- [ ] Confirm provider budget alerts are available for external API usage.

**Required variable names:**

```text
NODE_ENV=production
# Add names verified from app/src/config/env.js; never add values here.
```

## Phase 3 — Local verification

Run these checks before deploying.

- [ ] Install dependencies:

```bash
cd /a0/usr/projects/fishsmartpro/app
npm ci
```

- [ ] Start in production mode:

```bash
NODE_ENV=production npm start
```

- [ ] Test health:

```bash
curl -i http://localhost:3000/health
```

Expected: HTTP `200` and JSON.

- [ ] Test valid Bite Checker input:

```bash
curl -i -X POST http://localhost:3000/api/bite-checker \
  -H 'Content-Type: application/json' \
  --data '{"location":"Lake Norman","species":"Largemouth Bass"}'
```

- [ ] Test missing input and confirm HTTP `400`:

```bash
curl -i -X POST http://localhost:3000/api/bite-checker \
  -H 'Content-Type: application/json' \
  --data '{}'
```

- [ ] Test an invalid species and confirm it is rejected.
- [ ] Test an overlong location and confirm it is rejected.
- [ ] Test repeated requests and confirm the rate limit returns HTTP `429`.
- [ ] Run the app test suite:

```bash
cd /a0/usr/projects/fishsmartpro/app
npm test
```

- [ ] Record the test date and result:

**Local test result:** _Not run_
**Test date:** _Not run_
**Notes:** _None_

## Phase 4 — Deploy the Node.js backend

### Provider setup

- [ ] Create or select the managed Node.js service.
- [ ] Connect the FishSmart Pro GitHub repository using the provider's GitHub integration.
- [ ] Configure the service root directory as `app`.
- [ ] Configure the runtime as Node.js.
- [ ] Select a supported LTS Node.js version, preferably Node 20 or the provider's current supported LTS.
- [ ] Set the build command to `npm ci`.
- [ ] Set the start command to `npm start`.
- [ ] Set the health-check path to `/health`.
- [ ] Set the deployment environment to production.
- [ ] Configure the required environment variables through the provider's secret settings.
- [ ] Do not upload `.env` or secrets to the provider's source repository.

### First deployment

- [ ] Trigger the first deployment.
- [ ] Review build logs for successful dependency installation.
- [ ] Review startup logs for successful server initialization.
- [ ] Confirm required data files load successfully.
- [ ] Confirm AI/weather services initialize as expected.
- [ ] Confirm there are no missing-variable errors.
- [ ] Confirm there is no fixed-port binding error.
- [ ] Confirm the service remains running after startup.
- [ ] Record the temporary provider URL:

**Temporary backend URL:** _Not assigned_

### Temporary URL tests

- [ ] `GET /health` returns HTTP `200`.
- [ ] `POST /api/bite-checker` returns JSON for valid input.
- [ ] Invalid input returns controlled JSON errors.
- [ ] The temporary URL works over HTTPS.
- [ ] Review logs after valid, invalid, and rate-limited requests.
- [ ] Confirm no secrets appear in logs.

## Phase 5 — Configure Cloudflare

### DNS migration or setup

- [ ] Create or select the Cloudflare account.
- [ ] Add `fishsmart-pro.com` to Cloudflare.
- [ ] Export or record existing Hostinger DNS records before changing nameservers.
- [ ] Preserve root-domain and `www` records for Hostinger.
- [ ] Preserve MX, SPF, DKIM, DMARC, verification, and other email records.
- [ ] Change nameservers at the domain registrar if Cloudflare will manage authoritative DNS.
- [ ] Wait for nameserver propagation.
- [ ] Verify that the Hostinger landing page still loads.

### API custom domain

- [ ] Add the custom domain `api.fishsmart-pro.com` in the backend provider dashboard.
- [ ] Add the provider-recommended Cloudflare DNS record, normally a CNAME for `api`.
- [ ] Start with the API record set to **DNS only** while certificate validation is completed.
- [ ] Confirm the provider issues a valid certificate for `api.fishsmart-pro.com`.
- [ ] Test:

```bash
curl -i https://api.fishsmart-pro.com/health
```

- [ ] Configure Cloudflare SSL/TLS mode as **Full (strict)** after the origin certificate works.
- [ ] Enable HTTPS redirects only after HTTPS has been verified.
- [ ] Decide whether to enable Cloudflare proxying for the API after testing origin and rate-limit behavior.
- [ ] Confirm DNS changes do not disrupt the landing page or email.

**API domain status:** _Not configured_

## Phase 6 — Update the static Hostinger frontend

### Frontend API URL

- [ ] Update `/a0/usr/projects/fishsmartpro/app/public/js/bite-checker.js`.
- [ ] Replace the relative request URL `/api/bite-checker` with the production API origin.
- [ ] Prefer a single configuration value such as:

```javascript
var API_BASE = 'https://api.fishsmart-pro.com';
```

- [ ] Use `API_BASE + '/api/bite-checker'` for the request.
- [ ] Confirm no development, provider-temporary, or localhost URL remains in the production package.
- [ ] Confirm the frontend displays useful messages for HTTP `429`, `400`, and `500` responses.

### Static file structure

- [ ] Confirm the upload contains:

```text
bite-checker.html
js/bite-checker.js
css/tailwind.css
css/shared.css
icon.png
apple-icon-180.png
manifest.json
```

- [ ] Decide whether the public URL is `/bite-checker.html` or the clean `/bite-checker` rewrite.
- [ ] If using `/bite-checker.html`, update the canonical and Open Graph URLs accordingly.
- [ ] If using `/bite-checker`, configure and test the Hostinger rewrite.
- [ ] Upload the revised frontend files to Hostinger `public_html`.
- [ ] Keep a backup of the previous working static files before replacing them.
- [ ] Clear Hostinger and browser caches as needed.

**Live frontend URL:** _Not assigned_

## Phase 7 — End-to-end browser verification

- [ ] Open the live Bite Checker page on a desktop browser.
- [ ] Open it on a mobile viewport or real mobile device.
- [ ] Confirm HTML loads over HTTPS.
- [ ] Confirm CSS loads without 404 errors.
- [ ] Confirm JavaScript loads without 404 errors.
- [ ] Confirm icons and manifest load correctly.
- [ ] Enter a valid body of water.
- [ ] Select a supported species.
- [ ] Submit the form.
- [ ] Confirm the loading state appears.
- [ ] Confirm the API request goes to `https://api.fishsmart-pro.com/api/bite-checker`.
- [ ] Confirm the response is JSON and HTTP `200` for a valid request.
- [ ] Confirm the score, top factor, and available temperatures render.
- [ ] Confirm the CTA links to the intended FishSmart Pro app URL.
- [ ] Confirm no CORS errors appear in the browser console.
- [ ] Confirm no mixed-content warnings appear.
- [ ] Confirm no request goes to the old relative API path.
- [ ] Test missing location.
- [ ] Test missing species.
- [ ] Test an API failure or temporarily unavailable backend.
- [ ] Confirm rate-limit messaging is friendly and visible.

## Phase 8 — Monitoring, abuse prevention, and costs

- [ ] Confirm application-level rate limiting is active.
- [ ] Add Cloudflare rate limiting for `/api/bite-checker` if needed.
- [ ] Configure alerts for backend downtime.
- [ ] Configure alerts for repeated HTTP `5xx` responses.
- [ ] Monitor AI/weather API failures.
- [ ] Monitor latency and memory usage.
- [ ] Configure external API budget alerts.
- [ ] Review provider logs regularly during the first week.
- [ ] Track Bite Checker page visits.
- [ ] Track successful submissions.
- [ ] Track API errors and rate-limit responses.
- [ ] Track CTA clicks into FishSmart Pro.
- [ ] Track free-tool-to-signup conversion.

## Phase 9 — Launch approval

Do not publicly promote the tool until all critical checks are complete.

- [ ] Frontend loads from the final production URL.
- [ ] API health check is green.
- [ ] Valid browser submission returns a score.
- [ ] CORS is restricted to the intended production origins.
- [ ] HTTPS is valid on both frontend and API.
- [ ] No credentials are exposed in repository, ZIP, HTML, or JavaScript.
- [ ] Rate limiting has been tested.
- [ ] Error handling has been tested.
- [ ] Analytics and conversion tracking are working.
- [ ] Rollback files and DNS details are saved.
- [ ] Stakeholder approves launch.

**Launch decision:** _Not approved_
**Launch date:** _Not scheduled_
**Approved by:** _Not recorded_

## Rollback checklist

If the deployment fails:

- [ ] Keep the existing static Hostinger page available.
- [ ] Restore the previous `bite-checker.js` if the new frontend causes problems.
- [ ] Disable or revert the API service deployment.
- [ ] Remove or disable the API DNS record only if necessary.
- [ ] Restore the previous Cloudflare DNS records from the saved copy.
- [ ] Confirm the main landing page and email still work.
- [ ] Review provider logs and document the failure before retrying.

## Deployment record

| Item | Value | Status |
| --- | --- | --- |
| Frontend host | Hostinger | Confirmed |
| Backend host | Render / Railway / Hostinger Node.js | Not selected |
| Cloudflare DNS | Yes / No | Not configured |
| Frontend URL | `https://fishsmart-pro.com/bite-checker.html` or clean URL | Not verified |
| API URL | `https://api.fishsmart-pro.com` | Not verified |
| Health endpoint | `/health` | Not implemented/verified |
| API endpoint | `/api/bite-checker` | Implemented in repository |
| Local tests | `npm test` | Not run for this deployment |
| Production test | Browser + curl | Not run |
| Launch status | Not launched | Pending |

## Useful repository paths

- Backend package: `/a0/usr/projects/fishsmartpro/app/package.json`
- Backend entry point: `/a0/usr/projects/fishsmartpro/app/server.js`
- API routes: `/a0/usr/projects/fishsmartpro/app/src/routes/api.js`
- Environment configuration: `/a0/usr/projects/fishsmartpro/app/src/config/env.js`
- Bite Checker page: `/a0/usr/projects/fishsmartpro/app/public/bite-checker.html`
- Bite Checker frontend logic: `/a0/usr/projects/fishsmartpro/app/public/js/bite-checker.js`
- Static upload package: `/a0/usr/workdir/fishsmartpro-bite-checker-hostinger.zip`
