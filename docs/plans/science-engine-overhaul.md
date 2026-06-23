# Implementation Plan: Science Engine Overhaul

## Overview

Implement all 18 recommendations from the Science Review Report across 4 phases: (1) Fix existing flaws in the scoring formula, (2) Add critical missing science modules, (3) Expand data and coverage, (4) Present output honestly. The existing formula architecture (metabolic base x environmental adjustment x EMA smoothing -> score) is preserved and enhanced throughout.

## Architecture Decisions

- **Sensitivity scaling as a multiplier modifier:** The existing `sensitivity` field (High/Medium/Low) scales the pressure-trend multiplier rather than creating a new model. High sensitivity = wider multiplier spread, Low = narrower.
- **4th-root replaced with square root:** `Math.sqrt(Math.sqrt(x))` becomes `Math.sqrt(x)` — restores meaningful environmental impact while keeping some dampening.
- **T_max = feeding cessation temperature (NOT UILT/CTMax):** Each species gets a `feeding_cease_temp` field representing the upper boundary of active feeding (~85-90°F for LMB), NOT the lethal limit (~99°F). T_opt values also re-evaluated per species against preferred feeding temperatures. Metabolic curve replaces cubic decay with a plateau model.
- **New modules are pure functions:** DO, spawning, thermocline, lunar, and photoperiod are stateless pure functions returning a multiplier (0.0-1.5) that slots into the adjustment factor.
- **Dynamic research extraction:** `fish-data-enhancer.js` extracts the relevant species section from the research doc by header matching, instead of hard-truncating.
- **Confidence bands from multiplier spread:** Band width is computed from how extreme the environmental multipliers are (wide spread = wider band).

---

## Task List

### Phase 1: Fix Existing Flaws (P0)

---

### Task 1: Fix T_max calculation in metabolic.js

### Task 1: Overhaul metabolic curve — plateau model, T_max, and T_opt

**Description:** Three interconnected fixes to the metabolic efficiency model:
(1) Replace cubic decay `(1-x)³` with a **plateau model** that maintains ~95-100% efficiency from T_opt through a broad peak zone (T_opt + ~8°F), then decays gradually — matching real fish thermal performance curves and the project's own feeding activity table.
(2) Redefine T_max as **species-specific feeding cessation temperature** (~85-90°F for LMB), NOT UILT/CTMax (~99°F lethal limit). This is a feeding prediction engine, not a survival model.
(3) **Re-evaluate T_opt per species** — current values may be too low (e.g., LMB T_opt=72°F but 75-85°F is peak feeding per project data; likely needs ~78-80°F).

**Acceptance criteria:**
- [ ] Cubic decay `(1-x)³` replaced with plateau model: efficiency holds at ~95-100% from T_opt to T_opt+8°F, then decays gradually to feeding cessation
- [ ] `calculateMetabolicEfficiency()` uses `metrics.feeding_cease_temp` (NOT `uilt`/CTMax) as upper boundary
- [ ] Each species in `fishingData.json` has `feeding_cease_temp` and `T_opt` fields with cited values from behavioral fisheries literature (Carlander 1977, state DNR feeding tables)
- [ ] T_opt re-evaluated per species against preferred feeding temperatures (not lab metabolic optima)
- [ ] Fallback defaults provided when fields are missing
- [ ] JSDoc citations added: T_max rationale (feeding cessation vs lethal), plateau model (Fry 1971, Brett 1971), T_opt sources
- [ ] Verify: LMB at 78°F outputs >80% efficiency (not 17%), LMB at 85°F outputs ~20-30% (not ~0%)
- [ ] Existing metabolic tests updated with new expected values and justification comments
- [ ] All tests pass

**Verification:**
- `npm test -- --grep "metabolic"`
- `node tests/benchmark-bite-score.js` — verify warm-water scores (75-85°F range) are now elevated, not suppressed
- Manual: plot efficiency curve for LMB from 45-90°F and verify broad plateau + gradual decline

**Dependencies:** None

