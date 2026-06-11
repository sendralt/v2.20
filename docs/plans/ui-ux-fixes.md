# Implementation Plan: UI/UX Audit Fixes

## Overview

Implement fixes from the UI/UX audit report (`docs/ui-ux-review.md`) for the FishSmart Pro fishing forecast web app. The audit scored 7 dimensions; this plan addresses all findings in priority order, starting with WCAG violations and quick wins, then moving to structural improvements.

## Architecture Decisions

- **No new dependencies** — all fixes use existing Tailwind classes, vanilla JS, and CSS
- **Skeleton screens** will use CSS-only pulse animations (already available via Tailwind `animate-pulse`) — no new library
- **Section anchors** will use simple `scrollIntoView({ behavior: 'smooth' })` — no hash routing needed
- **Focus trap** for welcome screen reuses the existing `trapFocus()` / `releaseFocus()` functions in `app.js:55-80`

## Task List

### Phase 1: Accessibility Quick Wins (WCAG Compliance)

- [ ] **Task 1: Add skip-to-content link**
  **Description:** Add a visually-hidden skip link before `<header>` that becomes visible on focus, allowing keyboard users to jump past the setup form to results.
  **Acceptance criteria:**
  - [ ] `<a href="#main" class="sr-only focus:not-sr-only ...">Skip to results</a>` inserted before `<header>` at `index.html:92`
  - [ ] `id="main"` added to the `<main>` element at `index.html:116`
  - [ ] Link is invisible by default, visible on Tab focus, and scrolls to `#main`
  **Verification:** Manual — Tab from top of page, skip link appears, Enter jumps to results area
  **Dependencies:** None
  **Files likely touched:** `public/index.html`
  **Estimated scope:** XS

- [ ] **Task 2: Fix focus indicators on checkbox and input fields**
  **Description:** Replace `outline: none` with visible `:focus-visible` ring styles in `shared.css` for `.setup-checkbox` and `.input-field`.
  **Acceptance criteria:**
  - [ ] `shared.css:203` — `.setup-checkbox:focus` changed to use `outline: 2px solid rgba(34,211,238,0.5); outline-offset: 2px;` instead of `outline: none`
  - [ ] `shared.css:215` — `.input-field:focus` changed similarly
  - [ ] Optionally wrapped in `:focus-visible` to hide for mouse users while keeping for keyboard
  **Verification:** Manual — Tab to checkbox and input, visible cyan outline ring appears
  **Dependencies:** None
  **Files likely touched:** `public/css/shared.css`
  **Estimated scope:** XS

- [ ] **Task 3: Strip emoji from `<option>` text**
  **Description:** Remove `🎣 ` prefix from all 20 species `<option>` elements at `index.html:168-187` to fix screen reader announcement issues.
  **Acceptance criteria:**
  - [ ] All `<option>` values changed from `"🎣 Largemouth Bass"` to `"Largemouth Bass"` (and same for all 20)
  - [ ] Select still functions correctly with same `value` attributes
  **Verification:** Manual — open species dropdown, no emoji visible; screen reader announces clean text
  **Dependencies:** None
  **Files likely touched:** `public/index.html`
  **Estimated scope:** XS

- [ ] **Task 4: Add `for` attributes to form labels**
  **Description:** Connect the "Body of Water" label to `waterBody` input and "Target Species" label to `speciesSelect`.
  **Acceptance criteria:**
  - [ ] `index.html:148` — `<label>` gets `for="waterBody"`
  - [ ] `index.html:162` — `<label>` gets `for="speciesSelect"`
  - [ ] Clicking label text focuses the correct form control
  **Verification:** Manual — click "Body of Water" text, input focuses; click "Target Species" text, select opens
  **Dependencies:** None
  **Files likely touched:** `public/index.html`
  **Estimated scope:** XS

