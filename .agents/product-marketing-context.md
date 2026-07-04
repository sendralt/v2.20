# Product Marketing Context

*Last updated: 2026-07-04*

---

## Product Overview

**One-liner:**
AI-powered fishing intelligence platform that tells you *why* fish will bite — not just *if*.

**What it does:**
FishSmart Pro combines live environmental data (weather, USGS water temperatures, barometric pressure trends) with a proprietary 10+ factor scientific engine to produce detailed, species-specific fishing forecasts. The engine calculates a transparent bite score from real biological and environmental factors before Google Gemini 3 Flash AI enhances the output with plain-language explanations, lure recommendations, and strategy tips. It's not an LLM guessing — it's real science, explained.

**Product category:**
Fishing forecast / outdoor intelligence app (Freshwater)

**Product type:**
Progressive Web App (PWA) + Android TWA (Google Play). Server-side rendered with Express.js. Installable on any device.

**Business model:**
Freemium subscription
- **Free:** 3 full AI forecasts per session (complete features, not crippled)
- **Pro Monthly:** $4.99/mo — unlimited forecasts, history, data export
- **Pro Yearly:** $29.99/yr (~$2.50/mo, 50% savings)
- Dual billing: Stripe (web) + Google Play Billing (Android)
- Prices defined in Stripe Dashboard and Google Play Console; server reads from env vars, never hardcoded

---

## Market Context

**Market size:** Global fishing app market estimated at **$1.4B in 2026**, projected to reach **$2.61B by 2033** (CAGR ~11.7%).

**Market trends:**
- Subscription price hikes by incumbents (Navionics $10 to $49.99, Fishbrain at $59.99)
- Consolidation: Garmin acquired Navionics; onX acquired TroutRoutes
- Growing demand for AI-powered forecasting and IoT hardware integration
- Privacy backlash against social fishing apps that expose fishing spots
- Angler demand for transparent, explainable recommendations over black-box scores

---

## Target Audience

**Target users:**
Freshwater recreational anglers in the United States. Primarily bank, kayak, and small-boat fishermen who value understanding conditions over collecting trophies.

**Angler segments:**
- **Science-curious anglers:** Want to understand *why* the bite is good or bad. Enjoy learning the environmental and biological factors behind fish behavior.
- **Efficiency-focused anglers:** Limited time to fish. Want to know the best window and the right lure so they maximize their time on the water.
- **Privacy-conscious anglers:** Don't want their fishing spots shared, tracked, or crowdsourced. Value solitude and discretion.
- **Budget-conscious anglers:** Refuse to pay $60-100+/year for Navionics or Fishbrain. Want a fair price for real value.

**Primary use case:**
Before a fishing trip, an angler enters their location, target species, water body, and observed conditions. FishSmart Pro returns a science-backed bite score (0-100), a 12-hour activity forecast showing the best fishing windows, AI-enhanced lure recommendations with reasoning and source transparency, and a strategy summary — all explained transparently.

**Jobs to be done:**
- "Help me understand whether it's worth going fishing right now and why"
- "Tell me the best time window to fish today so I don't waste my limited free time"
- "Recommend the right lure and presentation for the current conditions and species"
- "Give me confidence that the forecast is based on real data, not a guess"

**Use cases:**
- Planning a morning trip the night before — checking the 12-hour activity forecast
- On the water, deciding whether to stay or move based on changing pressure trends
- Trying a new species and learning what lures, depths, and presentations work in current conditions
- Reviewing past forecasts (up to 50 saved) to identify patterns in what worked
- Exporting forecast history as JSON/CSV for personal logs or analysis

---

## Angler Personas

