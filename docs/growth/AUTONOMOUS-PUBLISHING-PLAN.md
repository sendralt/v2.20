# FishSmart Pro — Autonomous Publishing Plan

> **Goal:** Publish approved content from `pipeline/` to all external platforms autonomously — without getting blocked, shadowbanned, flagged, or rate-limited.
>
> **Created:** 2026-07-26
> **Status:** ⏸️ Deferred — 2026-07-26
> Risk profile (Reddit shadowban, account suspension, email deliverability) exceeds current appetite. Preserved for future consideration.

---

## Current State

The Autonomous Growth Engine runs on this pipeline:

```
Research (auto) → Draft (auto) → Review (human gate) → Pipeline (approved) → [MANUAL PUBLISH] → Published (tracked)
```

The **last mile is manual.** Approved content sits in `pipeline/` and a human must individually post to each platform. This plan closes that gap.

### Content Types & Target Platforms

| Content Type | Directory | Target Platform(s) | Risk Level |
|---|---|---|---|
| Blog posts | `pipeline/blog/` | Blog CMS (Ghost/WordPress/Webflow) | 🟢 Low |
| Social posts | `pipeline/social/` | Facebook Page, X/Twitter, Instagram | 🟡 Medium |
| Reddit posts | `pipeline/reddit/` | Reddit (multiple subreddits) | 🔴 High |
| Email newsletter | `pipeline/email/` | Email ESP (Brevo/Mailchimp/ConvertKit) | 🟡 Medium |
| Influencer outreach | `pipeline/influencer/` | Individual DMs/emails | ⛔ Manual only |

---

## Architecture: The Publisher Layer

```
┌─────────────┐     ┌──────────────────────────────────────────┐     ┌──────────────┐
│  PIPELINE    │────▶│           PUBLISHER LAYER                │────▶│  PUBLISHED   │
│ (approved)   │     │                                          │     │  (tracked)   │
└─────────────┘     │  ┌────────────┐  ┌─────────────────────┐ │     └──────────────┘
                    │  │  Content   │  │  Safety Controller   │ │
                    │  │  Adapter   │  │  - Rate limiter      │ │
                    │  │  (per      │  │  - Circuit breaker   │ │
                    │  │  platform) │  │  - Uniqueness check  │ │
                    │  └──────┬─────┘  │  - Reputation tracker │ │
                    │         │        │  - Human-like jitter  │ │
                    │         ▼        └─────────────────────┘ │
                    │  ┌──────────────────────────────────┐   │
                    │  │       Platform Connectors         │   │
                    │  │  Blog │ FB │ Reddit │ Email ESP   │   │
                    │  └──────────────────────────────────┘   │
                    └──────────────────────────────────────────┘
```

### Core Principle: One-way gate with safety rails

Content flows **one direction only**: `pipeline/ → publisher → published/`. The publisher never creates or modifies content — it only transports approved content to external platforms. Every publish attempt is logged with timestamp, platform response, and success/failure status.

---

## Platform-by-Platform Strategy

### 1. 🟢 Blog CMS (Lowest Risk)

**Publishing method:** Platform REST API

| Detail | Specification |
|---|---|
| **CMS options** | Ghost (recommended), WordPress, Webflow, Hashnode |
| **Auth method** | API key / OAuth token stored in project secrets |
| **Rate limit** | Effectively unlimited for our volume (1-4 posts/week) |
| **Ban risk** | Near zero — it's our own platform |
| **Content format** | Convert markdown → HTML before POST |

**Workflow:**
1. Watch `pipeline/blog/` for new `.md` files
2. Extract front matter (title, tags, slug, meta description)
3. Convert body markdown to HTML
4. POST to CMS API as **draft** first, then publish
5. Capture returned URL, write to file metadata, move to `published/blog/`

**Safety:**
- Publish as draft → auto-publish only after CMS confirms successful creation
- Retry on API timeout (max 3 attempts, exponential backoff)
- No human-like delays needed (this is our own CMS)

---

### 2. 🟡 Facebook Page (Medium Risk)

**Publishing method:** Facebook Graph API (Page Access Token)

| Detail | Specification |
|---|---|
| **Target** | Facebook **Page** (not groups — groups require user accounts with ban risk) |
| **Auth method** | Long-lived Page Access Token (60-day renewable) |
| **Rate limit** | Graph API: 200 calls/hour per Page (more than enough) |
| **Ban risk** | Low for API-posted Page content; **HIGH for group posting via automation** |