- [ ] **Task 5: Fix `aria-live` level on loading text**
  **Description:** Change `aria-live="assertive"` to `aria-live="polite"` on the loading text element to prevent continuous screen reader interruptions every 900ms.
  **Acceptance criteria:**
  - [ ] `index.html:445` — `aria-live="assertive"` changed to `aria-live="polite"`
  **Verification:** Screen reader testing — loading text changes don't interrupt user
  **Dependencies:** None
  **Files likely touched:** `public/index.html`
  **Estimated scope:** XS

- [ ] **Task 6: Add `role="alert"` to promo and restore messages**
  **Description:** Add ARIA roles to dynamically shown messages in the paywall modal so screen readers announce them.
  **Acceptance criteria:**
  - [ ] `index.html:516` — `#promoCodeMessage` gets `role="alert"`
  - [ ] `index.html:526` — `#restoreEmailMessage` gets `role="alert"`
  **Verification:** Screen reader testing — applying promo code or restore triggers announcement
  **Dependencies:** None
  **Files likely touched:** `public/index.html`
  **Estimated scope:** XS

- [ ] **Task 7: Remove redundant `aria-label` on boat checkbox**
  **Description:** The checkbox at `index.html:229` has both a `<label for="boatMode">` wrapper (with text "Fishing from Boat") and `aria-label="Fishing from Boat"` — the `aria-label` is redundant.
  **Acceptance criteria:**
  - [ ] `aria-label="Fishing from Boat"` removed from the `<input>` at `index.html:229`
  - [ ] Screen reader still announces "Fishing from Boat" via the `<label>` association
  **Verification:** Screen reader testing — checkbox still announced correctly
  **Dependencies:** None
  **Files likely touched:** `public/index.html`
  **Estimated scope:** XS

- [ ] **Task 8: Fix bottom nav semantic consistency**
  **Description:** The bottom nav mixes `<a>` and `<button>` elements. Change all to `<button>` since none navigate to separate pages (Home reloads current page, History opens a panel, Privacy could stay as link or become button).
  **Acceptance criteria:**
  - [ ] `index.html:398` — Home `<a>` changed to `<button>` (keep `href` behavior via JS or just reload)
  - [ ] `index.html:410` — Privacy `<a>` can stay as `<a>` since it navigates to `/privacy.html`
  - [ ] All nav items use consistent element type where semantically appropriate
  **Verification:** Manual — all nav items still work; HTML validator shows no issues
  **Dependencies:** None
  **Files likely touched:** `public/index.html`, `public/js/app.js`
  **Estimated scope:** S

- [ ] **Task 9: Fix heading hierarchy in results section**
  **Description:** All result cards use `<h3>` with no `<h2>` parent. Add an `<h2>` to the results section and consider using `<h4>` for sub-content within cards.
  **Acceptance criteria:**
  - [ ] `<h2>` added at the top of `#resultsSection` (visually hidden if needed via `sr-only`)
  - [ ] Document outline shows proper h1 > h2 > h3 hierarchy
  **Verification:** HTML outline checker or browser accessibility inspector
  **Dependencies:** None
  **Files likely touched:** `public/index.html`
  **Estimated scope:** XS

### Checkpoint: Phase 1 — Accessibility
- [ ] All WCAG Level A/AA violations from audit are addressed
- [ ] Manual keyboard navigation test passes (Tab through entire page)
- [ ] No visual regressions
- [ ] Review with human before proceeding

---

### Phase 2: Usability Quick Wins

- [ ] **Task 10: Fix typo "Forcast" → "Forecast"**
  **Description:** Fix the typo in the generate button section.
  **Acceptance criteria:**
  - [ ] `index.html:247` — "Forcast" changed to "Forecast"
  **Verification:** Visual inspection
  **Dependencies:** None
  **Files likely touched:** `public/index.html`
  **Estimated scope:** XS

