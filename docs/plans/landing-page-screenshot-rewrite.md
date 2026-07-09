# Implementation Plan: Landing Page Screenshot Rewrite

## Overview
Rewrite the landing page as a screenshot-led conversion page while preserving the existing static site architecture and visual style.

## Architecture Decisions
- Keep a static HTML/CSS landing page; no new framework or dependency.
- Add uploaded screenshots as local landing assets so the page does not depend on upload paths.
- Keep app CTA destination as `https://fishsmart-pro.onrender.com`.

## Task List

### Phase 1: Foundation
- [x] Task 1: Save lightweight spec and plan
  - Acceptance: documentation exists under `docs/specs/` and `docs/plans/`.
  - Verify: `test -f docs/specs/landing-page-screenshot-rewrite.md && test -f docs/plans/landing-page-screenshot-rewrite.md`
  - Files: docs only

### Phase 2: Core Page Rewrite
- [x] Task 2: Copy new screenshots into landing assets
  - Acceptance: new app screenshots exist in `landing-page/assets/screenshots/`.
  - Verify: `find landing-page/assets/screenshots -maxdepth 1 -name 'app.fishsmart-pro.com_*.png'`
  - Files: screenshot assets
- [x] Task 3: Rewrite landing page HTML
  - Acceptance: hero, app preview, benefits, science, comparison, pricing, and CTA use screenshot-led copy.
  - Verify: browser visual inspection and HTML grep checks.
  - Files: `landing-page/index.html`
- [x] Task 4: Add focused CSS polish if needed
  - Acceptance: screenshot gallery and hero remain responsive.
  - Verify: browser visual inspection at desktop/mobile widths.
  - Files: `landing-page/style.css`

### Checkpoint: Complete
- [x] Local static page serves successfully.
- [x] Browser screenshot checked visually.
- [x] Git status reviewed to separate unrelated pre-existing changes.

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Screenshot asset names differ from uploaded files | Medium | Copy exact uploaded files into landing assets and reference those names |
| Existing CSS lacks styles for new structure | Medium | Reuse existing classes first; add minimal CSS only when required |
| Unrelated screenshot changes already present in repo | Medium | Report pre-existing git status and avoid touching unrelated paths except requested landing assets |

## Open Questions
- None blocking; proceed using product marketing context and provided screenshots.