**Workflow:**
1. Watch `pipeline/social/` for Facebook-tagged posts
2. POST to Graph API `/{page-id}/feed` with message + optional image
3. If image attach: upload to `/{page-id}/photos` first, then reference
4. Capture post URL, move to `published/social/`

**Anti-block measures:**
- **Never post to Facebook Groups via automation.** Group posting via anything other than manual UI triggers spam detection. Group posts stay manual.
- Max 2-3 Page posts per day (well within safe limits)
- Add 30-120 second random jitter between multiple posts
- Vary post types: text-only, link, image+text, video (never identical format back-to-back)
- Token health check before each publish; alert human if token expires <7 days

---

### 3. 🔴 Reddit (Highest Risk)

**Publishing method:** Reddit OAuth2 API via PRAW (Python Reddit API Wrapper)

| Detail | Specification |
|---|---|
| **Target subreddits** | r/bassfishing, r/Fishing, r/KayakFishing, r/Fishingforbeginners |
| **Auth method** | OAuth2 personal use script (client_id + secret) |
| **Rate limit** | Reddit API: 60 requests/min, but posting limits are stricter |
| **Ban risk** | **CRITICAL** — shadowbans, subreddit bans, karma gating |

**Workflow:**
1. Watch `pipeline/reddit/` for new posts (each file targets one subreddit)
2. Pre-flight checks (see below)
3. Submit via PRAW `subreddit.submit()` or `submit_link()`
4. Capture permalink, move to `published/reddit/`

**Anti-block measures (critical):**
- **Maximum 1 post per subreddit per 48 hours** — enforced hard limit
- **Maximum 2 posts total per day** across all subreddits
- **Minimum 24 hours between any two Reddit posts** (human-like cadence)
- **Content uniqueness check:** Before posting, fetch last 10 posts from target subreddit and verify <40% text similarity (Jaccard similarity on word sets). Abort if too similar to existing or our own recent posts.
- **Account warmup:** Account must have ≥500 combined karma and ≥30 day age before the publisher touches it. If not, post is held in queue and human is notified.
- **Comment engagement:** After posting, the system must check for comments within 24h and flag for human response — never auto-reply (auto-replying is a ban magnet).
- **Stagger timing:** Post at subreddit-peak times (typically 6-10 AM local) with ±45 min random offset — never at the same minute.
- **Circuit breaker:** If ANY post receives a removal, rate-limit error, or shadowban signal, **immediately halt all Reddit publishing** and notify human. Do not retry.

---

### 4. 🟡 Email Newsletter (Medium Risk)

**Publishing method:** ESP (Email Service Provider) REST API

| Detail | Specification |
|---|---|
| **Recommended ESP** | Brevo (Sendinblue), Mailchimp, ConvertKit, Resend |
| **Auth method** | ESP API key stored in project secrets |
| **Rate limit** | Depends on ESP plan tier |
| **Block risk** | Sender reputation, spam filters, bounce rates |

**Workflow:**
1. Watch `pipeline/email/` for new newsletter drafts
2. Parse markdown into HTML email template (inline CSS, ESP-compatible)
3. Create campaign via ESP API with subject line from front matter
4. **Schedule send** (do not send immediately — schedule for optimal time)
5. After send, capture campaign ID + send stats, move to `published/email/`

**Anti-block measures:**
- **Never send via raw SMTP** — always through an ESP with managed deliverability
- **Domain authentication required:** SPF, DKIM, and DMARC must be configured on the sending domain. Verify before first send.
- **Compliance:** Every email must include: physical mailing address, one-click unsubscribe link, and permission reminder. The publisher verifies these exist before sending.
- **Bounce monitoring:** If bounce rate >5% or complaint rate >0.1%, **halt all email sends** and alert human.
- **List hygiene:** Never send to unverified/purchased lists. ESP manages suppression list automatically.
- **Send timing:** Schedule for subscriber-local optimal times (typically Tue-Thu 8-10 AM). Never send on weekends or holidays for newsletter.
- **Warmup:** If sender domain is new, ramp volume gradually (day 1: 100, day 7: 500, day 14: full list). ESP handles this via dedicated IP warmup.

---

### 5. ⛔ Influencer Outreach (Manual Only)

**This category is permanently excluded from autonomous publishing.**

Influencer outreach involves individual, personalized messages to real people. Automating this would:
- Violate platform ToS (LinkedIn, YouTube DMs)
- Destroy the personalization that makes outreach effective
- Risk account suspension on the platforms used for outreach
- Damage brand reputation if detected as automation

**Workflow:** Human reviews `pipeline/influencer/` drafts, copies the personalized message, and sends manually via the appropriate channel.

---

