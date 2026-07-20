# Spec: Manual Water Temperature Input

## Objective

Allow users to manually input a water temperature value when USGS live sensor data is wrong, unavailable, or the user has a more accurate reading (e.g., from a boat depth finder or on-shore thermometer). This overrides the automatic USGS/estimation pipeline for the current forecast only.

**User Story:**
- As an angler, I want to enter a water temperature manually so the forecast engine uses my reading instead of an unreliable or missing USGS station reading.
- The option must be selectable — when not used, the existing USGS/estimation flow is unchanged.

## Assumptions
1. Input is in **°F** (matching the existing `waterTempF` used throughout the engine).
2. Input is **optional** — the toggle defaults to OFF. When OFF, the existing USGS/estimation pipeline runs unchanged.
3. The override applies to **a single forecast request** (not persisted across sessions).
4. When manual temp is provided, the USGS fetch is **skipped entirely** (saves an API call and latency).
5. The input is validated server-side: numeric, 32–120 °F range (covers ice fishing to hot springs).
6. The source label shown in the UI changes to **"Manual Input"** when manual temp is used.
7. No changes to the lure catalog, AI prompt, or activity forecast logic are needed — they already consume `waterTemp` from the engine output.

## Tech Stack

- **Frontend:** Vanilla JS, HTML, Tailwind CSS (existing PWA)
- **Backend:** Node.js/Express, custom bite-score engine
- **Engine data flow:** `app.js → /api/generate → ai.js generateFishingStrategy → bite-score.js calculateScientificStrategy → water-temp.js`

## Commands

```bash
# Run server (dev)
cd app && npm start

# Run tests
cd app && npm test

# Run specific test
cd app && node --test tests/water-temp.test.js
```

## Implementation Plan

### Layer 1: Frontend — UI Toggle + Input (index.html, app.js)

**index.html** — Add a collapsible "Manual Water Temp" control near the boat-mode checkbox (~line 265):
- A checkbox toggle: `#manualWaterTempToggle` — "Enter water temp manually"
- A number input: `#manualWaterTempInput` — disabled when toggle is OFF
- Placeholder: "Enter °F"
- Min=32, Max=120, step=1

**app.js** — Two changes:
1. Add toggle event listener: enable/disable the input field based on checkbox state.
2. In the POST body (`/api/generate` ~line 587): conditionally include `manualWaterTemp` when toggle is ON and input is valid.

### Layer 2: API Route — Pass-through (api.js ~line 310)

- Destructure `manualWaterTemp` from `req.body`.
- Validate: if present, must be a number in [32, 120].
- Pass through to `aiService.generateFishingStrategy()`.

### Layer 3: AI Service — Thread to Engine (ai.js ~line 406)

- Accept `manualWaterTemp` in `params`.
- Pass it into the engine input object: `{speciesName, waterColor, location, lat, lon, manualWaterTemp}`.
- Both `generateFishingStrategy` and `buildOfflineStrategy` paths.
- Set `water_temp_source: 'manual'` and clear station fields when manual temp is used.

### Layer 4: Bite Score Engine — Use Override (bite-score.js ~line 318)

- Accept `manualWaterTemp` from `input` parameter.
- If provided and valid, skip `waterTempProvider` call entirely.
- Set `waterTempData = { waterTempF: manualWaterTemp, source: 'manual' }`.
- Everything downstream (thermocline, DO, spawning, lure scoring) uses this value unchanged.

### Layer 5: Frontend — Display (app.js ~line 385)

- The existing `#wxWaterSource` element shows the source label.
- Add handling: when `water_temp_source === 'manual'`, display **"Manual Input"** label.

## Code Style

Follow existing patterns:
```javascript
// Engine input threading (bite-score.js)
const { speciesName, waterColor, location, lat, lon, manualWaterTemp } = input;

// Conditional provider call
const waterTempData = (manualWaterTemp != null)
    ? { waterTempF: manualWaterTemp, source: 'manual' }
    : await waterTempProvider(latitude, longitude, airTemp, currentMonth);
```

## Testing Strategy

- **Unit test:** `bite-score.js` with `manualWaterTemp` in input → verify it uses the override, source is `'manual'`, no USGS call.
- **Unit test:** `bite-score.js` without `manualWaterTemp` → verify existing behavior unchanged.
- **Integration:** API validation — out-of-range temp returns 400.
- **Manual browser check:** Toggle ON, enter temp, generate forecast → verify UI shows "Manual Input" source and correct temp.

## Boundaries

- **Always:** Validate input server-side, keep existing USGS path as default, run tests.
- **Ask first:** Changing the water temp cache structure or adding new dependencies.
- **Never:** Persist manual temp across sessions, bypass server-side validation.

## Success Criteria

1. ✅ User can toggle a "Manual Water Temp" checkbox in the setup form.
2. ✅ When toggled ON, a number input appears (32–120 °F).
3. ✅ When manual temp is provided, the engine uses it instead of calling USGS.
4. ✅ The forecast result shows the source as "Manual Input" with the entered temp.
5. ✅ When toggled OFF, the existing USGS/estimation flow is unchanged.
6. ✅ Out-of-range or non-numeric input is rejected with a clear error.
7. ✅ All existing tests pass.

## Open Questions

1. Should the manual temp input persist across forecasts (e.g., localStorage), or reset each time? *(Assumption: resets each session for simplicity.)*
2. Should we also accept °C input with a unit toggle? *(Assumption: °F only, matching existing engine internals.)*