| Persona | Cares About | Challenge | Value We Promise |
|---------|-------------|-----------|------------------|
| **The Science Angler** | Understanding the 'why' behind fish behavior | Most apps give a magic number with no explanation — feels like guessing | Transparent, factor-by-factor breakdown of every score. Learn while you fish. |
| **The Time-Starved Angler** | Maximizing limited fishing time | Doesn't know the best window to go; wastes prime hours | 12-hour activity forecast pinpoints peak windows. Best Time to Fish card. |
| **The Solo Angler** | Privacy and spot protection | Social fishing apps expose your spots to the community | Zero social features. Zero spot burning. No location sharing. Your spots stay yours. |
| **The Value Angler** | Fair price for real features | Competitors charge $60-100+/yr for less transparency | $29.99/yr with 3 free full forecasts to try. No crippled free tier. |

---

## Problems & Pain Points

**Core problem:**
Anglers don't know *why* fish are or aren't biting. Existing apps either give a meaningless magic number ("Biting: Moderate") or crowdsource fake catch reports that create noise and spot burning. Anglers are left guessing — and guessing is expensive in time, gas, and frustration.

**Why alternatives fall short:**
- **Fishbrain & social apps:** Crowdsource catch reports that are unreliable, exaggerated, or fabricated. Social features expose your fishing spots to everyone. More focused on bragging than learning.
- **Navionics & marine charts:** $49.99-100+/year. Focused on marine navigation, not freshwater bite prediction. No science-backed activity forecasts. Overkill for freshwater bank/kayak anglers.
- **Generic weather apps:** Tell you the weather but not what it means for fish. No species-specific intelligence, no bite scoring, no lure recommendations.
- **Moon/solunar calendar apps:** Use simplistic moon-phase tables with no real-time data, no water temperature, no species differentiation. One-size-fits-all.

**What it costs them:**
- **Time:** Driving to the lake at the wrong time, fishing through a dead bite
- **Money:** Gas, bait, and tackle wasted on trips during poor conditions
- **Confidence:** Never building real understanding of fish behavior — staying reliant on luck
- **Privacy:** Inadvertently exposing secret fishing spots through social apps

**Emotional tension:**
- "I only get to fish a few times a month and I don't want to waste those trips"
- "I'm tired of guessing while everyone else seems to know something I don't"
- "I don't want my fishing spots showing up on some app for everyone to see"
- "I want to actually get better at fishing, not just hope I get lucky"

---

## Competitive Landscape

**Direct competitors:**
- **Fishbrain** — Largest fishing community app (15M+ users, $65.8M funding, $59.99/yr). Falls short because: crowdsourced catch data is unreliable and creates spot burning. Social-first, science-second. Expensive premium tier. Doesn't explain *why* the bite is what it is. Black-box AI forecasts with no transparency.
- **FishAngler** — Similar social fishing app (5M users, free core features). Falls short because: same crowdsourced data problem, no transparent scientific engine, generic forecasts. Social feed creates spot exposure.

**Secondary competitors:**
- **Navionics (Garmin)** — Marine navigation powerhouse ($49.99/yr, Garmin-owned). Falls short because: marine-focused not freshwater, pricing is overkill for bank/kayak anglers, no bite prediction engine, no lure recommendations. Gold standard for lake maps but zero forecasting intelligence.
- **Anglr** — Hardware-integrated logging specialist ($35-60/yr, Bullseye sonar). Falls short because: focused on hardware logging, no scientific engine, no activity forecast.
- **TroutRoutes (onX)** — Fly fishing access specialist ($29.99-39.99/yr, onX-owned). Falls short because: trout-only species coverage, access-focused not forecast-focused, no science engine.
- **Solunar/lunar calendar apps** (Solunar Forecast, HuntWise fishing mode) — Falls short because: moon-phase-only predictions with no real-time data integration, no species specificity, no water temperature, no transparent reasoning.

**Indirect competitors:**
- **Just checking the weather app and going** — Falls short because: weather does not equal fish behavior. Air temp and wind don't tell you what's happening underwater. No species intelligence.
- **Asking at the local tackle shop** — Falls short because: anecdotal, not real-time, limited to one person's recent experience, no scientific backing.

---

## Differentiation

