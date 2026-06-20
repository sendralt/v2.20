# Implementation Plan: AI-Augmented Lure Recommendations

## Overview

Merge deterministic engine lures with AI-generated lures from Gemini into a single score-ranked list. The existing Gemini call is augmented to return an `ai_lures` array with scores. A server-side merge function combines, dedupes, and ranks all lures by score (cap 5). The frontend renders lure cards with source badges.

## Architecture Decisions

- **Score-based unified ranking**: Both engine lures (finalScore 0-1) and AI lures (score 0-1) compete on the same scale. Top 5 returned regardless of source.
- **Single Gemini call**: `ai_lures` added to existing prompt JSON schema. No extra API call.
- **Engine context passed to Gemini**: Engine's top 3 lure names are included in scientificContext so Gemini can complement rather than duplicate.
- **Merge is a pure function**: `mergeLures(engineLures, aiLures)` is independently testable.
- **Source tagging**: Each lure gets `source: 'engine'` or `source: 'ai'` for frontend badge rendering.

## Task List

### Task 1: Build and test `mergeLures()` pure function

**Description:** Create the merge/dedupe/rank/cap function that combines engine and AI lures into a single ranked list.

**Acceptance criteria:**
- [ ] Function accepts two arrays (engineLures, aiLures), returns merged array
- [ ] Normalizes names (lowercase, trim) for dedup; first occurrence wins
- [ ] Tags each lure with `source: 'engine'` or `source: 'ai'`
- [ ] Sorts by score descending
- [ ] Caps at 5 total
- [ ] Handles empty/null inputs gracefully
- [ ] Unit tests pass

**Verification:**
- [ ] Tests pass: `cd app && node --test tests/ai.test.js`

**Dependencies:** None

**Files touched:**
- `app/src/services/ai.js` (add mergeLures function)
- `app/tests/ai.test.js` (add merge tests)

**Scope:** S

---

### Task 2: Modify Gemini prompt to request `ai_lures`

**Description:** Update `buildGenerationPrompt()` to include `ai_lures` in the JSON output schema and pass engine lure picks as context.

**Acceptance criteria:**
- [ ] Prompt JSON schema includes `ai_lures` array with name, category, score, rank, cover, presentation, reason fields
- [ ] Engine lure picks (top 3 names) added to scientificContext block
- [ ] Prompt instructs Gemini to avoid duplicating engine picks
- [ ] Score field is described as 0.0-1.0 confidence/fit rating

**Verification:**
- [ ] Manual: inspect generated prompt string in dev mode

**Dependencies:** Task 1

**Files touched:**
- `app/src/services/ai.js` (modify buildGenerationPrompt and scientificContext)

**Scope:** S

---

### Task 3: Integrate merge into response pipeline

**Description:** Wire the merge function into `generateFishingStrategy()` so the final `recommended_lures` is the merged result.

**Acceptance criteria:**
- [ ] After parsing Gemini response, `ai_lures` extracted and validated
- [ ] `mergeLures(scientificData.recommendedLures, aiLures)` called
- [ ] Merged result returned as `recommended_lures` instead of engine-only
- [ ] Offline fallback unchanged (engine lures only, no AI)
- [ ] Existing tests still pass

**Verification:**
- [ ] Tests pass: `cd app && node --test tests/`

**Dependencies:** Task 1, Task 2

**Files touched:**
- `app/src/services/ai.js` (modify generateFishingStrategy return)

**Scope:** S

---

### Checkpoint: Backend Complete
- [ ] All tests pass
- [ ] Merge logic verified with unit tests
- [ ] Offline mode unaffected

---

### Task 4: Add lure card HTML container to index.html

**Description:** Add a simple lure card container section after the strategy panel.

**Acceptance criteria:**
- [ ] New container `<div id="lureCards">` added after strategy section
- [ ] Section has a heading "Recommended Lures"
- [ ] Hidden by default, shown when lure data is present
- [ ] Matches existing glass-panel styling

**Verification:**
- [ ] Manual: page loads without errors

**Dependencies:** None (can be done in parallel with backend tasks)

**Files touched:**
- `app/public/index.html`

**Scope:** S

---

### Task 5: Add lure card rendering with source badges in app.js

**Description:** Render merged lure cards in the frontend with engine/AI source badges.

**Acceptance criteria:**
- [ ] `displayResults()` renders lure cards when `data.recommended_lures` is non-empty
- [ ] Each card shows: name, rank badge, cover, presentation, reason
- [ ] Source badge: gear icon for engine, robot icon for AI
- [ ] Cards hidden when no lures returned
- [ ] All dynamic HTML sanitized with DOMPurify
- [ ] Lucide icons re-initialized after rendering

**Verification:**
- [ ] Manual: generate a forecast and verify lure cards render
- [ ] No console errors

**Dependencies:** Task 3 (backend returns merged data), Task 4 (HTML container exists)

**Files touched:**
- `app/public/js/app.js`

**Scope:** S

---

### Checkpoint: Full Feature Complete
- [ ] All tests pass
- [ ] Backend merges engine + AI lures by score
- [ ] Frontend renders lure cards with badges
- [ ] Offline mode shows engine lures only
- [ ] Ready for user review

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Gemini doesn't return ai_lures or returns malformed data | Med | Validate array before merge; fallback to engine-only |
| Score scales differ between engine and AI | Med | Prompt explicitly requests 0.0-1.0 scale; normalize in merge |
| Name dedup too aggressive | Low | Only exact normalized match dedupes; partial matches kept |
