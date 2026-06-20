# Spec: AI-Augmented Lure Recommendations

## Objective

Augment the deterministic lure engine with AI-generated lure recommendations from Gemini so users get a richer, less limited set of lure suggestions. The engine provides the scientifically-grounded baseline; Gemini fills gaps the small catalog can't cover.

**Approach A:** Augment the existing Gemini call (no extra API call, no extra cost).

### User Stories
- As an angler, I want more lure variety beyond the small offline catalog so I can adapt to conditions the catalog doesn't cover.
- As an angler, I want to know which lures are engine-matched vs AI-suggested so I can trust the source.

---

## Assumptions (validated)

1. **No existing lure card UI** - `recommended_lures` is returned by the API but never rendered as structured cards. We build it from scratch.
2. **Offline mode stays engine-only** - when Gemini is unavailable, `recommended_lures` comes from the engine only.
3. **Merge happens server-side** in `ai.js` before the response is sent to the frontend.
4. **Deduplication by normalized name** - exact/very close name matches deduped; partial matches kept.
5. **Score-based ranking, cap at 5** - all lures (engine + AI) scored on a 0-1 scale, top 5 selected regardless of source.
6. **No feature gating** - Pro-only app, all users get lure recommendations.
7. **Gemini prompt uses direct REST API** (not SDK) due to the gzip bug on Render.

### Scoring Approach
- Engine lures already have `finalScore` (0.0-1.0) from `clarityScore * strategyMultiplier * biteProb`
- AI lures will include a `score` field (0.0-1.0) from Gemini, rated on how well the lure matches the given conditions
- Merge normalizes both to the same scale, sorts by score descending, dedupes by name, caps at 5

---

## Tech Stack
- Backend: Node.js, direct HTTPS REST calls to Gemini API
- Frontend: Vanilla JS, DOMPurify, Tailwind CSS
- Tests: Node.js native test runner (`node:test`)

## Commands
```
Test:   cd app && node --test tests/
Dev:    cd app && node server.js
```

## Project Structure (files touched)
```
app/src/services/ai.js          -> Add ai_lures to prompt, merge function
app/public/js/app.js            -> Add lure card rendering with source badges
app/public/index.html           -> Add lure card container (simplest: after strategy)
app/tests/ai.test.js            -> Add merge logic tests
```

## Code Style
- Follow existing patterns: `"use strict"`, CommonJS modules
- Gemini prompt uses template literals with sanitized inputs
- Frontend uses `DOMPurify.sanitize()` for all dynamic HTML

## Testing Strategy
- **Unit:** `mergeLures()` function - deduplication, score-based ranking, capping, source-tagging
- **Integration:** Existing offline fallback test still passes
- **Manual:** Verify lure cards render in browser with correct badges

## Boundaries
- **Always:** Run tests before commits, sanitize all AI output, validate JSON shape
- **Ask first:** Changing the Gemini model name, adding new npm dependencies
- **Never:** Hardcode lure data in source, skip DOMPurify on frontend rendering

## Success Criteria
- [ ] Gemini prompt includes `ai_lures` array with score field in JSON schema
- [ ] Engine picks passed to Gemini as context
- [ ] `mergeLures()` scores, dedupes, caps at 5, tags source
- [ ] Frontend renders lure cards with source badges (simplest placement: after strategy)
- [ ] Offline mode returns engine lures only (unchanged behavior)
- [ ] All existing tests pass
- [ ] New merge logic tests pass
