# FishSmart Pro — Autonomous Growth System Playbook

> **Purpose:** This document defines the architecture, cadence, and rules for the autonomous organic growth engine. All scheduled growth tasks follow this playbook.

---

## System Architecture

```
                    ┌─────────────────────────┐
                    │    HUMAN (In Loop)       │
                    │  Reviews & Approves      │
                    │  Publishing Actions      │
                    │  Sensitive Decisions     │
                    └────────┬────────┬───────┘
                             │ Approve│ Reject
                             ▼        ▼
 ┌──────────┐  draft   ┌──────────────┐  publish   ┌──────────────┐
 │ RESEARCH │─────────▶│ REVIEW QUEUE │───────────▶│  PUBLISHED   │
 │ (Auto)   │          │ (Human Gate) │            │  (Tracked)   │
 └──────────┘          └──────────────┘            └──────────────┘
       │                                                   │
       │ feedback loop                                     │
       └───────────────────────────────────────────────────┘
```

### Core Principles
1. **Research is fully autonomous** — no human gate on gathering intelligence
2. **Content goes to review queue** — human approves before publishing
3. **Dashboard is the command center** — everything tracked in one file
4. **Human escalations are explicit** — system flags only what needs human input
5. **Compounding assets** — every piece of content builds SEO, brand, and authority over time

---

## Directory Structure

```
docs/growth/
├── PLAYBOOK.md                    ← This file (system architecture)
├── growth-dashboard.md            ← Human-facing tracking dashboard
├── review/                        ← Human approval queue
│   ├── blog/                      ← Draft blog posts awaiting approval
│   ├── social/                    ← Draft social media posts
│   ├── reddit/                    ← Draft Reddit posts
│   ├── email/                     ← Draft emails/newsletters
│   └── influencer/                ← Draft outreach messages
├── research/                      ← Autonomous research output (no approval needed)
│   ├── competitor-watch/          ← Competitor monitoring reports
│   ├── trend-reports/             ← Trend/topic research
│   └── keyword-research/          ← SEO keyword opportunities
├── pipeline/                      ← Approved, scheduled-for-publishing content
└── published/                     ← Published content archive (with URLs/metrics)
```

---

## Autonomous Task Cadence

### Task 1: Weekly Research & Intelligence (MONDAY)
**Objective:** Gather competitive intelligence, trend data, and keyword opportunities.
**Autonomy Level:** FULL — no human gate.

**Actions:**
1. Competitor Watch: Check Fishbrain, Navionics, FishAngler, Anglr, TroutRoutes for updates (pricing changes, new features, app store reviews, social mentions)
2. Trend Research: Search for trending fishing topics, seasonal content opportunities, viral fishing content
3. Keyword Research: Find new long-tail SEO keywords for blog content
4. Community Pulse: Scan Reddit (r/bassfishing, r/Fishing, r/KayakFishing) for hot topics and pain points
5. Save all research to `/research/` subdirectories with date-stamped filenames
6. Update the Growth Dashboard with key findings

**Output:** Research reports saved to `research/` folder. Dashboard updated.

---

### Task 2: Weekly Content Creation (TUESDAY)
**Objective:** Draft 1 blog post and 3 social media posts based on research.
**Autonomy Level:** DRAFT ONLY — goes to review queue.

**Actions:**
1. Read the latest research reports from `research/`
2. Draft 1 SEO-optimized blog post (1,200-2,000 words) based on keyword opportunities and seasonal relevance
3. Draft 3 social media posts (for different platforms — educational, comparison, engagement)
4. Save all drafts to `review/blog/` and `review/social/`
5. Update the Growth Dashboard review queue with the new items

**Content Guidelines:**
- Blog posts must target specific long-tail keywords (found in keyword research)
- Tone: first-person, conversational, educational — NOT corporate
- Mention FishSmart Pro naturally — never hard-sell
- Include comparison content (vs competitors) for SEO
- Tie to seasonal relevance (spring=pre-spawn, summer=deep structure, fall=turnover, winter=slow presentations)

**Output:** Drafts in `review/` folders. Dashboard review queue updated.

---

### Task 3: Weekly Community Engagement Content (WEDNESDAY)
**Objective:** Draft Reddit and Facebook group posts for organic community engagement.
**Autonomy Level:** DRAFT ONLY — goes to review queue.

**Actions:**
1. Read the latest research for trending community topics and pain points
2. Draft 1-2 Reddit posts (different subreddits, different angles)
3. Draft 1 Facebook group post (value-first, educational)
4. Save drafts to `review/reddit/` and `review/social/`
5. Update Growth Dashboard