**Key differentiators:**
- **Science-first engine, not LLM guessing:** A deterministic 10+ factor scoring engine calculates the bite score from real environmental and biological data *before* AI enhances the output. The AI explains the science — it doesn't generate the forecast.
- **Transparent reasoning:** Every score comes with a factor-by-factor breakdown. Anglers see exactly which conditions are helping or hurting the bite. No black boxes.
- **AI-augmented lure recommendations with source transparency:** Engine-matched lures and AI-suggested lures are merged into a single score-ranked list (cap 5). Each lure is tagged with its source — 'engine' or 'ai' — so anglers know exactly what they're trusting. No competitor offers this.
- **Live USGS water temperature:** Real monitoring station data — not estimates, not guesses. Actual water temperature with station name and distance shown for full transparency.
- **Species-specific intelligence:** 25 freshwater species, each with its own biological profile. The engine models how each species responds to water temperature, pressure, and conditions differently.
- **Zero social, zero spot burning:** No crowdsourced data, no catch sharing, no social feed. Your fishing spots stay yours. Privacy is a feature, not a setting.
- **Honest free tier:** 3 full-power AI forecasts per session — not a crippled demo. Every feature works. No paywall on the science.
- **Data portability:** JSON/CSV export for forecast history — the only fishing app offering full data export. Your data stays yours.
- **Best price-to-value:** $29.99/yr is less than half of Fishbrain ($59.99) and significantly cheaper than Navionics ($49.99) with more freshwater-specific intelligence.

**How we do it differently:**
We built a scientific engine from ichthyological research — modeling fish metabolism as a biological function of water temperature, cross-referencing it with live barometric pressure trends (with species-specific sensitivity scaling), wind (with cold-water chill penalties), cloud cover, clarity, and solar position (using exact civil twilight calculations). The engine also models dissolved oxygen availability from temperature and wind-driven mixing, spawning cycle phases from water temperature thresholds, thermocline depth in stratified lakes, and lunar phase — giving it 10+ biological and environmental factors. The engine runs deterministically with EMA-smoothed scoring (bounded LRU cache, 500 locations, 24h TTL, 3h stale entry replacement) for stability. Then — and only then — does Google Gemini 3 Flash AI translate the engine's output into a clear, plain-language forecast with lure picks and strategy. For lure recommendations specifically, the engine's scientifically-matched picks are merged with Gemini's complementary suggestions, deduplicated by name, ranked by score, and capped at 5 — each tagged by source for full transparency.

**Why that's better:**
An LLM can hallucinate. An LLM can guess. But a deterministic engine built on biological research produces consistent, explainable, reproducible results. When the bite score says 78, you can trace it back to: falling barometric pressure (feeding trigger), water temp near the species' metabolic optimum, moderate wind creating surface chop, and overcast skies extending the feeding window. That's not a guess — that's science. And when you see a lure recommendation, you know whether it came from the engine's biological models or Gemini's broader knowledge — and can judge accordingly.

**Why customers choose us:**
- They're tired of magic numbers with no explanation
- They want to *learn* what makes fish bite, not just be told a score
- They refuse to pay Navionics/Fishbrain prices for a freshwater app
- They value their privacy and their secret spots
- They want real data (USGS water temp), not estimates
- They want more lure variety with transparency about where recommendations come from

---

## The Science (Public-Facing Explanation)

> **Note:** This section describes the science at a conceptual level for marketing and educational purposes. The proprietary implementation details — exact formulas, weighting constants, multiplier curves, and smoothing algorithms — are trade secrets and must NOT be included in any public-facing material.

### How the Bite Score Works (What We Tell the World)

The FishSmart Pro Bite Score is calculated by a 10+ factor scientific engine that evaluates real environmental conditions against species-specific biological models — before any AI touches it.

**The 10+ factors the engine considers:**

