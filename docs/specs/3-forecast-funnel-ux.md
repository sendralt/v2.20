# 3-Forecast Funnel UX Specification

> **Goal:** Maximize free-to-paid conversion by treating the 3 lifetime free forecasts as a deliberately sequenced funnel — not a generic limit.
>
> **Core principle:** Each forecast has a specific job. Forecast #1 hooks. Forecast #2 proves repeatability. Forecast #3 creates maximum urgency. Post-#3 converts via the tease-wall.
>
> **Status:** Spec — pending implementation
>
> **Created:** 2026-07-18

---

## Architecture Context

| Component | Current State | Required Change |
|-----------|---------------|-----------------|
| Free tier limit | 3 lifetime per device | ✅ Already correct |
| Usage tracking | Persistent (cookie + fingerprint + IP) | ✅ Already correct |
| Usage counter display | Header badge + paywall progress bar | ⚠️ Needs per-forecast messaging |
| Tease-wall (post-#3) | ✅ Built — `/api/tease` + blur + CTA | ✅ Already built |
| Per-forecast UX | Generic — same experience for all 3 | ❌ Needs deliberate sequencing |

---

## The Funnel

### Forecast #1 — The Hook ("Wow Moment")

**Goal:** Make the user say "this is incredible" within 60 seconds.

**Psychology:**
- **Peak-End Rule** — the first forecast defines the peak experience. Make it unforgettable.
- **IKEA Effect** — the user generated this by entering their own location/species. They feel ownership.
- **Availability Heuristic** — a vivid first experience makes the product feel indispensable.

**UX Flow:**

| Step | Element | Messaging |
|------|---------|----------|
| Pre-generate | Loading overlay | Current rotating loading messages (keep as-is) |
| Results load | Bite Score banner | **Big reveal.** Ensure the score ring animation (if implemented) plays. The score must feel like a dramatic moment. |
| Results load | Factor breakdown | Full visibility. Emphasize transparency — "here's WHY the score is what it is." |
| Results load | Lure recommendations | Full visibility. Show source badges (engine vs AI). |
| Results load | Activity chart | Full visibility. Show the 12-hour forecast and highlight the peak window. |
| Post-results | Usage counter (header) | Subtle badge: **"2 free forecasts remaining"** — plants scarcity awareness early without being pushy. |
| Post-results | Share button | Prominent — "Share this forecast" (forecast card feature). Capitalize on peak excitement. |

**Key Design Notes:**
- Do NOT show any upgrade prompts or pricing during Forecast #1. The entire experience should feel like a gift.
- The usage counter should be visible but subtle — awareness of scarcity without pressure.
- The share card button should be prominent — this is the moment users are most likely to share.

---

### Forecast #2 — The Value Build ("It Works Again")

**Goal:** Prove the first forecast wasn't a fluke. Build trust in the engine's consistency.

**Psychology:**
- **Commitment & Consistency** — the user returned. That's a micro-commitment. Reinforce it.
- **Mere Exposure Effect** — second exposure to the interface builds familiarity and comfort.
- **Social Proof (internal)** — seeing their own history (Forecast #1) makes them feel like an active user, not a trialist.

**UX Flow:**

| Step | Element | Messaging |
|------|---------|----------|
| Pre-generate | Loading overlay | Same as #1 |
| Results load | Full forecast | Full visibility — identical feature set to #1 |
| Post-results | Usage counter (header) | **Amplified:** **"1 free forecast remaining"** — amber/yellow color coding. The number is now alarming. |
| Post-results | Inline nudge | **NEW:** Below the results, a subtle, non-pushy message: *"You have 1 forecast left. After that, you'll still see the bite score — but the full strategy unlocks with Pro ($2.50/mo)."* |
| Post-results | Share button | Still prominent |

**Key Design Notes:**
- The inline nudge should appear AFTER the user has had time to read the results (delay 3-5 seconds or on scroll past the activity chart).
- Tone: informational, not salesy. We're preparing them for what happens next, not pushing them to buy yet.
- The usage counter color should shift from neutral/cyan to amber/yellow to signal increasing scarcity.

---

### Forecast #3 — The Conversion Setup ("Last Call")

**Goal:** Maximum urgency. The user knows this is their last free forecast. The experience should be exceptional AND clearly communicate what they're about to lose.

**Psychology:**
- **Loss Aversion** — they're about to lose access to something valuable. Frame it as what they'll miss.
- **Zeigarnik Effect** — the open loop of "what would the 4th forecast tell me?" creates tension.
- **Scarcity Heuristic** — "last one" triggers heightened attention and value perception.

**UX Flow:**

| Step | Element | Messaging |
|------|---------|----------|
| Pre-generate | Usage warning | **NEW:** Before the generate button fires, show a dismissible notice: *"⚠️ This is your last free forecast. Make it count."* |
| Pre-generate | Loading overlay | Same as #1/#2 |
| Results load | Full forecast | Full visibility — identical feature set. Give them the complete experience one final time. |
| Post-results | Usage counter (header) | **"0 free forecasts remaining"** — red color coding. |
| Post-results | Conversion banner | **NEW:** Below results, a prominent (but not modal-blocking) banner: *"That was your last free forecast. But there's good news — you'll still see the bite score and live conditions anytime. To unlock AI strategy, lure picks, and the full activity forecast, upgrade to Pro."* with a **"See Pricing →"** button. |
| Post-results | Share button | Prominent — one more chance for organic virality. |

**Key Design Notes:**
- Forecast #3 must be the BEST experience. Do not degrade it.
- The pre-generate warning sets expectations — no surprise when the tease-wall appears next time.
- The conversion banner should be persistent within the results section but not modal — the user can scroll past it.
- The "See Pricing" button should open the existing paywall modal (not a new page).

---

### Post-Forecast #3 — The Tease-Wall ("The Conversion Engine")

**Goal:** Convert. Show the user exactly what they're missing, every single time they return.

**Status:** ✅ **ALREADY BUILT** — `/api/tease` endpoint + blur effect + inline CTA.

**Psychology:**
- **Loss Aversion (sustained)** — the blurred content is visible but inaccessible. This is more powerful than hiding it entirely.
- **IKEA Effect (reversed)** — they've seen the full experience before. They know what the blurred content contains. The desire to restore it is strong.
- **Anchoring** — the $2.50/mo price point is anchored against the value they've already experienced across 3 full forecasts.

**UX Flow:**

| Step | Element | Messaging |
|------|---------|----------|
| User clicks generate | 403 from `/api/generate` | Frontend intercepts and calls `/api/tease` instead |
| Tease loads | Bite Score + Weather | **Fully visible.** Real data from the scientific engine (no AI cost). |
| Tease loads | Strategy, Lures, Chart, Intel | **Blurred** (8px blur + 40% opacity). Content is visible but unreadable. |
| Tease loads | Inline CTA | *"The bite score is yours. The strategy isn't. Unlock for $2.50/month →"* |
| User clicks CTA | Paywall modal opens | Existing paywall with pricing, promo codes, restore options. |

**Key Design Notes:**
- The tease-wall should feel like a natural continuation of the app, not a punishment.
- The bite score MUST be real — using a fake score would destroy trust.
- The blur should be strong enough to make text unreadable but soft enough that the user can tell there IS valuable content behind it.
- The CTA copy uses "yours" language — the bite score belongs to them. Only the strategy is locked.

---

## Usage Counter States

| State | Remaining | Color | Header Text | Notes |
|-------|:-:|------|-------------|-------|
| Fresh user | 3 | Cyan/neutral | `3 forecasts left` | Subtle, no urgency |
| After #1 | 2 | Cyan/neutral | `2 forecasts left` | Still calm |
| After #2 | 1 | Amber/yellow | `1 forecast left` | Scarcity building |
| After #3 | 0 | Red | `0 forecasts left` | Maximum urgency |
| Exhausted (tease-wall active) | 0 | Red | `Upgrade for unlimited` | Clickable → opens paywall |
| Pro subscriber | ∞ | Gold | `PRO` | Status signal |

---

## Implementation Checklist

### Already Complete ✅
- [x] Persistent free-tier tracking (3 lifetime per device)
- [x] Tease-wall backend (`/api/tease` endpoint + `generateTeaseForecast` method)
- [x] Tease-wall frontend (blur + CTA + `showTeaseWall`/`hideTeaseWall`)
- [x] Shareable forecast card (for peak-moment virality)
- [x] Usage counter in header (with color states)

### To Implement ⬜
- [ ] **Forecast #2 inline nudge** — delayed message below results when `remaining === 1`
- [ ] **Forecast #3 pre-generate warning** — dismissible notice when `remaining === 0` before the last generate
- [ ] **Forecast #3 post-results conversion banner** — persistent banner with "See Pricing →" button
- [ ] **Usage counter color transitions** — ensure amber/yellow at `remaining === 1`, red at `remaining === 0`
- [ ] **Tease-wall CTA copy testing** — A/B test different headlines:
  - A: *"The bite score is yours. The strategy isn't."*
  - B: *"You're seeing the score. But the winning strategy is behind this wall."*
  - C: *"Don't fish blind. Unlock the full strategy for $2.50/month."*

---

## Metrics to Track

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Forecast #1 → #2 return rate | 40-60% | Track usage_count transitions 0→1 |
| Forecast #2 → #3 return rate | 50-70% | Track usage_count transitions 1→2 |
| Forecast #3 → tease-wall hit rate | 30-50% | Track 403 responses on `/api/generate` |
| Tease-wall → paywall open rate | 15-25% | Track CTA clicks |
| Paywall → subscription rate | 8-15% | Track checkout completions |
| Overall free → paid conversion | 5-10% | `paid_users / total_free_users` |
| Share card generation rate | 10-20% | Track share button clicks |

---

## Psychological Principles Summary

| Principle | Where Applied |
|-----------|---------------|
| Peak-End Rule | Forecast #1 must be a peak experience |
| IKEA Effect | User-generated forecast feels owned → shareable |
| Commitment & Consistency | Returning for #2/#3 is a micro-commitment |
| Mere Exposure Effect | Repeated exposure builds familiarity |
| Loss Aversion | Forecast #3 messaging + tease-wall blur |
| Zeigarnik Effect | "What would the 4th forecast tell me?" |
| Scarcity Heuristic | Countdown from 3 → 0 with color escalation |
| Anchoring | $2.50/mo anchored against the value of 3 full forecasts |
| Endowment Effect | They've "owned" the full experience for 3 forecasts — losing it hurts |
| Reciprocity | 3 genuinely free, full-power forecasts create obligation |

---

## Anti-Patterns to Avoid

- ❌ **Degrading Forecast #3** — don't reduce features on the last free forecast. It must be the best.
- ❌ **Premature pricing display** — don't show pricing during Forecasts #1 or #2. Let the value build first.
- ❌ **Surprise paywall** — Forecast #3's pre-generate warning ensures the tease-wall isn't a shock.
- ❌ **Fake urgency** — don't add countdown timers or "limited time" pressure. The 3-forecast limit IS the urgency. It's real.
- ❌ **Blocking the bite score** — the tease-wall must ALWAYS show the real score. Hiding it kills trust and reduces the desire to unlock the rest.
- ❌ **Over-modalizing** — don't interrupt the experience with popups. Inline CTAs and banners respect the user's attention.