- [ ] **Task 11: Disable generate button during API request**
  **Description:** Prevent duplicate API calls by disabling the generate button and changing its text while the request is in flight.
  **Acceptance criteria:**
  - [ ] `app.js:434` — After validation passes, `generateBtn.disabled = true; generateBtn.textContent = 'ANALYZING...'`
  - [ ] Button re-enabled in success path (`app.js:565` area)
  - [ ] Button re-enabled in error path (`app.js:581` area)
  - [ ] Rapid double-click no longer triggers duplicate requests
  **Verification:** Manual — click generate, button becomes disabled and shows "ANALYZING...", re-enables after response
  **Dependencies:** None
  **Files likely touched:** `public/js/app.js`
  **Estimated scope:** S

- [ ] **Task 12: Fix mobile weather grid override**
  **Description:** The `@media (max-width: 640px)` rule in `shared.css:230-234` forces ALL grids to single-column, overriding the intentional 2-column weather grid at `index.html:272`.
  **Acceptance criteria:**
  - [ ] `shared.css:230-234` — Selector made more specific (e.g., only target `.grid-cols-4` or add exclusion for weather grid)
  - [ ] Weather grid shows 2 columns on mobile (< 640px)
  - [ ] Other grids (if any) still collapse to single column as intended
  **Verification:** Manual — resize to mobile width, weather stats show in 2-column grid
  **Dependencies:** None
  **Files likely touched:** `public/css/shared.css`
  **Estimated scope:** XS

- [ ] **Task 13: Add focus trap to welcome screen**
  **Description:** The welcome screen at `app.js:823-843` doesn't call `trapFocus()` unlike other modals. Add focus trapping so keyboard users can't Tab out.
  **Acceptance criteria:**
  - [ ] `app.js:836` — After showing welcome screen, `trapFocus(welcomeScreen)` is called
  - [ ] `releaseFocus()` called before hiding the welcome screen on button click
  - [ ] Tab/Shift+Tab cycles within welcome screen only
  **Verification:** Manual — Tab through welcome screen, focus stays trapped
  **Dependencies:** None
  **Files likely touched:** `public/js/app.js`
  **Estimated scope:** XS

### Checkpoint: Phase 2 — Usability
- [ ] Generate button can't be double-clicked
- [ ] Mobile weather grid shows 2 columns
- [ ] Welcome screen traps focus
- [ ] No visual regressions

---

### Phase 3: Performance Perception

- [ ] **Task 14: Add skeleton screen cards for results section**
  **Description:** Replace or supplement the full-screen loading overlay with skeleton placeholder cards in the results section, giving users a preview of what's coming.
  **Acceptance criteria:**
  - [ ] Skeleton cards added to `#resultsSection` (hidden by default, shown during loading)
  - [ ] Skeletons match the layout of real result cards (bite score banner, weather grid, strategy card, chart placeholder)
  - [ ] Use Tailwind `animate-pulse` with `bg-slate-700/50` rounded divs
  - [ ] Loading overlay may still show briefly or be replaced entirely — decide based on UX testing
  - [ ] Skeletons hidden and real content shown when API response arrives
  **Verification:** Manual — click generate, see skeleton cards in results area, then real content replaces them
  **Dependencies:** None
  **Files likely touched:** `public/index.html`, `public/js/app.js`
  **Estimated scope:** M

- [ ] **Task 15: Make loading text loop**
  **Description:** The loading text rotation at `app.js:505-509` runs through 8 messages once (7.2s) then stops on "Finalizing strategy..." which feels stuck. Make it loop.
  **Acceptance criteria:**
  - [ ] `app.js:505-509` — After reaching the last message, reset `ti` to 0 to loop
  - [ ] Text continues cycling for the full duration of the API call
  **Verification:** Manual — trigger a slow API call, verify text cycles continuously
  **Dependencies:** None
  **Files likely touched:** `public/js/app.js`
  **Estimated scope:** XS