| Factor | What It Measures | Why It Matters |
|--------|-----------------|----------------|
| **Barometric Pressure Trend** | Whether pressure is rising, falling, or stable (and how fast) — with species-specific sensitivity scaling | Falling pressure triggers feeding instincts in fish — it signals an approaching front. Rising pressure signals a slowdown. The trend matters more than the absolute number. Different species have different sensitivity to pressure changes (e.g., walleye are more sensitive than catfish). |
| **Water Temperature** | Live USGS monitoring station data (not estimates), adjusted for thermocline depth | Fish are cold-blooded. Their metabolism — and therefore their willingness to feed — is directly driven by water temperature. Each species has an optimal temperature range. During summer stratification, the engine estimates thermocline depth and calculates effective temperature for deep-dwelling species. |
| **Metabolic Efficiency** | How close the current water temp is to the species' biological optimum | Modeled from ichthyological research on fish metabolism. Too cold = sluggish. Too hot = stressed. The sweet spot = active feeding. |
| **Dissolved Oxygen** | Estimated oxygen availability from water temp and wind-driven mixing | Fish need oxygen to feed actively. Warm water holds less oxygen, and calm conditions allow stagnation. The engine models DO solubility from temperature and wind-driven re-aeration. When metabolic demand is high but oxygen is low, feeding activity drops — a compounding thermal-oxygen stress effect. |
| **Spawning Cycle** | Pre-spawn, active spawn, or post-spawn phase based on water temp and species | Fish behavior changes dramatically across spawning phases. Pre-spawn = aggressive feeding (1.2x). Active spawn = nest guarding, minimal feeding (0.4x). Post-spawn = recovery period. The engine detects which phase each species is in based on water temperature thresholds. |
| **Thermocline Depth** | Estimated depth of the temperature transition layer in stratified lakes | During summer, lakes stratify into warm surface water and cold bottom water separated by a thermocline. Deep-dwelling species (walleye, trout, striped bass) hold near the thermocline. The engine adjusts effective water temperature based on estimated thermocline depth. |
| **Lunar Phase** | Moon phase angle (new moon to full moon) | Moon phase affects fish behavior through light availability (night feeding) and gravitational effects. The engine calculates exact lunar phase and applies species-appropriate weighting. |
| **Photoperiod** | Civil dawn and dusk times for the angler's latitude and date | Fish are most active during crepuscular periods (dawn/dusk). The engine calculates exact civil twilight times for the angler's location using astronomical formulas — not generic time ranges. |
| **Wind Speed** | Current wind conditions, with wind-chill penalty in cold water | Light-to-moderate wind creates surface chop that breaks up light penetration and makes fish less cautious. Strong wind suppresses feeding and makes fishing difficult. In cold water (<50°F), strong wind (>15 mph) applies an additional wind-chill penalty. |
| **Cloud Cover** | Percentage of sky obscured, with seasonal clarity-light interaction | Overcast skies reduce light penetration, extending feeding windows beyond the typical dawn/dusk peaks. Fish feel safer feeding in diffuse light. In cold water, clarity and cloud cover interact more strongly (geometric mean) — fish rely more on visual cues. |
| **Water Clarity** | Angler-reported visibility (Gin Clear to Muddy) | Clarity determines lure choice: stained water favors reaction baits (vibration/color), clear water favors finesse presentations (natural/stealthy). |
| **Time of Day** | Solar position using gradient time multiplier with ±1.5hr crepuscular window | Fish are most active during low-light periods (dawn/dusk). The engine uses smooth gradient transitions around civil dawn/dusk rather than hard cutoffs, with proper midnight wraparound calculation. |

### The Philosophy: Engine First, AI Second

Most fishing apps either:
1. Ask an AI to generate a forecast from scratch (unreliable, hallucination-prone, inconsistent)
2. Show a magic number with no explanation (trust us, bro)

FishSmart Pro does neither. The scientific engine calculates a deterministic bite score from real data and biological models. Then Google Gemini 3 Flash AI takes that structured, scientifically-grounded output and translates it into:
- A plain-language forecast summary ("Strong morning bite expected...")
- Species-specific lure recommendations — both engine-matched and AI-suggested, merged and ranked by score with source badges
- Strategy and technique tips tailored to conditions
- A 12-hour activity forecast (also engine-derived, not AI-generated)

The AI enhances the science. It doesn't replace it.

### AI-Augmented Lure Recommendations

