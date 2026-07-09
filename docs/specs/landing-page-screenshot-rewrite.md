# Spec: Landing Page Screenshot Rewrite

## Objective
Rewrite the FishSmart Pro landing page so the app UI screenshots lead the story: visitors should quickly understand that FishSmart Pro produces transparent, science-backed freshwater forecasts with bite scores, activity windows, lure recommendations, USGS water temperature, privacy-first design, and fair pricing.

## Tech Stack
Static landing page: `landing-page/index.html`, `landing-page/style.css`, `landing-page/script.js`, image assets under `landing-page/assets/`.

## Commands
- Inspect: `cd /a0/usr/projects/fshsmrtpro && git status --short`
- Static asset check: `cd /a0/usr/projects/fshsmrtpro && find landing-page/assets/screenshots -maxdepth 1 -type f | sort`
- Serve for visual verification: `cd /a0/usr/projects/fshsmrtpro/landing-page && python3 -m http.server 4173`

## Project Structure
- `landing-page/index.html` → landing page structure and copy
- `landing-page/style.css` → existing visual system and any new screenshot-led layout styles
- `landing-page/assets/screenshots/` → app screenshots used on the page
- `docs/specs/` and `docs/plans/` → task documentation

## Code Style
Use semantic HTML sections with existing class naming patterns:
```html
<section class="section section-screenshots" id="app-preview">
  <div class="container">
    <div class="section-header">
      <span class="section-tag">App Preview</span>
      <h2 class="section-title">The Full Forecast, Not Just a Score</h2>
    </div>
  </div>
</section>
```

## Testing Strategy
This is a static marketing/UI/content change. Verify by serving the landing page locally, checking DOM loads without console errors, and visually inspecting desktop/mobile screenshots in a browser.

## Boundaries
- Always: keep pricing aligned with authoritative pricing context; keep screenshots local; preserve existing app links.
- Ask first: changing app functionality, billing logic, Stripe/Google Play IDs, production deployment.
- Never: hardcode Stripe price IDs, edit `app/public/` without service worker cache bump, overwrite unrelated user changes.

## Success Criteria
- Hero copy is clearer and more screenshot-led.
- Page uses the new screenshots in hero and preview sections.
- Copy emphasizes concrete app outputs: bite score, best time window, lures, USGS temp, factor breakdown, history/export.
- Pricing remains `$4.99/mo`, `$29.99/yr`, and 3 free AI forecast uses.
- Page renders visually on desktop and mobile without obvious layout breakage.

## Open Questions
- Current conversion rate and traffic source were not provided, so the rewrite optimizes for cold organic/direct visitors.