- [ ] **Task 16: Add cancel button to loading overlay**
  **Description:** Add a cancel/dismiss button to the loading overlay so users aren't trapped during long requests.
  **Acceptance criteria:**
  - [ ] Cancel button added to `#loadingOverlay` in `index.html`
  - [ ] Clicking cancel hides the overlay and aborts the fetch request (use `AbortController`)
  - [ ] `AbortController` integrated into the fetch call in `app.js`
  - [ ] Button styled consistently (ghost/outline style, not prominent)
  **Verification:** Manual — click generate, click cancel, overlay dismisses, no error toast for abort
  **Dependencies:** Task 14 (skeleton screens may change loading overlay behavior)
  **Files likely touched:** `public/index.html`, `public/js/app.js`
  **Estimated scope:** S

### Checkpoint: Phase 3 — Performance Perception
- [ ] Skeleton screens visible during loading
- [ ] Loading text loops continuously
- [ ] Cancel button works and aborts request
- [ ] No visual regressions

---

### Phase 4: Information Architecture

- [ ] **Task 17: Add section anchor links in results**
  **Description:** Add a sticky mini-table-of-contents or anchor links so users can jump to specific result cards (Solunar, Safety, etc.) without scrolling through all 9+ cards.
  **Acceptance criteria:**
  - [ ] Each result card gets an `id` attribute (e.g., `id="results-weather"`, `id="results-solunar"`)
  - [ ] A compact sticky nav or set of anchor links added at the top of results section
  - [ ] Clicking an anchor smoothly scrolls to that card
  - [ ] Active section highlighted as user scrolls (optional, using IntersectionObserver)
  - [ ] Works on mobile (compact horizontal scroll or dropdown)
  **Verification:** Manual — click anchor, page scrolls to correct card; mobile layout usable
  **Dependencies:** None
  **Files likely touched:** `public/index.html`, `public/js/app.js`, `public/css/shared.css`
  **Estimated scope:** M

- [ ] **Task 18: Elevate safety card visibility**
  **Description:** The safety card is the last result card and may never be seen. Either move it higher or add a persistent safety indicator.
  **Acceptance criteria:**
  - [ ] Safety card moved to position 3-4 (after weather, before strategy) OR
  - [ ] A compact safety banner/pill added near the bite score that expands on tap
  - [ ] Safety information is visible without scrolling to the bottom
  **Verification:** Manual — generate forecast, safety info visible without full scroll
  **Dependencies:** Task 17 (card IDs needed if reordering)
  **Files likely touched:** `public/index.html`
  **Estimated scope:** S

### Checkpoint: Phase 4 — Information Architecture
- [ ] Section anchors work and scroll correctly
- [ ] Safety card visible without full scroll
- [ ] Mobile anchor nav usable

---

### Phase 5: Visual Design Cleanup

- [ ] **Task 19: Extract logo inline styles to CSS classes**
  **Description:** The logo container at `index.html:96-101` has 4 levels of nested `div` with extensive inline styles. Extract to CSS classes in `shared.css`.
  **Acceptance criteria:**
  - [ ] Inline styles moved to named CSS classes (e.g., `.logo-glow`, `.logo-border`, `.logo-inner`)
  - [ ] Visual appearance unchanged
  - [ ] HTML is cleaner and more maintainable
  **Verification:** Visual comparison — logo looks identical before and after
  **Dependencies:** None
  **Files likely touched:** `public/index.html`, `public/css/shared.css`
  **Estimated scope:** S

- [ ] **Task 20: Fix hardcoded color on best-time element**
  **Description:** `index.html:342` uses inline `style="color:#4fd1c5"` instead of a Tailwind class.
  **Acceptance criteria:**
  - [ ] Inline style replaced with `class="text-teal-300"` (Tailwind equivalent of `#4fd1c5`)
  - [ ] Color unchanged visually
  **Verification:** Visual comparison
  **Dependencies:** None
  **Files likely touched:** `public/index.html`
  **Estimated scope:** XS

### Checkpoint: Phase 5 — Visual Design
- [ ] No visual regressions
- [ ] HTML validation passes
- [ ] Inline styles reduced

---

### Phase 6: Onboarding Improvements

