## Yes. We should separate the new project from the production app.

Given that `/a0/usr/projects/fishsmartpro` is a stable production repository with billing, authentication, PWA/TWA assets, and Android release dependencies, I would **not make the free-tool deployment part of the production app deployment path**.

The current Bite Checker code exists inside the production repository, but that does not mean it needs to remain operationally coupled to the main app.

## Recommended target architecture

```text
Production FishSmart Pro app
  Repository: fishsmart-pro-prod
  Deployment: existing production service
  Domain: app.fishsmart-pro.com or current app domain
  Purpose: authenticated app, billing, forecasts, PWA/TWA

Marketing website
  Repository: fishsmart-pro-marketing
  Deployment: Hostinger static hosting
  Domain: fishsmart-pro.com
  Purpose: landing pages, blog, SEO, Bite Checker frontend

Free-tool API
  Repository: fishsmart-pro-bite-api
  Deployment: Render/Railway/Hostinger Node.js
  Domain: api.fishsmart-pro.com
  Purpose: public Bite Checker endpoint only
```

This gives us three independently deployable concerns:

1. **Core product** — protected from marketing changes.
2. **Marketing site** — safe to edit and upload frequently.
3. **Free-tool API** — independently rate-limited, monitored, and scaled.

## Why this is safer

The production repository currently contains several high-risk areas:

- Stripe billing and webhooks
- Authentication and free-tier enforcement
- Database migrations
- Android/TWA version alignment
- PWA service-worker cache invalidation
- Core forecast and science-engine behavior
- Production deployment configuration

A change made for a landing-page tool should not be able to:

- Break the production app build
- Change the Android/TWA target behavior
- Alter billing or subscription logic
- Invalidate PWA caches unexpectedly
- Introduce public API exposure into authenticated routes
- Consume production AI/weather credentials without independent limits

Separation makes the failure domain much smaller.

# What should remain in the production repository

The production repository should continue to own:

- The main FishSmart Pro application
- Authenticated forecast APIs
- Subscription and entitlement logic
- Stripe integration and webhooks
- Database migrations used by the app
- PWA assets and service worker
- Android/TWA project
- Core science and AI implementation
- Production app deployment

We should avoid adding marketing-specific deployment behavior to its main startup path.

# What should move to the free-tool project

The separate Bite Checker service should contain only what it needs:

- A small Express server
- `POST /api/bite-checker`
- `GET /health`
- Bite-score calculation dependencies
- Required weather/data integrations
- Species allow-list and input validation
- Independent rate limiting
- Strict CORS for the marketing domain
- Production logging and cost controls

It should not contain:

- Stripe billing
- User accounts
- Android/TWA files
- PWA service-worker logic
- Authenticated forecast history
- Admin endpoints
- Production subscription state
- Database migrations unrelated to the free tool

## Important design decision: do not duplicate business logic blindly

The free API currently relies on code in the production app, including the bite-score engine and AI service. We should avoid maintaining two silently diverging copies.

There are two good approaches.

### Preferred approach: extract a versioned shared package

Create a small internal package containing the stable, reusable scientific logic:

```text
packages/fishing-engine/
  bite-score.js
  species data
  weather-factor calculations
  package.json
```

Then:

- The production app imports the package.
- The Bite Checker API imports the same package.
- Changes are versioned and tested before release.
- The marketing tool can use a pinned package version.

This is the cleanest long-term structure, but it requires careful extraction and regression testing.

### Safer first step: copy a deliberately frozen tool engine

For the initial launch, create a separate Bite Checker API with a **frozen, documented copy** of only the required engine code.

Document:

- Source commit from the production repository
- Engine version
- Supported species
- Input/output contract
- Known differences from the full app

Then update it only through an explicit review process. This minimizes the risk of refactoring production code immediately.

I would choose this approach for the first public launch, followed by shared-package extraction once the tool proves valuable.

# Recommended repository strategy

## Option A — Separate Git repository

Create a new repository such as:

```text
fishsmart-pro-bite-checker-api
```

and, if desired:

```text
fishsmart-pro-marketing
```

This provides the strongest protection because each service has:

- Its own deployment settings
- Its own environment variables
- Its own release history
- Its own rollback path
- Its own CI checks
- Its own access controls

## Option B — Separate directories and deployment roots in the same repository

This is acceptable as an intermediate step:

```text
fishsmart-pro/
├── app/                 # production app
├── landing-page/        # static marketing site
└── services/
    └── bite-checker-api/
```

However, a same-repository setup still requires strict CI path filters and deployment configuration. A careless change can still affect the production repository, so separate repositories are safer operationally.

## My recommendation

Use:

- **Current repository:** production app only
- **New repository:** Bite Checker API
- **Existing or separate static site location:** marketing frontend
- **Cloudflare:** DNS and HTTPS across all domains

Keep the current repository untouched except for bug fixes or carefully reviewed shared-engine work.

# Deployment boundaries

| Area | Production app | Marketing site | Bite Checker API |
|---|---:|---:|---:|
| Deploy independently | No | Yes | Yes |
| Stripe access | Yes | No | No |
| Authenticated users | Yes | No | No |
| Public internet endpoint | Limited | Yes | Yes, rate-limited |
| Android/TWA dependency | Yes | No | No |
| PWA service worker | Yes | No | No |
| AI/weather credentials | Yes | No | Only required minimum |
| Database access | Yes | No | Prefer no; only if required |
| Cloudflare protection | Optional | Yes | Yes |
| Rollback independently | Limited | Yes | Yes |

# Migration plan with minimal production risk

## Stage 1 — Freeze the production boundary

- Treat the current production app as read-only for this project.
- Do not modify `server.js`, billing, auth, Android, PWA, or deployment configuration for the free-tool launch.
- Record the production commit that currently contains the Bite Checker implementation.
- Confirm the current production deployment remains unchanged.

## Stage 2 — Create the standalone API

- Create `fishsmart-pro-bite-checker-api`.
- Copy only the required Bite Checker route and dependencies.
- Add `/health`.
- Add strict CORS.
- Add independent rate limiting.
- Add request validation and external-service timeouts.
- Add a minimal `package.json`.
- Add a README with deployment and environment-variable instructions.
- Add tests for valid input, invalid input, rate limiting, and engine output.

## Stage 3 — Deploy privately or under a temporary URL

- Deploy to Render or Railway.
- Use separate API credentials if the provider permits it.
- Add budget alerts.
- Test the temporary service URL.
- Confirm the production app has not changed.

## Stage 4 — Connect the marketing frontend

- Update only the static Bite Checker frontend to call:

```text
https://api.fishsmart-pro.com/api/bite-checker
```

- Upload the frontend to Hostinger.
- Keep the main application deployment untouched.

## Stage 5 — Add the API custom domain

- Configure `api.fishsmart-pro.com` in Cloudflare.
- Enable HTTPS.
- Restrict CORS to the marketing domain.
- Test from the real browser page.

## Stage 6 — Observe before promoting

For the first week, monitor:

- API errors
- Rate-limit events
- External API usage
- Response time
- Conversion to the main app
- Unexpected traffic or abuse

Only after the service is stable should we consider extracting shared code or adding more capabilities.

# Release rules going forward

## Production app changes

Any change involving these areas should remain in the production project and receive full regression testing:

- `app/server.js`
- Authentication
- Billing
- Database migrations
- PWA service worker
- Android/TWA files
- Core forecast behavior
- Shared science engine

## Marketing changes

Marketing-only changes should be deployable without rebuilding or redeploying the production app:

- Landing-page HTML
- CSS
- Blog posts
- SEO metadata
- Analytics tags
- CTA copy
- Static Bite Checker UI

## Free-tool API changes

The API should have its own release process:

- Unit tests
- API contract tests
- Rate-limit tests
- Cost review
- Environment-variable review
- Deploy to staging/temporary URL
- Production release
- Rollback version retained

# Final recommendation

Yes—create a **clear separation of concerns now**, before deploying the tool publicly.

The safest path is:

1. Leave the stable production FishSmart Pro app deployment alone.
2. Create a separate `fishsmart-pro-bite-checker-api` project.
3. Keep the static marketing page on Hostinger.
4. Deploy the standalone API to Render or Railway.
5. Use Cloudflare for `fishsmart-pro.com` and `api.fishsmart-pro.com`.
6. Initially freeze a tested copy of the required bite-score logic.
7. Later extract a versioned shared scientific-engine package if both projects need ongoing synchronized improvements.

That gives us the new marketing capability without placing the stable production application, billing, Android app, or PWA at unnecessary risk.