**Files:**
- `app/src/engine/metabolic.js`
- `app/data/fishingData.json`
- `app/tests/metabolic.test.js`

**Scope:** Medium (3 files)

---

### Task 2: Wire up the `sensitivity` field in bite-score.js

**Description:** Use the existing `sensitivity` field (High/Medium/Low) to scale the pressure-trend multipliers. High-sensitivity species (walleye, crappie, trout) get wider multiplier swings; Low-sensitivity species (catfish, bullhead, pike) get narrower swings.

**Acceptance criteria:**
- [ ] A `getSensitivityScaler(sensitivity)` function maps High -> 1.3x, Medium -> 1.0x, Low -> 0.7x spread on the trend multiplier deviation from 1.0
- [ ] `calculateScientificStrategy()` applies the scaler to `trendMult`
- [ ] Unit tests verify: walleye (High) gets a larger penalty on rising pressure than catfish (Low)
- [ ] JSDoc explains the biological basis (physostomous vs physoclistous swim bladders)
- [ ] All existing tests pass

**Verification:**
- `npm test -- --grep "bite-score"`
- `npm test -- --grep "multi-factor"`

**Dependencies:** None

**Files:**
- `app/src/engine/bite-score.js`
- `app/tests/bite-score.test.js` or `app/tests/multi-factor.test.js`

**Scope:** Small (2 files)

---

### Task 3: Fix 4th-root dampening in bite-score.js

**Description:** Replace `Math.sqrt(Math.sqrt(windMult * lightMult * timeMult * clarityMult))` (4th root) with `Math.sqrt(windMult * lightMult * timeMult * clarityMult)` (square root). This doubles the impact of environmental factors from ±15% to ±30%.

**Acceptance criteria:**
- [ ] Line 206 of `bite-score.js` uses `Math.sqrt()` not `Math.sqrt(Math.sqrt())`
- [ ] JSDoc comment explains the change and rationale
- [ ] Benchmark run shows score spread has widened (not just shifted uniformly)
- [ ] Existing tests updated with new expected values and justification comments
- [ ] All tests pass

**Verification:**
- `npm test -- --grep "bite-score"`
- `node tests/benchmark-bite-score.js` — compare score distribution before/after

**Dependencies:** Task 2 (sensitivity may interact with the adjustment factor)

**Files:**
- `app/src/engine/bite-score.js`
- `app/tests/multi-factor.test.js`

**Scope:** Small (2 files)

---

### Task 4: Add species-specific time-of-day multipliers

**Description:** Add a `nocturnal` boolean to species data. Nocturnal species (walleye, catfish, brown trout, bullhead) get night multipliers > 1.0 instead of the current 0.85 for all species.

**Acceptance criteria:**
- [ ] `fishingData.json` has a `nocturnal` field for each species (true for walleye, catfish, brown trout, bullhead; false for others)
- [ ] `getTimeMultiplier()` accepts an optional `nocturnal` parameter
- [ ] Nocturnal species get night (21-4) multiplier of 1.20, reduced dawn/dusk multiplier of 1.00
- [ ] Non-nocturnal species unchanged (dawn/dusk 1.20, night 0.85)
- [ ] Unit tests verify walleye at 2 AM scores higher than bass at 2 AM
- [ ] All tests pass

**Verification:**
- `npm test -- --grep "bite-score"`

**Dependencies:** None

**Files:**
- `app/src/engine/bite-score.js`
- `app/data/fishingData.json`
- `app/tests/multi-factor.test.js`

**Scope:** Small (3 files)

---

### Task 5: Dynamic research-doc extraction for AI context

**Description:** Create `fish-data-enhancer.js` that extracts only the species-relevant section from the research document instead of hard-truncating at 5000 chars. This ensures the AI sees the full behavioral context for the target species.

**Acceptance criteria:**
- [ ] `fish-data-enhancer.js` exports `extractSpeciesSection(fishPatterns, speciesName)`
- [ ] Function finds the species header (e.g., `### 5. Walleye`) and extracts to the next species header
- [ ] Falls back to a 5000-char truncation only if species not found
- [ ] `ai.js` line 420 uses `extractSpeciesSection()` instead of `.substring(0, 5000)`
- [ ] Unit tests verify correct extraction for known species
- [ ] All tests pass