- [ ] **Task 21: Add tooltips for water clarity options**
  **Description:** The four clarity buttons (Muddy, Stained, Clear, Gin Clear) have icons but no descriptions. Add `title` attributes or a tooltip system.
  **Acceptance criteria:**
  - [ ] Each clarity button gets a `title` attribute with a brief description (e.g., Muddy: "Visibility under 1 foot, after heavy rain"; Gin Clear: "Crystal clear, 10+ foot visibility")
  - [ ] Native browser tooltip shows on hover/tap
  **Verification:** Manual — hover over clarity buttons, tooltip appears with description
  **Dependencies:** None
  **Files likely touched:** `public/index.html`
  **Estimated scope:** XS

- [ ] **Task 22: Add visible free tier usage indicator**
  **Description:** Users don't know they have 3 free uses until they hit the paywall. Add a subtle counter visible from the start.
  **Acceptance criteria:**
  - [ ] Usage counter visible in the header or near the generate button (e.g., "3 free forecasts remaining")
  - [ ] Counter updates after each use
  - [ ] Counter hides or changes after subscribing
  - [ ] Style is subtle (small text, muted color) — not alarming
  **Verification:** Manual — fresh user sees "3 free forecasts remaining" in header; counter decrements
  **Dependencies:** None (may need to check `subscription.js` for usage tracking API)
  **Files likely touched:** `public/index.html`, `public/js/app.js`, `public/js/subscription.js`
  **Estimated scope:** S

### Checkpoint: Phase 6 — Onboarding
- [ ] Clarity tooltips visible on hover
- [ ] Free tier counter visible and accurate
- [ ] No visual regressions

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Skeleton screens add HTML bulk | Low | Keep skeleton markup minimal — 5-6 pulse divs per card |
| Section anchors break on mobile scroll | Med | Test on real devices; use `scroll-padding-bottom` for safe area |
| Focus trap on welcome screen conflicts with first-time focus | Low | Auto-focus the CTA button when trap activates |
| Loading cancel via AbortController may leave state inconsistent | Med | Ensure all state variables reset on cancel (button re-enabled, loading hidden) |
| Free tier counter requires API call on page load | Low | Use cached localStorage count as fallback; update async |

## Open Questions

- Should the loading overlay be completely replaced by skeleton screens, or should both coexist (overlay first, then skeletons)?
- For the section anchors, prefer a sticky horizontal pill bar or a collapsible dropdown on mobile?
- Should the safety card be moved up in the DOM order, or kept in place with a visual pointer/link from the top?

## Parallelization Opportunities

**Safe to parallelize (no shared file conflicts):**
- Tasks 1, 3, 4, 5, 6, 7, 9, 10, 20, 21 — all touch only `index.html` but different lines
- Tasks 2, 12 — both touch only `shared.css` but different sections

**Must be sequential:**
- Task 14 → Task 16 (skeleton screens change loading overlay behavior)
- Task 17 → Task 18 (card IDs needed for reordering)

**Recommended parallel batches:**
1. Batch A (index.html top section): Tasks 1, 3, 4, 5, 6, 7, 9, 10, 20, 21
2. Batch B (CSS): Tasks 2, 12
3. Batch C (app.js independent): Tasks 11, 13, 15
4. Batch D (sequential): Task 14 → Task 16
5. Batch E (sequential): Task 17 → Task 18
6. Batch F (CSS/HTML): Task 19
7. Batch G (cross-file): Task 22

## Summary

| Phase | Tasks | Size | Key Outcome |
|-------|-------|------|-------------|
| 1. Accessibility | 1-9 | 8×XS + 1×S | WCAG compliance |
| 2. Usability | 10-13 | 3×XS + 1×S | Polish & bug fixes |
| 3. Performance | 14-16 | 1×XS + 1×S + 1×M | Better loading UX |
| 4. Info Architecture | 17-18 | 1×S + 1×M | Navigable results |
| 5. Visual Design | 19-20 | 1×XS + 1×S | Maintainable styles |
| 6. Onboarding | 21-22 | 1×XS + 1×S | Better first experience |
| **Total** | **22 tasks** | **10×XS, 6×S, 2×M** | **Full audit remediation** |