**Community Content Rules:**
- Post as a real person, never as a brand
- Lead with value/education, mention app only as natural context
- Invite feedback and criticism (builds trust)
- Never crosspost to 5 subs in 10 minutes — stagger over days
- Each post must be unique to its subreddit (don't reuse titles/bodies)
- Include real screenshots of forecasts when possible

**Output:** Drafts in `review/` folders. Dashboard review queue updated.

---

### Task 4: Weekly Influencer Pipeline (THURSDAY)
**Objective:** Find new influencer opportunities and draft outreach messages.
**Autonomy Level:** DRAFT ONLY — goes to review queue. Human sends final messages.

**Actions:**
1. Search YouTube/TikTok for fishing micro-influencers (5K-50K subscribers)
2. Filter for: freshwater focus, educational content style, active posting cadence
3. Draft personalized outreach messages (never templated — reference specific content)
4. Save drafts to `review/influencer/`
5. Check existing pipeline for follow-up needs (anyone waiting 7+ days)
6. Update Growth Dashboard influencer tracker

**Influencer Criteria:**
- YouTube: 5K-50K subscribers, freshwater fishing content, posts regularly
- TikTok: 10K-100K followers, fishing tips/tutorials
- Podcasts: Fishing/outdoor podcasts that interview guests
- Avoid: saltwater-only channels, inactive channels (>30 days no upload), channels with <1K subs

**Outreach Rules:**
- ALWAYS reference a specific video/post by name — no mass emails
- Offer free Pro account, no strings attached
- Offer affiliate link (30% recurring) if they respond positively
- Follow up once after 7 days, then mark as ghosted

**Output:** Draft outreach in `review/influencer/`. Dashboard tracker updated.

---

### Task 5: Weekly Email Newsletter (FRIDAY)
**Objective:** Draft the weekly fishing intelligence email for the email list.
**Autonomy Level:** DRAFT ONLY — goes to review queue.

**Actions:**
1. Check current seasonal conditions (what's happening in fishing right now)
2. Draft a weekly email with: fishing tip/education, conditions update, subtle app mention
3. Save to `review/email/`
4. Update Growth Dashboard

**Email Guidelines:**
- Subject line: hook-driven, not clickbait (e.g., "Why falling pressure = feeding fish")
- Body: 1 educational tip + 1 actionable insight + 1 subtle CTA
- Never hard-sell — the email builds trust over time, conversion happens naturally
- Include seasonal relevance ("Spring pre-spawn tip", "Summer thermocline strategy")

**Output:** Draft email in `review/email/`. Dashboard updated.

---

### Task 6: Monthly Strategy Review (1st of each month)
**Objective:** Review performance, adjust strategy, update dashboard metrics.
**Autonomy Level:** DRAFT dashboard update — human reviews and fills in actual metrics.

**Actions:**
1. Compile all content produced this month (blog, social, reddit, email, influencer)
2. Review research findings for strategic shifts
3. Identify what's working and what's not
4. Propose strategy adjustments for next month
5. Update Growth Dashboard monthly review section
6. Flag any strategic decisions that need human input

**Output:** Updated dashboard. Strategic recommendations flagged for human review.

---

## Human-in-the-Loop Rules

### When the system should ESCALATE to human
1. **Publishing approval:** Every draft in `review/` must be approved before publishing
2. **Credential needs:** When the system needs API keys, passwords, or login credentials
3. **Sensitive decisions:** Price changes, controversial content, responding to negative reviews
4. **Opportunity alerts:** When research identifies a high-impact opportunity (viral topic, major competitor vulnerability)
5. **Budget requests:** When any spend is proposed (ads, sponsorships, tools)
6. **Performance anomalies:** When metrics deviate significantly from expectations

### When the system should NOT escalate
1. **Routine research:** Competitor monitoring, keyword research, trend analysis
2. **Drafting content:** All content creation stays autonomous until the review gate
3. **Finding influencers:** Searching and identifying candidates is autonomous
4. **Dashboard updates:** Tracking and organizing content pipeline
5. **Follow-up drafting:** Reminder messages and follow-up sequences

---

## Content Quality Standards

### Voice and Tone
- **First person** — speak as the founder/angler who built this
- **Conversational** — like talking to a fishing buddy, not a customer
- **Educational** — teach something real in every piece
- **Honest** — acknowledge weaknesses, admit when competitors are better
- **Non-corporate** — no marketing speak, no buzzwords, no jargon

### Brand Consistency
- **Core positioning:** Science-first, privacy-first, value-priced
- **Key differentiators:** 10+ factor transparent engine, live USGS data, AI lure recs, zero spot burning, $29.99/yr
- **Competitor framing:** Never bash competitors — acknowledge their strengths, highlight our differences
- **Free tier emphasis:** 3 free full-power forecasts — always mention as low-risk entry

### SEO Standards (for blog content)
- Target one primary keyword per post (from keyword research)
- Include 2-3 secondary keywords naturally
- Word count: 1,200-2,000 words
- Include comparison tables, factor breakdowns, and actionable takeaways
- Meta title and description optimized
- Internal links to other blog posts and app landing page

---

## Success Metrics

### Weekly KPIs
- Research reports generated: 4+ (competitor, trends, keywords, community)
- Blog posts drafted: 1
- Social media posts drafted: 3
- Reddit/Facebook posts drafted: 2
- Influencer outreach drafted: 5
- Email newsletter drafted: 1

### Monthly KPIs
- Content published (after human approval): 8-12 pieces
- Influencers contacted: 20
- Directory submissions: 2-4
- Email subscribers growth: target +10%/month
- Organic traffic growth: target +15%/month

### Quarterly KPIs
- App installs growth: target +25%/quarter
- Paying subscriber growth: target +20%/quarter
- MRR growth: target +25%/quarter
- Influencer content placements: 3-5 per quarter