**Verification:**
- `npm test -- --grep "fish-data-enhancer"`
- Manual: log the extracted section length for walleye, confirm > 5000 chars available

**Dependencies:** None

**Files:**
- `app/src/services/fish-data-enhancer.js` (NEW)
- `app/src/services/ai.js`
- `app/tests/fish-data-enhancer.test.js` (NEW)

**Scope:** Small (3 files)

---

### Checkpoint: Phase 1 — Foundation Fixes
- [ ] All tests pass: `npm test`
- [ ] Benchmark: `node tests/benchmark-bite-score.js` — scores are reasonable
- [ ] Lint passes: `npm run lint`
- [ ] Review with human before proceeding to new modules

---

### Phase 2: Add Critical Missing Science (P1)

---

### Task 6: Create dissolved oxygen (DO) model

**Description:** Create `dissolved-oxygen.js` — a seasonal proxy model that estimates DO multiplier based on water temperature, month, and latitude. Warm summer water holds less oxygen; wind-driven mixing improves surface DO.

**Acceptance criteria:**
- [ ] `dissolved-oxygen.js` exports `getDOMultiplier(waterTempF, month, windMph, speciesMetrics)`
- [ ] Returns a multiplier: 1.0 at optimal DO, 0.5 at critically low DO
- [ ] Wind-driven matrix: warm water (>75F) + low wind (<3 mph) = DO stress multiplier ~0.6
- [ ] Wind-driven matrix: cold water + windy (>10 mph) = full DO multiplier ~1.0
- [ ] Matrix models oxygen dissolution (temperature-dependent) and wind-driven re-aeration (wind-speed-dependent)
- [ ] Species-specific DO tolerance via `metrics.do_tolerance` field
- [ ] JSDoc citations for DO thresholds (4 mg/L feeding cutoff, 2 mg/L stress)
- [ ] Unit tests: summer-still-warm -> low multiplier; winter-windy -> ~1.0
- [ ] All tests pass

**Verification:**
- `npm test -- --grep "dissolved-oxygen"`

**Dependencies:** None (standalone pure function)

**Files:**
- `app/src/engine/dissolved-oxygen.js` (NEW)
- `app/tests/dissolved-oxygen.test.js` (NEW)

**Scope:** Small (2 files)

---

### Task 7: Create spawning cycle model

**Description:** Create `spawning.js` — a species-specific spawning phase model. Determines if a species is in pre-spawn (aggressive feeding), active spawn (not feeding), or post-spawn (recovery) based on water temperature and species spawning data.

**Acceptance criteria:**
- [ ] `fishingData.json` expanded with `spawn_temp_start`, `spawn_temp_peak`, `spawn_temp_end` for each species
- [ ] `spawning.js` exports `getSpawningMultiplier(waterTempF, speciesName, fishingData)`
- [ ] Returns multiplier: pre-spawn = 1.2 (aggressive), active spawn = 0.4 (not feeding), post-spawn = 0.7 (recovery), outside spawn = 1.0
- [ ] Phase classification: temp < start = pre-spawn; start to end = spawning; end+5F = post-spawn
- [ ] JSDoc citations for spawning temperatures per species
- [ ] Unit tests: bass at 65F (pre-spawn) -> 1.2; bass at 68F (spawning) -> 0.4; bass at 75F (post) -> 0.7
- [ ] All tests pass

**Verification:**
- `npm test -- --grep "spawning"`

**Dependencies:** None (standalone)

**Files:**
- `app/src/engine/spawning.js` (NEW)
- `app/data/fishingData.json`
- `app/tests/spawning.test.js` (NEW)

**Scope:** Medium (3 files)

---

### Task 8: Create thermocline depth estimation model

