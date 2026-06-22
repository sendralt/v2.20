# Spec: Science Engine Overhaul

## Objective

Implement all 18 findings from the Science Review Report (`docs/science-review-report.md`) to transform the FishSmart Pro forecasting engine from a reasonable heuristic into a scientifically rigorous, complete, and honest model. The existing formula architecture is preserved and enhanced — not rewritten.

### User Stories
- As an angler, I want bite predictions that account for spawning behavior and dissolved oxygen so summer and spring forecasts are accurate.
- As an angler, I want lure recommendations that respect season and temperature so I'm never told to throw topwater in winter.
- As an angler, I want confidence ranges (e.g., "55-70%") so I understand the uncertainty in the prediction.
- As an angler, I want water temperature sources clearly labeled (USGS-live vs estimated) so I know how much to trust the data.
- As an angler fishing at night, I want the engine to know my target species is nocturnal and score accordingly.

---

## Assumptions

1. **Existing architecture is preserved.** The formula structure (metabolic base x environmental adjustment x EMA smoothing -> score) is enhanced, not replaced.
2. **New factors (DO, spawning, thermocline) are modeled as proxies.** We use scientifically-grounded seasonal/latitudinal models — no live DO sensors or thermocline probes.
3. **No new external API dependencies.** DO, spawning, thermocline, and lunar models are computed from date, latitude, temperature, and species data already available.
4. **No catch-data calibration in this spec.** This improves model structure. Calibration is a separate future project.
5. **Species data expansion comes from public fisheries literature** with citations.
6. **Existing tests are the baseline.** All must pass unless a formula value changes, in which case the test is updated with a justification comment.
7. **CommonJS + JSON data files + Node native test runner** — tech stack is unchanged.

---

## Tech Stack

- **Runtime:** Node.js (CommonJS, `'use strict'`)
- **Data:** JSON files (`fishingData.json`, `lures.json`)
- **Testing:** Node native test runner (`node --test`)
- **External APIs:** USGS (water temp), Open-Meteo/OpenWeather (weather), Gemini (AI strategy)

---

## Commands

```bash
npm run dev                          # Start dev server
npm run lint                         # ESLint
npm test                             # All tests
npm test -- --grep "metabolic"       # Specific module tests
node tests/benchmark-bite-score.js   # Benchmarking
```

---

## Project Structure (engine modules under scope)

```
app/src/engine/
├── bite-score.js          → MODIFY: wire sensitivity, fix 4th-root, add confidence bands
├── metabolic.js           → MODIFY: fix T_max with species-specific UILT
├── activity-forecast.js   → MODIFY: integrate new multipliers
├── water-temp.js          → MODIFY: latitude-adjusted baselines, international fallback
├── pressure-trend.js      → MODIFY: wire sensitivity-based scaling
├── lure-scorer.js         → MODIFY: seasonal + depth filtering
├── dissolved-oxygen.js    → NEW: seasonal DO proxy model
├── spawning.js            → NEW: species-specific spawning cycle model
├── thermocline.js         → NEW: seasonal thermocline depth estimation
├── lunar.js               → NEW: deterministic moon phase
├── photoperiod.js         → NEW: day length / photoperiod model

app/data/
├── fishingData.json       → EXPAND: richer species schema + new species
├── lures.json             → EXPAND: more lures, use existing unused fields

app/src/services/
├── ai.js                  → MODIFY: full research context, computed moon phase
├── fish-data-enhancer.js  → NEW: dynamic research-doc extraction for AI
```

---

## Code Style

- **CommonJS** (`require/module.exports`), `'use strict'` header
- **Factory functions** for engine components (`createBiteScoreEngine`)
- **Named constants** at module top, capitalized with JSDoc citations
- **Pure functions** for mathematical models (`calculateMetabolicEfficiency`)
- **Error handling** returns explicit error objects, never silent fallbacks

```javascript
'use strict';

/** BITE_DIVISOR: Global scoring dampener. [Source: heuristic, calibrated against benchmarks] */
const BITE_DIVISOR = 1.2;

/**
 * Calculate metabolic efficiency percentage.
 * @param {number} currentTemp - Current water temperature (F)
 * @param {{ opt: number, dorm: number, tilt: number }} metrics - Species thermal metrics
 * @returns {number} Efficiency 1-100 (integer)
 */
function calculateMetabolicEfficiency(currentTemp, metrics) { ... }
```

---

## Testing Strategy