## Safety Controller (Cross-Platform)

The Safety Controller wraps every platform connector and enforces global rules:

### Rate Limiter
```
Platform      | Max per day | Min interval | Max per week
-------------|-------------|--------------|-------------
Blog CMS     | 3           | 1 hour       | 5
Facebook     | 3           | 2 hours      | 10
Reddit       | 2           | 24 hours     | 4
Email        | 1           | 24 hours     | 2
```

### Circuit Breaker

Every platform connector reports a health status. On **any** of these signals, the circuit trips open and halts that platform:

| Signal | Action |
|---|---|
| HTTP 403 / 429 (rate limited) | Halt platform for 24h, notify human |
| Account suspended / shadowbanned | Halt platform indefinitely, notify human |
| Content removed by platform | Halt platform for 48h, notify human |
| API auth failure (token expired) | Halt platform, notify human to re-auth |
| Email bounce rate >5% | Halt email sends, notify human |
| 3 consecutive failures | Halt platform for 24h, notify human |

When circuit is open, content stays in `pipeline/` — nothing is dropped or lost.

### Content Uniqueness Check

Before publishing to any social/community platform (Facebook, Reddit):
1. Generate a text fingerprint (normalized word set)
2. Compare against last 20 published posts on that platform
3. If Jaccard similarity >50% to any prior post → **abort publish, flag for human review**

This prevents the "same post across platforms" pattern that spam detectors flag.

### Human-like Jitter

No publish happens at a fixed time. Every scheduled publish gets:
- Random delay of 5-90 minutes from the scheduled time
- Randomized inter-post interval when multiple posts go to different platforms
- Avoids the "bot posted at exactly 9:00:00 AM" fingerprint

---

## Publishing Schedule (Cadence)

The publisher runs as a **scheduled task** (7th growth engine task):

| Detail | Value |
|---|---|
| **Task name** | Daily Publisher Sweep |
| **Schedule** | Daily at 11:00 AM (user timezone) |
| **Runtime** | ~15-30 minutes (with jitter delays) |
| **Autonomy** | Full — but respects all circuit breakers |

**Daily sweep logic:**
1. Check each platform's circuit breaker status — skip if tripped
2. Check rate limits — skip platform if daily/weekly quota exhausted
3. For each content file in `pipeline/{platform}/`:
   - Run content uniqueness check
   - Run platform-specific pre-flight checks
   - Publish via platform connector
   - On success: move to `published/{platform}/`, record URL + timestamp in file metadata
   - On failure: log error, trigger circuit breaker if needed, leave file in `pipeline/`
4. Update `growth-dashboard.md` publishing log
5. Notify human only if: circuit breaker tripped, content flagged, or publish failed

---

## Credential Management

All platform credentials stored in `.a0proj/secrets.env` (never committed to git):

| Secret | Platform | Purpose |
|---|---|---|
| `BLOG_CMS_API_KEY` | Blog CMS | Content publish API |
| `BLOG_CMS_API_URL` | Blog CMS | CMS endpoint |
| `FACEBOOK_PAGE_TOKEN` | Facebook | Graph API Page token |
| `FACEBOOK_PAGE_ID` | Facebook | Page identifier |
| `REDDIT_CLIENT_ID` | Reddit | OAuth2 app ID |
| `REDDIT_CLIENT_SECRET` | Reddit | OAuth2 app secret |
| `REDDIT_USERNAME` | Reddit | Account username |
| `REDDIT_PASSWORD` | Reddit | Account password |
| `ESP_API_KEY` | Email ESP | Campaign management |
| `ESP_FROM_EMAIL` | Email ESP | Verified sender address |
| `ESP_LIST_ID` | Email ESP | Subscriber list ID |

Credentials are checked at startup. If any are missing, the publisher logs a warning and skips that platform — it never crashes.

---

## Dashboard Integration

The `growth-dashboard.md` gets a new **Publishing Status** section:

```markdown
## 📤 Publishing Status

| Platform | Circuit | Last Publish | Quota Today | Next Available |
|---|---|---|---|---|
| Blog CMS | 🟢 Healthy | 2026-07-25 11:23 AM | 0/3 | Now |
| Facebook | 🟢 Healthy | 2026-07-25 11:31 AM | 0/3 | Now |
| Reddit | 🟢 Healthy | 2026-07-24 9:15 AM | 0/2 | Now |
| Email | 🟢 Healthy | 2026-07-25 10:00 AM | 0/1 | Now |

### Recent Publishes
| Date | Platform | Content | URL | Status |
|---|---|---|---|---|
| 2026-07-25 | Blog | Thermocline Fishing | https://... | ✅ Published |
| 2026-07-25 | Facebook | Social Post #3 | https://... | ✅ Published |
| 2026-07-24 | Reddit | r/bassfishing thermocline | https://... | ✅ Published |

### Alerts
- None
```