**Description:** Create `thermocline.js` — a seasonal model estimating thermocline depth based on latitude, surface temperature, and month. Used to adjust effective water temperature for deep species (walleye, trout) in summer.

**Acceptance criteria:**
- [ ] `thermocline.js` exports `getThermoclineDepth(lat, month, surfaceTempF)` and `getEffectiveTemp(surfaceTempF, thermoclineDepth, speciesPreferredDepth)`
- [ ] Returns null in winter/spring (no stratification) and depth in feet during summer/fall
- [ ] Model: thermocline forms when surface temp > 68F, depth = 12-30 feet based on latitude and wind mixing
- [ ] Wind data from weather service integrated: sustained wind >15 mph deepens the mixing layer and pushes thermocline deeper
- [ ] `getEffectiveTemp` returns a blended temperature for the species' preferred depth
- [ ] Unit tests: summer deep lake -> thermocline at ~18ft; winter -> null
- [ ] All tests pass

**Verification:**
- `npm test -- --grep "thermocline"`

**Dependencies:** None (standalone)

**Files:**
- `app/src/engine/thermocline.js` (NEW)
- `app/tests/thermocline.test.js` (NEW)

**Scope:** Small (2 files)

---

### Task 9: Create deterministic lunar phase model

**Description:** Create `lunar.js` — a deterministic moon phase calculator using astronomical formulas. Returns phase name, illumination percentage, and a feeding multiplier. Replaces the AI's guessed moon phase.