- **Framework:** Node native test runner (`node --test`)
- **Location:** `app/tests/`
- **Rule:** Every new function, multiplier, and threshold gets unit tests.
- **Existing tests:** Must pass unchanged unless a formula value changes.
- **When values change:** Update the assertion with a comment explaining the new value.
- **New test files:** `dissolved-oxygen.test.js`, `spawning.test.js`, `thermocline.test.js`, `lunar.test.js`, `photoperiod.test.js`, `fish-data-enhancer.test.js`
- **Benchmarks:** Update existing benchmarks; add new ones for new modules.

**New tests required for:**
- DO model (above/below threshold, seasonal stratification)
- Spawning model (pre-spawn, active-spawn, post-spawn phases)
- Thermocline model (stratified vs isothermal)
- Lunar model (known dates to known phases)
- Photoperiod model (solstice, equinox, different latitudes)
- Lure scorer (seasonal filter, depth filter, expanded catalog)
- Bite-score (sensitivity integration, 4th-root removal, confidence bands, nocturnal multipliers)
- Metabolic (T_max fix, species-specific upper limits)
- AI integration (full research context, computed moon phase)
- Species data (all species have expanded schema fields)

---

## Boundaries

- **Always do:**
  - Run tests before and after every change
  - Follow CommonJS conventions and existing style
  - Add JSDoc citations for all magic numbers and thresholds
  - Add unit tests for every new function, multiplier, and threshold

- **Ask first:**
  - Changing BITE_DIVISOR or EMA_ALPHA globally (affects all scores)
  - Updating species optimal temperatures or T_max formulas
  - Changing the public API response shape

- **Never do:**
  - Commit secrets or API keys
  - Remove or skip existing tests without explicit justification
  - Change the public API contract without coordination
  - Add new external API dependencies for DO/spawning/thermocline

---

## Success Criteria

1. All 18 recommendations from the science review are implemented.
2. Existing tests pass (with justified updates where formulas change).
3. Every magic number has a JSDoc citation or justification comment.
4. Bite probability output includes confidence bands (e.g., "55-70%").
5. Lure scorer filters by season and temperature — no topwater in 38F water.
6. AI receives full or dynamically extracted research document — no hard 5000-char truncation.
7. Moon phase computed deterministically, not generated by AI.
8. Pressure multiplier scales with species sensitivity.
9. 4th-root dampening removed — environmental factors have realistic impact.
10. T_max uses species-specific upper thermal limits.
11. Nocturnal species have night-time multipliers > 1.0.
12. International water temp fallback uses latitude-adjusted baselines.
13. Species data schema includes spawning temps, DO tolerance, preferred depth, forage base, turbidity preference.
14. Lure catalog has at least 35 lures with missing categories added (flies, drop-shot, jerkbait, etc.).
15. Water temperature source is clearly flagged in all responses.
16. Methodology disclaimer included in API response.
17. No new external API dependencies required.
18. Engine's 95th percentile response time stays under 500ms.

---

## Resolved Decisions

1. **BITE_DIVISOR recalibration:** Run benchmarks after the 4th-root fix (Task 3). If the median score shifts significantly, recalibrate BITE_DIVISOR to keep scores in a reasonable range. Decision is data-driven from benchmark output.
2. **DO model complexity:** Use a **wind-driven mixing matrix** — not a simple seasonal proxy. The DO model incorporates wind speed and water temperature into a matrix that models oxygen dissolution and wind-driven surface mixing. This is more scientifically rigorous than a pure seasonal proxy.
3. **Thermocline model:** **Incorporate wind data** from the weather service already fetched. Wind-driven mixing affects thermocline depth. The model uses latitude, date, surface temperature, and wind speed to estimate thermocline depth.
4. **Species data sources:** Cite **most recent publications** from fisheries journals (Transactions of the American Fisheries Society, North American Journal of Fisheries Management, Journal of Fish Biology) and state/federal agency reports (USGS, state DNR). Prefer publications from the last 10 years.
5. **International water temp APIs:** **Deferred to a future feature.** This spec focuses on latitude-adjusted baselines for the estimation fallback. ECCC (Canada) and Copernicus (Europe) API integration will be a separate future enhancement.
6. **Confidence band method:** **Dynamic band** based on multiplier spread. When environmental multipliers are moderate and in agreement, the band is narrow (~5%). When conditions are extreme or volatile, the band widens (~12%). This is more scientifically honest than a fixed ±8%.
7. **Photoperiod integration:** **Supplement (layered approach).** Photoperiod is added as a bonus multiplier on top of the existing static time-of-day windows. The hardcoded windows (5-8, 17-20) remain as baseline; photoperiod adds seasonal correction (e.g., December dawn is later than June dawn). Lower risk than full replacement, keeps existing tests green.