---

## Implementation Phases

### Phase 1: Blog CMS Publisher (Week 1)
- Choose and configure CMS (Ghost recommended)
- Implement blog content adapter (markdown → HTML)
- Implement CMS connector with draft-then-publish flow
- Create the Daily Publisher Sweep scheduled task
- Test with content already in `pipeline/blog/`
- **Verification:** Blog post appears on live CMS with correct formatting

### Phase 2: Email ESP Publisher (Week 2)
- Choose and configure ESP (Brevo recommended)
- Configure SPF/DKIM/DMARC on sending domain
- Implement email template conversion (markdown → HTML email)
- Implement ESP connector with schedule-send flow
- Test with content already in `pipeline/email/`
- **Verification:** Test email delivered to inbox (not spam), all compliance elements present

### Phase 3: Facebook Page Publisher (Week 3)
- Create/configure Facebook Page
- Generate long-lived Page Access Token
- Implement Graph API connector with image support
- Implement jitter and format variation logic
- Test with content in `pipeline/social/`
- **Verification:** Post appears on Facebook Page with correct content and image

### Phase 4: Reddit Publisher — Most Careful (Week 4-5)
- Verify Reddit account meets karma/age requirements (≥500 karma, ≥30 days)
- If not: build karma manually first via genuine community participation
- Register OAuth2 app on Reddit
- Implement PRAW connector with all pre-flight checks
- Implement content uniqueness checker
- **Start with 1 post per week maximum** for first month
- Gradually increase to 2/week after zero incidents
- **Verification:** Post appears on subreddit, not removed, not shadowbanned

### Phase 5: Safety Controller Hardening (Week 6)
- Implement circuit breaker persistence (survives restarts)
- Implement dashboard publishing section
- Implement human notification system for alerts
- Full end-to-end test with all platforms
- **Verification:** All platforms publish correctly, circuit breakers trip on simulated failures

---

## Risk Matrix & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Reddit shadowban | Medium | Critical | Karma/age checks, 48h per-sub cooldown, uniqueness checks, circuit breaker |
| Facebook account suspension | Low | High | Page-only (no groups), API-only (no scraping), token rotation |
| Email spam folder | Medium | High | ESP with managed deliverability, SPF/DKIM/DMARC, bounce monitoring |
| Rate limit hit | Medium | Low | Conservative daily/weekly quotas well below platform limits |
| Token/credential expiry | High | Medium | Token health check before each publish, 7-day expiry warning |
| Duplicate content flag | Medium | Medium | Uniqueness check before every social/reddit publish |
| CMS downtime | Low | Low | Retry with exponential backoff, content stays in pipeline |
| Content published in error | Low | High | Two-stage: draft → publish; pipeline files are human-approved |

---

## What This Plan Does NOT Do

- ❌ **Does not bypass platform ToS** — uses official APIs only, respects rate limits
- ❌ **Does not post to Facebook Groups** — too high ban risk via automation
- ❌ **Does not auto-DM influencers** — permanently manual
- ❌ **Does not auto-reply to comments** — ban magnet on Reddit especially
- ❌ **Does not publish content that hasn't been human-approved** — pipeline only
- ❌ **Does not retry on hard failures** — circuit breaker halts, human reviews
- ❌ **Does not use purchased email lists** — ESP-managed opt-in lists only

---

## Decision Points for Human

Before implementation begins, the human needs to decide:

1. **Blog CMS:** Which platform? (Ghost / WordPress / Webflow / Hashnode / other)
2. **Email ESP:** Which provider? (Brevo / Mailchimp / ConvertKit / Resend / other)
3. **Facebook Page:** Does a Page exist? Should one be created?
4. **Reddit account:** Does the posting account meet requirements? (≥500 karma, ≥30 days old)
5. **Sending domain:** Is email authentication (SPF/DKIM/DMARC) configured?
6. **Additional platforms:** X/Twitter? Instagram? LinkedIn? (currently not in scope)

---

## Summary

This plan transforms the manual publish step into an autonomous publisher with aggressive safety rails. The system uses **official APIs only**, respects **conservative rate limits far below platform thresholds**, implements **circuit breakers that halt on any anomaly**, and keeps **influencer outreach permanently manual**.

The guiding principle: **Publish slowly and safely. A post delayed is better than an account banned.**