**Acceptance criteria:**
- [ ] `lunar.js` exports `getMoonPhase(date)` returning `{ phase, illumination, feedingMultiplier, label }`
- [ ] Uses a standard astronomical algorithm (e.g., Conway's method or Jean Meeus simplified)
- [ ] Phases: New Moon, Waxing Crescent, First Quarter, Waxing Gibbous, Full Moon, Waning Gibbous, Last Quarter, Waning Crescent
- [ ] Feeding multiplier: New Moon and Full Moon = 1.1 (solunar peak), quarters = 1.0
- [ ] Unit tests: known dates (e.g., 2025-01-29 = New Moon) verify correct phase
- [ ] All tests pass

**Verification:**
- `npm test -- --grep "lunar"`
- Cross-check: https://moonphase.is for test dates

**Dependencies:** None

**Files:**
- `app/src/engine/lunar.js` (NEW)
- `app/tests/lunar.test.js` (NEW)

**Scope:** Small (2 files)

---

### Task 10: Create photoperiod model

**Description:** Create `photoperiod.js` — a day-length calculator based on latitude and date. Used to detect true dawn/dusk timing and seasonal light regimes.

**Acceptance criteria:**
- [ ] `photoperiod.js` exports `getDayLength(lat, date)` returning hours of daylight
- [ ] Exports `getCivilDawn(lat, date)` and `getCivilDusk(lat, date)` returning local hour
- [ ] Uses standard solar declination formula
- [ ] Unit tests: June solstice at 45N -> ~15.4 hours; December solstice at 45N -> ~8.9 hours
- [ ] Equinox test: ~12.0 hours everywhere
- [ ] All tests pass

**Verification:**
- `npm test -- --grep "photoperiod"`

**Dependencies:** None

**Files:**
- `app/src/engine/photoperiod.js` (NEW)
- `app/tests/photoperiod.test.js` (NEW)

**Scope:** Small (2 files)

---

### Task 11: Wire new modules into bite-score.js

**Description:** Integrate DO, spawning, thermocline, lunar, and photoperiod multipliers into the main `calculateScientificStrategy()` formula. Each new module contributes an adjustment multiplier.

**Acceptance criteria:**
- [ ] DO multiplier integrated into adjustment factor
- [ ] Spawning multiplier integrated (applied to base score, not adjustment)
- [ ] Thermocline used to adjust effective water temp for deep species
- [ ] Lunar feeding multiplier integrated into adjustment factor
- [ ] Photoperiod used to refine `getTimeMultiplier()` with true dawn/dusk
- [ ] `pressure-trend.js` modified to accept `sensitivity` scaling (from Task 2)
- [ ] All new multipliers have JSDoc citations
- [ ] All existing tests pass (update expected values where formulas change)
- [ ] New integration tests verify each module affects the final score

**Verification:**
- `npm test`
- `node tests/benchmark-bite-score.js` — no performance regression

**Dependencies:** Tasks 2, 3, 6, 7, 8, 9, 10

**Files:**
- `app/src/engine/bite-score.js`
- `app/src/engine/activity-forecast.js`
- `app/tests/multi-factor.test.js`

**Scope:** Medium (3 files)

---

### Task 12: Seasonal and depth-based lure filtering

**Description:** Modify `lure-scorer.js` to use the currently-ignored `seasons`, `temperature_band`, and `depth` fields in lure data. Filter out lures inappropriate for the current season and temperature.

**Acceptance criteria:**
- [ ] `scoreLures()` accepts `currentMonth`, `waterTemp` parameters
- [ ] Lures are filtered: if lure has `seasons` and current season doesn't match -> score 0
- [ ] Lures filtered: if `temperature_band` is "Cold" and water temp > 65F -> penalty (0.5x)
- [ ] Unit tests: topwater lure in January (water temp 38F) -> filtered out
- [ ] Unit tests: jig in summer -> retained
- [ ] All existing lure-scorer tests pass

**Verification:**
- `npm test -- --grep "lure"`

**Dependencies:** None

**Files:**
- `app/src/engine/lure-scorer.js`
- `app/tests/lure-scorer.test.js`

**Scope:** Small (2 files)

---

### Task 13: Compute moon phase in AI integration

**Description:** Modify `ai.js` to use the deterministic lunar module (Task 9) instead of asking the AI to guess moon phase. Remove the moon-phase prompt instruction and pass computed values.

**Acceptance criteria:**
- [ ] `ai.js` imports and calls `getMoonPhase()` from `lunar.js`
- [ ] The `solunar` field in the response is populated from computed values, not AI output
- [ ] The prompt no longer asks the AI to generate moon phase
- [ ] The prompt includes computed moon phase as context
- [ ] Offline mode also returns computed moon phase
- [ ] All tests pass

**Verification:**
- `npm test -- --grep "ai"`

**Dependencies:** Task 9

**Files:**
- `app/src/services/ai.js`
- `app/tests/ai.test.js`

**Scope:** Small (2 files)

---

### Checkpoint: Phase 2 — New Science Modules
- [ ] All tests pass: `npm test`
- [ ] All new test files pass individually
- [ ] Benchmark shows no performance regression
- [ ] Manual review: DO multiplier works in summer scenario
- [ ] Manual review: spawning multiplier works in spring scenario
- [ ] Review with human before proceeding to data expansion

---

### Phase 3: Expand Data and Coverage (P2)

---

### Task 14: Expand species data schema in fishingData.json

**Description:** Expand each species entry from 3 fields (opt, dorm, sensitivity) to include: `feeding_cease_temp`, `opt` (re-evaluated to preferred feeding temp), `nocturnal`, `spawn_temp_start`, `spawn_temp_peak`, `spawn_temp_end`, `do_tolerance`, `preferred_depth`, `forage_base`, `turbidity_preference`. Add citations.

**Acceptance criteria:**
- [ ] All 20 existing species have expanded fields with cited values
- [ ] At least 5 new species added (carp, gar, bowfin, sturgeon, redear sunfish)
- [ ] A validation script/test checks every species has all required fields
- [ ] `bite-score.js` and `metabolic.js` gracefully handle missing new fields with defaults
- [ ] JSDoc updated for the expanded schema
- [ ] All tests pass

**Verification:**
- `npm test -- --grep "species"`
- `node -e "const d = require('./data/fishingData.json'); d.species_data.forEach(s => { if (!s.feeding_cease_temp || !s.spawn_temp_start) console.log('MISSING:', s.name) })"`

**Dependencies:** Tasks 1, 4, 7 (fields must exist before data is added)

**Files:**
- `app/data/fishingData.json`
- `app/tests/species-data.test.js` (NEW)

**Scope:** Medium (2 files)

---

### Task 15: Expand lure catalog in lures.json

**Description:** Add at least 14 new lures (target 35+ total) to cover missing categories: live bait, flies, drop-shot, umbrella rig, glide bait, jerkbait, bladed jig, underspin. Ensure coverage for cold-water species and finesse techniques.

**Acceptance criteria:**
- [ ] Lure catalog has at least 35 entries
- [ ] At least 5 new categories represented
- [ ] Each new lure has all required fields (category, species, water_clarity, seasons, temperature_band, depth, presentation)
- [ ] At least 2 lures per major species (currently many have only 1)
- [ ] At least 3 cold-water/finesse lures for trout, salmon, steelhead
- [ ] All new entries have citations or source notes
- [ ] Existing lure-scorer tests pass
- [ ] New tests verify expanded catalog

**Verification:**
- `npm test -- --grep "lure"`
- `node -e "const d = require('./data/lures.json'); console.log('Total lures:', d.lure_catalog.length)"`

**Dependencies:** None

**Files:**
- `app/data/lures.json`
- `app/tests/lure-scorer.test.js`

**Scope:** Medium (2 files)

---

### Task 16: Latitude-adjusted seasonal water temp baselines

**Description:** Replace the hardcoded temperate North America `SEASONAL_BASE_TEMPS` in `water-temp.js` with a latitude-based model that adjusts baselines for subtropical and tropical zones. Note: This only affects the **fallback estimation path** — USGS live monitoring data remains the primary water temperature source and is unaffected. Mohseni et al. (1998) regression is NOT adopted (would be redundant with USGS sensor data).

**Acceptance criteria:**
- [ ] `estimateWaterTempHybrid()` accepts latitude and adjusts the seasonal baseline
- [ ] Latitude bands: >45N (temperate), 30-45N (subtropical), <30N (tropical)
- [ ] Florida (lat 28) January: baseline ~60F instead of 34F
- [ ] Unit tests: Florida Jan air temp 75F -> water temp ~65-70F (not 46F)
- [ ] Unit tests: Minnesota Jan stays ~34F
- [ ] Existing water-temp tests updated with latitude parameter
- [ ] All tests pass

**Verification:**
- `npm test -- --grep "water-temp"`

**Dependencies:** None

**Files:**
- `app/src/engine/water-temp.js`
- `app/tests/water-temp.test.js`

**Scope:** Small (2 files)

---

### Task 17: Add wind direction to environmental model

**Description:** Modify the wind multiplier in `bite-score.js` to account for wind direction relative to shoreline. Windblown shores concentrate baitfish and plankton.

**Acceptance criteria:**
- [ ] `getWindMultiplier()` accepts optional `windDirection` parameter (degrees)
- [ ] When direction data is available, apply a 1.1x bonus for windward shores
- [ ] When direction data is unavailable, behavior unchanged
- [ ] Unit tests verify the bonus applies correctly
- [ ] All tests pass

**Verification:**
- `npm test -- --grep "bite-score"`

**Dependencies:** None

**Files:**
- `app/src/engine/bite-score.js`
- `app/tests/multi-factor.test.js`

**Scope:** Small (2 files)

---

### Checkpoint: Phase 3 — Data and Coverage
- [ ] All tests pass: `npm test`
- [ ] Species data validation script passes for all species
- [ ] Lure catalog has 35+ entries
- [ ] Latitude-adjusted water temps verified for FL and MN
- [ ] Review with human before proceeding to output changes

---

### Phase 4: Honest Communication (P3)

---

### Task 18: Add confidence bands to bite probability

**Description:** Compute a confidence band (e.g., ±8%) for the bite probability based on the spread of environmental multipliers. Return `biteProbabilityLow` and `biteProbabilityHigh` alongside the existing `biteProbability`.

**Acceptance criteria:**
- [ ] `calculateScientificStrategy()` returns `biteProbabilityConfidence` object: `{ low, high, band }`
- [ ] Band width is derived from multiplier variance: extreme conditions = wider band (±12%), ideal conditions = narrower (±5%)
- [ ] `ai.js` passes the confidence band in its response
- [ ] Offline mode also includes confidence bands
- [ ] Unit tests verify band is symmetric around the point estimate and wider in extreme conditions
- [ ] All tests pass

**Verification:**
- `npm test -- --grep "confidence"`

**Dependencies:** Task 11 (multipliers must be integrated first)

**Files:**
- `app/src/engine/bite-score.js`
- `app/src/services/ai.js`
- `app/tests/multi-factor.test.js`

**Scope:** Medium (3 files)

---

### Task 19: Flag water temperature source in all responses

**Description:** Ensure `water_temp_source` is always present and clearly labeled in every API response — both online and offline paths.

**Acceptance criteria:**
- [ ] Every response includes `water_temp_source`: `usgs-live`, `estimated`, `hybrid-thermal-lag`, `offline`, or `error`
- [ ] When source is `estimated`, response includes `water_temp_note` explaining the estimation
- [ ] Unit tests verify the field is present in all response paths
- [ ] All tests pass

**Verification:**
- `npm test -- --grep "water"`
- `npm test -- --grep "ai"`

**Dependencies:** None

**Files:**
- `app/src/services/ai.js`
- `app/tests/ai.test.js`

**Scope:** Small (2 files)

---

### Task 20: Add methodology disclaimer

**Description:** Add a `methodology_note` field to the API response explaining the heuristic nature of the bite probability, the factors modeled, and the factors not modeled.

**Acceptance criteria:**
- [ ] Response includes `methodology_note` with a concise disclaimer (2-3 sentences)
- [ ] Text acknowledges: heuristic model, factors included, factors excluded, estimation when data is unavailable
- [ ] Offline mode includes the note
- [ ] Unit test verifies the field exists and contains key phrases
- [ ] All tests pass

**Verification:**
- `npm test -- --grep "ai"`

**Dependencies:** None

**Files:**
- `app/src/services/ai.js`
- `app/tests/ai.test.js`

**Scope:** Small (2 files)

---

### Checkpoint: Phase 4 — Honest Output
- [ ] All tests pass: `npm test`
- [ ] Confidence bands present in all bite probability responses
- [ ] Water temp source always labeled
- [ ] Methodology disclaimer present

---

## Dependency Graph

```
Phase 1 (P0):
  Task 1 (metabolic curve overhaul) ──┐
  Task 2 (sensitivity) ──────────────┤
  Task 3 (4th-root fix) ─────────────┤── Task 11 (wire modules)
  Task 4 (nocturnal time) ───────────┤
  Task 5 (AI research extraction) ───┘

Phase 2 (P1):
  Task 6 (DO model) ──────────────────┐
  Task 7 (spawning model) ────────────┤
  Task 8 (thermocline model) ─────────┼── Task 11 (wire modules) ── Task 18 (confidence)
  Task 9 (lunar model) ───────────────┤        │
  Task 10 (photoperiod model) ────────┘        ├── Task 13 (moon in AI)
  Task 12 (seasonal lure filter) ──────────────┘

Phase 3 (P2):
  Task 14 (species data) ─── depends on Tasks 1, 4, 7 fields
  Task 15 (lure catalog) ─── independent
  Task 16 (latitude temps) ─── independent
  Task 17 (wind direction) ─── independent

Phase 4 (P3):
  Task 18 (confidence bands) ─── depends on Task 11
  Task 19 (source flags) ─── independent
  Task 20 (methodology disclaimer) ─── independent
```

---

## Parallelization Opportunities

**Can be parallelized immediately (no dependencies):**
- Tasks 1, 2, 4, 5 (Phase 1, independent fixes)
- Tasks 6, 7, 8, 9, 10 (Phase 2, all standalone pure functions)
- Tasks 15, 16, 17 (Phase 3, independent data/engine changes)
- Tasks 19, 20 (Phase 4, independent output changes)

**Must be sequential:**
- Task 3 depends on Task 2
- Task 11 depends on Tasks 2, 3, 6, 7, 8, 9, 10
- Task 13 depends on Task 9
- Task 14 depends on Tasks 1, 4, 7
- Task 18 depends on Task 11

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Changing 4th-root to sqrt shifts all scores significantly | High | Run benchmarks before/after; calibrate BITE_DIVISOR if needed |
| Metabolic curve overhaul shifts scores significantly | Medium | Run benchmarks before/after; verify plateau zone produces elevated warm-water scores (75-85°F); calibrate BITE_DIVISOR if needed |
| New modules slow down response time | Medium | All new modules are pure functions with O(1) complexity; benchmark after integration |
| Species data expansion takes long | Low | Use existing fisheries literature; cite sources; can be parallelized |
| Lure catalog expansion is time-consuming | Low | Pure data addition; no engine changes; test with existing scorer |
| Confidence band formula is too complex | Low | Start with simple fixed band (±8%) and refine based on multiplier spread |

---

## Resolved Decisions

1. **BITE_DIVISOR recalibration:** Run benchmarks after Task 3 (4th-root fix). Recalibrate if median score shifts significantly. Data-driven decision from benchmark output.
2. **DO model:** Wind-driven mixing matrix (temperature + wind speed). Not a simple seasonal proxy.
3. **Thermocline model:** Incorporates wind data from weather service. Wind-driven mixing affects thermocline depth.
4. **Species data sources:** Most recent publications (last 10 years) from fisheries journals and state/federal agency reports.
5. **International water temps:** Deferred to a future feature. Latitude-adjusted baselines only in this spec.

## Resolved Decisions (continued)

6. **Confidence band method:** **Dynamic band** based on multiplier spread (5-12%). Narrow when conditions agree, wide when conditions are extreme. More scientifically honest than fixed ±8%.
7. **Photoperiod integration:** **Supplement (layered).** Photoperiod is a bonus multiplier on top of existing hardcoded time windows. Lower risk, keeps tests green. Example: December 5:30 AM gets bonus 0.92 (still dark), June 5:30 AM gets bonus 1.0 (dawn confirmed).
 8. **T_max = feeding cessation temperature, NOT UILT/CTMax:** Scientific review incorrectly recommended using Upper Incipient Lethal Temperature (UILT) / Critical Thermal Maximum (CTMax, ~99°F for LMB). This is a **feeding prediction engine**, not a survival model. Fish cease active feeding at ~85-90°F, well below lethal limits. T_max must represent the **upper boundary of active feeding**, not death. Use species-specific feeding cessation temperatures from behavioral fisheries literature.
 9. **Metabolic curve shape — plateau model, not cubic decay:** The current cubic decay function `(1-x)³` causes efficiency to crash catastrophically between T_opt and T_max (e.g., 78°F = 17% efficiency for LMB, despite being peak feeding temperature). Replace with a **plateau model**: efficiency stays at ~95-100% from T_opt to T_opt+8°F (broad peak zone), then decays gradually to T_max. This matches real fish thermal performance curves (Fry 1971, Brett 1971).
10. **T_opt re-evaluation per species:** Current T_opt values may be too low. For Largemouth Bass, T_opt=72°F produces a mismatch — 75-85°F is described as peak feeding. LMB likely needs T_opt closer to 78-80°F. All T_opt changes require benchmark runs per the boundaries section.
11. **Water temperature model — USGS primary, hybrid is fallback only:** Scientific review incorrectly recommended replacing the 70/30 hybrid model with Mohseni et al. (1998) regression. The engine uses **USGS live monitoring station data** as the primary method (actual measured water temp). The 70/30 hybrid thermal lag is a last-resort fallback only. No regression model can outperform real sensor data. Mohseni regression is an optional future improvement for the fallback path only.

## All Open Questions Resolved

All 11 decisions are now baked into the spec and plan. Ready for implementation.

---

*Plan generated: 2025-06-22 | Based on Science Review Report | No code changes made*