FishSmart Pro's lure system combines two sources into one transparent, ranked list:
1. **Engine lures** — Deterministic picks from the scientific engine, scored by clarity fit, strategy match, and bite probability. Grounded in species biology and conditions.
2. **AI lures** — Complementary suggestions from Gemini, scored 0.0-1.0 on how well they match current conditions. Fills gaps the offline catalog can't cover.

Both are normalized to the same scale, deduplicated by name, and capped at 5 total. Each lure displays a **source badge** — gear icon for engine, robot icon for AI — so anglers know exactly what they're trusting. In offline mode (no Gemini), only engine lures are shown.

### Why USGS Water Temperature Matters

Most fishing apps estimate water temperature from air temperature — which is wildly inaccurate. Air temp of 75F could mean water temp of 60F or 80F depending on depth, flow, recent weather, and season.

FishSmart Pro pulls **live data from USGS monitoring stations** — the same sensors used by federal agencies for water resource management. When we show you the water temperature, we show you the actual station name and how far it is from your location. Full transparency. No estimates.

---

## Objections & Anti-Personas

| Objection | Response |
|-----------|----------|
| "AI fishing forecasts are unreliable" | Our AI doesn't generate the forecast — a deterministic scientific engine does. The AI only translates the engine's output into plain language. The science is real and reproducible. |
| "$29.99/year is still a subscription" | 3 free full-power forecasts per session, every session. And $29.99/yr is less than half of Fishbrain ($59.99/yr) and significantly cheaper than Navionics ($49.99/yr) with more freshwater-specific intelligence. Your price is locked for 12 months. |
| "I don't trust app bite forecasts" | Every score comes with transparent factor-by-factor reasoning. You can see exactly which conditions are driving the score. No black box. If you disagree with a factor, you can see why and adjust. |
| "I already have a fishing app" | Does it explain *why* the bite score is what it is? Does it use live USGS water temp? Does it have zero social features? Does it cost less than $30/year? Does it let you export your data? |
| "I prefer my own experience" | FishSmart Pro doesn't replace your experience — it enhances it with real-time data and biological models you can't see with your eyes. Use it alongside your instincts. |
| "Are the AI lure recommendations trustworthy?" | Every lure is tagged by source — 'engine' or 'ai'. Engine lures come from biological models; AI lures come from Gemini's broader knowledge. You see the source badge and can judge accordingly. |

**Anti-persona (NOT a good fit):**
- **Social anglers** who want to share catches, build a following, or see what others are catching. We have zero social features by design.
- **Saltwater/marine anglers** — we're freshwater-focused with 25 freshwater species. No marine charts or tide data.
- **Tournament anglers** seeking crowdsourced real-time catch data and community intel — that's a different product.
- **Anglers who want a free app forever** with no limits — we offer 3 free forecasts per session, but unlimited requires a fair-priced subscription.
- **Anglers who need lake maps/navigation** — we deliberately don't include mapping. Navionics is the right choice for that.

---

## Switching Dynamics

**Push (away from current solutions):**
- "Fishbrain showed my secret spot to everyone"
- "Navionics costs $50/year and doesn't even predict the bite"
- "The magic number app never explains why the score is what it is"
- "Crowdsourced catch reports are full of fake data"

**Pull (toward FishSmart Pro):**
- Science-backed transparency — see the reasoning behind every forecast
- Live USGS water temperature — real data, not estimates
- 12-hour activity forecast — know the best window, not just a score
- AI-augmented lure recommendations with source transparency — more variety, clear sourcing
- Zero social, zero spot burning — your spots stay yours
- $29.99/year — fair price for real intelligence, half of Fishbrain
- JSON/CSV data export — your data is yours to keep

**Habit (what keeps them stuck):**
- "I already paid for Navionics/Fishbrain, switching feels wasteful"
- "I've learned the UI of my current app"
- "I check the weather app out of habit before fishing"

**Anxiety (what worries them about switching):**
- "Will this app's science actually be better?"
- "Is the free tier actually usable or just a tease?"
- "Will I lose my fishing history if I switch?"

---

## Customer Language

**How they describe the problem:**
- "I never know if it's actually worth driving out there"
- "The fish were biting yesterday but I don't know why they stopped today"
- "These apps just give you a number — what does 'moderate' even mean?"
- "I'm wasting my Saturday mornings on dead water"
- "I don't want my spots on some map for everyone to see"

**How they describe what they want:**
- "Just tell me the best time to go and what to throw"
- "I want to actually understand fish behavior, not just get a score"
- "Is the water temp from a real station or did you just guess it?"
- "I want something that works for bass, crappie, and walleye"

**Words to use:**
- Science-backed, scientifically-grounded
- Transparent, reasoning, explanation
- Real data, live data, USGS
- Species-specific, biological
- Bite score, activity forecast
- Privacy-first, no spot burning
- Freshwater
- Honest, fair price
- Engine-matched, AI-suggested, source-tagged
- Data export, portable

**Words to avoid:**
- Magic number, prediction (implies guessing)
- Crowdsourced, community catches (we're explicitly anti-this)
- Algorithm, AI-generated (AI is enhancement, not the source)
- Premium, pro-tier (sounds expensive/exclusive)
- Guessing, estimating (we use real data)
- Social, sharing, feed

**Glossary:**

| Term | Meaning |
|------|--------|
| **Bite Score** | 0-100 score calculated by the scientific engine from 10+ environmental and biological factors. Transparent — you see every factor. EMA-smoothed for stability. |
| **Activity Forecast** | Hour-by-hour prediction of fishing activity for the next 12 hours. Derived from the engine, not AI. Includes a "Best Time to Fish" window. |
| **Metabolic Efficiency** | How active a species' metabolism is at the current water temperature, modeled from ichthyological research. Expressed as a percentage. |
| **Pressure Trend** | Whether barometric pressure is rising, falling, or stable — and how rapidly. Key feeding trigger indicator. |
| **Strategy Type** | Whether conditions favor Reaction baits (aggressive, feeding fish), Finesse baits (neutral/inactive fish), or a Balanced approach. |
| **USGS Water Temp** | Real-time water temperature from U.S. Geological Survey monitoring stations. Not estimated from air temperature. |
| **Engine Lure** | A lure recommendation from the deterministic scientific engine — scored by clarity fit, strategy match, and bite probability. |
| **AI Lure** | A complementary lure suggestion from Gemini AI — fills gaps the offline catalog can't cover. |
| **Source Badge** | Visual indicator on lure cards showing whether a recommendation came from the engine (gear icon) or AI (robot icon). |
| **Dissolved Oxygen (DO)** | Estimated oxygen availability in the water, modeled from temperature-driven solubility and wind-driven re-aeration. Low DO suppresses feeding — a compounding thermal-oxygen stress effect. |
| **Spawning Cycle** | The reproductive phase a species is in (pre-spawn, active spawn, post-spawn), detected from water temperature. Pre-spawn fish feed aggressively; actively spawning fish rarely feed. |
| **Thermocline Depth** | The estimated depth of the temperature transition layer in stratified lakes. Used to calculate effective water temperature for deep-dwelling species like walleye and trout. |
| **Lunar Phase** | The moon phase angle calculated for the forecast date. Influences night-feeding behavior through light availability and gravitational effects. |
| **Photoperiod** | The exact civil dawn and dusk times calculated from the angler's latitude and date using astronomical formulas. Determines the crepuscular feeding windows. |
| **EMA Smoothing** | Exponential Moving Average applied to bite scores for stability — prevents jittery scores when conditions change rapidly. Bounded LRU cache: 500 locations, 24h TTL. |

---

## Brand Voice

**Tone:**
Confident, knowledgeable, straight-talking. We're the fishing buddy who actually studied fish biology — not the one bragging about last weekend's catch. Authoritative but never condescending. Scientific but never boring.

**Communication style:**
- **Direct:** No fluff, no hype. State what the science says.
- **Transparent:** Show the reasoning. Explain the 'why.'
- **Educational:** Help anglers learn while they fish. Every forecast teaches something.
- **Honest:** If conditions are tough, we say so. We don't inflate scores to make people feel good.
- **Respectful:** We respect anglers' intelligence, their time, and their privacy.

**Brand personality:**
- Scientific (grounded in real biology and environmental data)
- Transparent (no black boxes, no hidden logic, source-tagged recommendations)
- Independent (no social noise, no crowdsourced chaos)
- Practical (built for real fishing, not theory)
- Honest (fair pricing, honest forecasts, no manipulation)

**Voice examples:**
- GOOD: "Bite score: 78 — falling pressure is triggering feeding behavior, and water temp is near optimal for largemouth bass metabolism"
- BAD: "OMG the fish are totally biting today! Score: 78!"
- GOOD: "Tough bite. Rising pressure and midday sun are suppressing activity. Try finesse presentations in shaded areas."
- BAD: "Today's score: 24. Good luck!"
- GOOD: "Water temp: 68F from USGS Station #03534000 — 2.3 miles from your location"
- BAD: "Water temp: ~65F (estimated)"
- GOOD: "Texas Rig Worm — engine-matched (score: 92). Reason: Stained water + falling pressure favors reaction-style bottom presentations."
- BAD: "Try a Texas Rig! Trust us!"

---

## Proof Points

**Metrics:**
- 25 freshwater species with individual biological profiles
- 10+ environmental and biological factors in the bite score engine (pressure trend with species-specific sensitivity, water temp, metabolic efficiency, dissolved oxygen, spawning cycle, thermocline depth, lunar phase, photoperiod, wind with chill penalty, cloud cover, water clarity, gradient time-of-day)
- Live USGS monitoring station integration (federal data source)
- 12-hour activity forecast resolution (hourly), engine-derived (not AI-generated)
- Up to 50 forecast history records per device with JSON/CSV export
- EMA-smoothed scoring with bounded LRU cache (500 locations, 24h TTL, 3h stale entry replacement)
- Dual billing: Stripe (web) + Google Play Billing (Android)
- Scientific accuracy benchmarks: 106/106 invariants passing across both engine benchmarks
- Cookie-based device tracking (HttpOnly) for free-tier enforcement

**Technical credibility:**
- Scientific engine is deterministic and reproducible (not LLM-guessed) — 826 tests passing
- Full test suite: bite score, metabolic curves, pressure trends, activity forecast, lure scoring, AI service, session auth, Stripe billing, webhook processing, entitlement logic, billing middleware, dissolved oxygen, spawning, thermocline, lunar, photoperiod, fish data enhancer (27 test files)
- Defense-in-depth security: strict CSP (overrides Helmet), HSTS, X-Frame-Options: DENY, X-Content-Type-Options, input sanitization, URI validation, DOMPurify XSS prevention, HttpOnly cookies, rate limiting (10 req/15 min for AI; 5 req/min for promo), 100kb body size limits, Stripe webhook signature verification, x-powered-by header disabled, CVE-001 through CVE-008 security fixes (session hijacking prevention, billing auth validation)
- Accessibility: WCAG-compliant — focus trapping, aria-live regions, per-field validation, reduced-motion support, keyboard navigation
- PWA + Android TWA — installable everywhere, published on Google Play (v2.22)
- 6 PostgreSQL database migrations (Stripe billing, unique customers, free-tier tracking, promo codes, forecast history, cookie device tracking)
- Node.js >= 18.0.0, Express.js, Google Gemini 3 Flash, PostgreSQL, Tailwind CSS

**Value themes:**

| Theme | Proof |
|-------|-------|
| **Science-backed** | Multi-factor engine runs before AI. Transparent reasoning on every forecast. Species-specific metabolic models. EMA-smoothed for stability. |
| **Real data** | Live USGS water temperature with station names and distances shown. No estimates. |
| **Privacy-first** | Zero social features by design. No location sharing. No crowdsourced data. Per-device history, exportable, deletable. |
| **Honest value** | 3 free full forecasts per session. $29.99/yr — less than half of Fishbrain ($59.99), cheaper than Navionics ($49.99). Price locked for 12 months. |
| **Freshwater expertise** | 25 species: bass, walleye, trout, pike, crappie, catfish and more. Built specifically for freshwater anglers. |
| **Data portability** | JSON/CSV export for forecast history. Only fishing app offering full data export. |
| **Transparent AI** | Lure recommendations tagged by source — engine vs AI. Anglers know what they're trusting. |

---

## Launch & Marketing Readiness

**App status:**
- Deployed on Render (PWA accessible via web)
- Published on Google Play as Trusted Web Activity
- Dual billing operational: Stripe (web) + Google Play Billing (Android)
- Full test suite passing

**Marketing assets ready:**
- Email capture widget and onboarding sequence (`docs/launch-assets/email-capture-and-sequence.md`)
- Influencer outreach strategy and templates (`docs/launch-assets/influencer-outreach.md`)
- TikTok video scripts (`docs/launch-assets/tiktok-scripts.md`)
- YouTube demo script (`docs/launch-assets/youtube-demo-script.md`)
- Reddit community posts (`docs/launch-assets/reddit-posts.md`)

**Competitive intelligence:**
- Head-to-head comparison report vs. top 5 competitors (`docs/fishsmart-pro-competitor-comparison.md`)
- Deep-dive competitor profiles (`docs/fishing-apps-competitor-analysis.md`)

---

## Goals

**Business goal:**
Become the go-to freshwater fishing forecast app for science-minded, privacy-conscious anglers — displacing Fishbrain and Navionics in the freshwater segment through transparency, fair pricing, and superior AI-enhanced intelligence.

**Conversion action:**
- Free tier usage to Pro subscription (monthly or yearly)
- Primary CTA: "Get unlimited forecasts" via Stripe Checkout or Google Play Billing

**Current metrics:**
- App published on Google Play as Trusted Web Activity
- Deployed on Render (PWA accessible via web)
- Dual billing: Stripe (web) + Google Play Billing (Android)
- Forecast history with JSON/CSV export for Pro users

---

## Appendix: Engine Architecture (Non-Confidential Summary)

> **Confidentiality note:** The following is a high-level summary suitable for internal marketing alignment. Proprietary implementation details (formulas, constants, weighting curves, algorithms) are NOT included and must never appear in public-facing materials.

### Data Flow

```
User Input (location, species, water body, clarity)
         |
Scientific Engine (deterministic, 10+ factor)
  - Live weather data (OpenWeather)
  - Live USGS water temperature
  - Barometric pressure trend analysis (species-specific sensitivity scaling)
  - Species-specific metabolic model
  - Dissolved oxygen estimation (temp + wind-driven mixing)
  - Spawning cycle detection (pre-spawn / active / post-spawn)
  - Thermocline depth estimation (stratified lake model)
  - Lunar phase calculation
  - Civil dawn/dusk photoperiod (astronomical, latitude-aware)
  - Wind (cold-water chill penalty) / cloud / time / clarity multipliers
  - EMA-smoothed scoring (bounded LRU cache: 500 locations, 24h TTL, 3h stale replacement)
         |
  BITE SCORE (0-100) + Strategy Classification
         |
12-Hour Activity Forecast (engine-derived)
         |
Google Gemini 3 Flash AI Layer (enhancement only)
  - Plain-language forecast summary
  - Lure recommendations: engine picks passed as context
  - AI lures: Gemini generates complementary suggestions (scored 0.0-1.0)
  - mergeLures(): engine + AI lures combined, deduped by name, ranked by score, capped at 5, source-tagged
  - Strategy and technique tips
  - Structured, sanitized JSON response (DOMPurify on frontend)
         |
Forecast Delivered to Angler
  - Source badges on lure cards (gear = engine, robot = AI)
  - Offline mode: engine lures only
```

### Key Principle

**The engine is the product. The AI is the translator.**

Every other fishing app either skips the science or hides it. FishSmart Pro built the science first and made it transparent — all the way down to tagging individual lure recommendations by their source. That's the moat.
