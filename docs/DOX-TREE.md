# FishSmartPro — Project Structure (DOX Tree)

> Auto-generated project file tree.
> Excludes: node_modules, .git, venv, __pycache__, .gradle, build, outputs, intermediates, tmp

\`\`\`text
.
├── .a0proj
│   ├── instructions
│   ├── knowledge
│   │   ├── fragments
│   │   ├── main
│   │   └── solutions
│   ├── memory
│   │   ├── embedding.json
│   │   ├── index.faiss
│   │   ├── index.faiss.sha256
│   │   ├── index.pkl
│   │   └── knowledge_import.json
│   ├── plugins
│   │   ├── _browser
│   │   │   └── config.json
│   │   ├── commands
│   │   │   └── commands
│   │   │       ├── git-push.command.yaml
│   │   │       └── git-push.txt
│   │   └── _model_config
│   │       ├── config.json
│   │       └── presets.yaml
│   ├── skills
│   │   └── marketingskills-main
│   │       ├── ab-test-setup
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   ├── sample-size-guide.md
│   │       │   │   └── test-templates.md
│   │       │   └── SKILL.md
│   │       ├── ad-creative
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   ├── generative-tools.md
│   │       │   │   └── platform-specs.md
│   │       │   └── SKILL.md
│   │       ├── ai-seo
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   ├── content-patterns.md
│   │       │   │   └── platform-ranking-factors.md
│   │       │   └── SKILL.md
│   │       ├── analytics-tracking
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   ├── event-library.md
│   │       │   │   ├── ga4-implementation.md
│   │       │   │   └── gtm-implementation.md
│   │       │   └── SKILL.md
│   │       ├── aso-audit
│   │       │   ├── references
│   │       │   │   ├── apple-specs.md
│   │       │   │   ├── benchmarks.md
│   │       │   │   ├── google-play-specs.md
│   │       │   │   ├── report-template.md
│   │       │   │   └── scoring-criteria.md
│   │       │   └── SKILL.md
│   │       ├── churn-prevention
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   ├── cancel-flow-patterns.md
│   │       │   │   └── dunning-playbook.md
│   │       │   └── SKILL.md
│   │       ├── cold-email
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   ├── benchmarks.md
│   │       │   │   ├── follow-up-sequences.md
│   │       │   │   ├── frameworks.md
│   │       │   │   ├── personalization.md
│   │       │   │   └── subject-lines.md
│   │       │   └── SKILL.md
│   │       ├── co-marketing
│   │       │   └── SKILL.md
│   │       ├── community-marketing
│   │       │   └── SKILL.md
│   │       ├── competitor-alternatives
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   ├── content-architecture.md
│   │       │   │   └── templates.md
│   │       │   └── SKILL.md
│   │       ├── competitor-profiling
│   │       │   ├── references
│   │       │   │   ├── templates.md
│   │       │   │   └── tool-reference.md
│   │       │   └── SKILL.md
│   │       ├── content-strategy
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   └── headless-cms.md
│   │       │   └── SKILL.md
│   │       ├── copy-editing
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   ├── content-refresh.md
│   │       │   │   └── plain-english-alternatives.md
│   │       │   └── SKILL.md
│   │       ├── copywriting
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   ├── copy-frameworks.md
│   │       │   │   └── natural-transitions.md
│   │       │   └── SKILL.md
│   │       ├── customer-research
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   └── source-guides.md
│   │       │   └── SKILL.md
│   │       ├── directory-submissions
│   │       │   ├── references
│   │       │   │   ├── directory-list.md
│   │       │   │   ├── positioning-variations.md
│   │       │   │   └── submission-tracker-template.csv
│   │       │   └── SKILL.md
│   │       ├── email-sequence
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   ├── copy-guidelines.md
│   │       │   │   ├── email-types.md
│   │       │   │   └── sequence-templates.md
│   │       │   └── SKILL.md
│   │       ├── form-cro
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   └── SKILL.md
│   │       ├── free-tool-strategy
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   └── tool-types.md
│   │       │   └── SKILL.md
│   │       ├── image
│   │       │   ├── references
│   │       │   │   └── ai-image-prompting.md
│   │       │   └── SKILL.md
│   │       ├── launch-strategy
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   └── SKILL.md
│   │       ├── lead-magnets
│   │       │   ├── references
│   │       │   │   ├── benchmarks.md
│   │       │   │   └── format-guide.md
│   │       │   └── SKILL.md
│   │       ├── marketing-ideas
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   └── ideas-by-category.md
│   │       │   └── SKILL.md
│   │       ├── marketing-psychology
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   └── SKILL.md
│   │       ├── onboarding-cro
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   └── experiments.md
│   │       │   └── SKILL.md
│   │       ├── page-cro
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   └── experiments.md
│   │       │   └── SKILL.md
│   │       ├── paid-ads
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   ├── ad-copy-templates.md
│   │       │   │   ├── audience-targeting.md
│   │       │   │   ├── conversion-tracking.md
│   │       │   │   └── platform-setup-checklists.md
│   │       │   └── SKILL.md
│   │       ├── paywall-upgrade-cro
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   └── experiments.md
│   │       │   └── SKILL.md
│   │       ├── popup-cro
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   └── SKILL.md
│   │       ├── pricing-strategy
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   ├── research-methods.md
│   │       │   │   └── tier-structure.md
│   │       │   └── SKILL.md
│   │       ├── product-marketing-context
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   └── SKILL.md
│   │       ├── programmatic-seo
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   └── playbooks.md
│   │       │   └── SKILL.md
│   │       ├── referral-program
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   ├── affiliate-programs.md
│   │       │   │   └── program-examples.md
│   │       │   └── SKILL.md
│   │       ├── revops
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   ├── automation-playbooks.md
│   │       │   │   ├── lifecycle-definitions.md
│   │       │   │   ├── routing-rules.md
│   │       │   │   └── scoring-models.md
│   │       │   └── SKILL.md
│   │       ├── sales-enablement
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   ├── deck-frameworks.md
│   │       │   │   ├── demo-scripts.md
│   │       │   │   ├── objection-library.md
│   │       │   │   └── one-pager-templates.md
│   │       │   └── SKILL.md
│   │       ├── schema-markup
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   └── schema-examples.md
│   │       │   └── SKILL.md
│   │       ├── seo-audit
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   ├── ai-writing-detection.md
│   │       │   │   └── international-seo.md
│   │       │   └── SKILL.md
│   │       ├── signup-flow-cro
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   └── SKILL.md
│   │       ├── site-architecture
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   ├── mermaid-templates.md
│   │       │   │   ├── navigation-patterns.md
│   │       │   │   └── site-type-templates.md
│   │       │   └── SKILL.md
│   │       ├── social-content
│   │       │   ├── evals
│   │       │   │   └── evals.json
│   │       │   ├── references
│   │       │   │   ├── platform-limits.md
│   │       │   │   ├── platforms.md
│   │       │   │   ├── post-templates.md
│   │       │   │   ├── reverse-engineering.md
│   │       │   │   └── short-form-video.md
│   │       │   └── SKILL.md
│   │       └── video
│   │           ├── references
│   │           │   └── ai-video-prompting.md
│   │           └── SKILL.md
│   ├── agents.json
│   ├── project.json
│   ├── secrets.env
│   ├── skill_activations.jsonl
│   └── variables.env
├── .agents
│   ├── skills
│   │   └── stripe-best-practices
│   │       ├── references
│   │       │   ├── billing.md
│   │       │   ├── connect.md
│   │       │   ├── payments.md
│   │       │   ├── security.md
│   │       │   └── treasury.md
│   │       └── SKILL.md
│   └── product-marketing-context.md
├── android
│   ├── app
│   │   ├── src
│   │   │   └── main
│   │   │       ├── java
│   │   │       │   └── com
│   │   │       │       └── fishsmart
│   │   │       │           └── pro
│   │   │       │               ├── Application.java
│   │   │       │               ├── DelegationService.java
│   │   │       │               └── LauncherActivity.java
│   │   │       ├── res
│   │   │       │   ├── drawable-anydpi
│   │   │       │   │   └── shortcut_legacy_background.xml
│   │   │       │   ├── drawable-hdpi
│   │   │       │   │   ├── ic_notification_icon.png
│   │   │       │   │   └── splash.png
│   │   │       │   ├── drawable-mdpi
│   │   │       │   │   ├── ic_notification_icon.png
│   │   │       │   │   └── splash.png
│   │   │       │   ├── drawable-xhdpi
│   │   │       │   │   ├── ic_notification_icon.png
│   │   │       │   │   └── splash.png
│   │   │       │   ├── drawable-xxhdpi
│   │   │       │   │   ├── ic_notification_icon.png
│   │   │       │   │   └── splash.png
│   │   │       │   ├── drawable-xxxhdpi
│   │   │       │   │   ├── ic_notification_icon.png
│   │   │       │   │   └── splash.png
│   │   │       │   ├── mipmap-hdpi
│   │   │       │   │   └── ic_launcher.png
│   │   │       │   ├── mipmap-mdpi
│   │   │       │   │   └── ic_launcher.png
│   │   │       │   ├── mipmap-xhdpi
│   │   │       │   │   └── ic_launcher.png
│   │   │       │   ├── mipmap-xxhdpi
│   │   │       │   │   └── ic_launcher.png
│   │   │       │   ├── mipmap-xxxhdpi
│   │   │       │   │   └── ic_launcher.png
│   │   │       │   ├── raw
│   │   │       │   │   └── web_app_manifest.json
│   │   │       │   ├── values
│   │   │       │   │   ├── colors.xml
│   │   │       │   │   └── strings.xml
│   │   │       │   └── xml
│   │   │       │       ├── filepaths.xml
│   │   │       │       └── shortcuts.xml
│   │   │       └── AndroidManifest.xml
│   │   └── build.gradle
│   ├── gradle
│   │   └── wrapper
│   │       ├── gradle-wrapper.jar
│   │       └── gradle-wrapper.properties
│   ├── android.keystore
│   ├── build.gradle
│   ├── gradle-bundle-build.log
│   ├── gradle.properties
│   ├── gradlew
│   ├── gradlew.bat
│   ├── local.properties
│   ├── manifest-checksum.txt
│   ├── settings.gradle
│   ├── store_icon.png
│   └── twa-manifest.json
├── app
│   ├── data
│   │   ├── fish-behavior-patterns-v2
│   │   ├── fishingData.json
│   │   └── lures.json
│   ├── migrations
│   │   ├── 001-stripe-billing.sql
│   │   ├── 002-stripe-customers-unique-account.sql
│   │   ├── 003-free-tier-usage.sql
│   │   ├── 004-promo-codes.sql
│   │   ├── 005-forecast-history.sql
│   │   ├── 006-cookie-device-tracking.sql
│   │   └── 007-free-tier-secure.sql
│   ├── public
│   │   ├── css
│   │   │   ├── shared.css
│   │   │   └── tailwind.css
│   │   ├── js
│   │   │   ├── app.js
│   │   │   ├── auth-utils.js
│   │   │   └── subscription.js
│   │   ├── .well-known
│   │   │   └── assetlinks.json
│   │   ├── 44x44.png
│   │   ├── apple-icon-180.png
│   │   ├── beta-signup.html
│   │   ├── feature-graphic.png
│   │   ├── icon-512-maskable.png
│   │   ├── icon.png
│   │   ├── index.html
│   │   ├── lucide.min.js
│   │   ├── manifest-icon-192.maskable.png
│   │   ├── manifest-icon-192.png
│   │   ├── manifest-icon-512.maskable.png
│   │   ├── manifest-icon-512.png
│   │   ├── manifest.json
│   │   ├── offline.html
│   │   ├── privacy.html
│   │   ├── PRIVACY.md
│   │   ├── purify.min.js
│   │   └── sw.js
│   ├── scripts
│   │   ├── build-css-debug.js
│   │   └── generate-promo.js
│   ├── src
│   │   ├── config
│   │   │   └── env.js
│   │   ├── data
│   │   │   └── loader.js
│   │   ├── engine
│   │   │   ├── activity-forecast.js
│   │   │   ├── bite-score.js
│   │   │   ├── dissolved-oxygen.js
│   │   │   ├── lunar.js
│   │   │   ├── lure-scorer.js
│   │   │   ├── metabolic.js
│   │   │   ├── photoperiod.js
│   │   │   ├── pressure-trend.js
│   │   │   ├── spawning.js
│   │   │   ├── thermocline.js
│   │   │   └── water-temp.js
│   │   ├── lib
│   │   │   └── safe-fetch.js
│   │   ├── middleware
│   │   │   ├── auth.js
│   │   │   ├── billing-auth.js
│   │   │   ├── csp.js
│   │   │   ├── free-tier-check.js
│   │   │   └── sanitization.js
│   │   ├── routes
│   │   │   ├── api.js
│   │   │   ├── billing.js
│   │   │   └── webhooks.js
│   │   ├── services
│   │   │   ├── ai.js
│   │   │   ├── db.js
│   │   │   ├── entitlement-service.js
│   │   │   ├── fish-data-enhancer.js
│   │   │   ├── forecast-history.js
│   │   │   ├── free-tier-token.js
│   │   │   ├── google-play-billing.js
│   │   │   ├── session-auth.js
│   │   │   ├── stripe.js
│   │   │   ├── stripe-webhook-handler.js
│   │   │   ├── subscription.js
│   │   │   └── weather.js
│   │   └── input.css
│   ├── tests
│   │   ├── activity-chart-fallback.test.js
│   │   ├── activity-forecast.test.js
│   │   ├── ai.test.js
│   │   ├── auth-stripe-entitlement.test.js
│   │   ├── benchmark-activity-forecast.js
│   │   ├── benchmark-bite-score.js
│   │   ├── benchmark-pressure-trend.js
│   │   ├── billing-auth.test.js
│   │   ├── dissolved-oxygen.test.js
│   │   ├── engine-integration.test.js
│   │   ├── entitlement-service.test.js
│   │   ├── fish-data-enhancer.test.js
│   │   ├── free-tier.test.js
│   │   ├── lunar.test.js
│   │   ├── lure-catalog.test.js
│   │   ├── lure-scorer.test.js
│   │   ├── metabolic.test.js
│   │   ├── multi-factor.test.js
│   │   ├── photoperiod.test.js
│   │   ├── pressure.test.js
│   │   ├── pressure-trend.test.js
│   │   ├── session-auth.test.js
│   │   ├── spawning.test.js
│   │   ├── species-data.test.js
│   │   ├── stripe-service.test.js
│   │   ├── stripe-webhook-handler.test.js
│   │   ├── subscription-payment-fallback.test.js
│   │   ├── thermocline.test.js
│   │   ├── water-temp.test.js
│   │   ├── weather-headers.test.js
│   │   └── weather.test.js
│   ├── ai.js
│   ├── benchmark-activity-forecast.js
│   ├── benchmark-bite-score.js
│   ├── .env
│   ├── package.json
│   ├── server.js
│   ├── start.sh
│   └── tailwind.config.js
├── docs
│   ├── launch-assets
│   │   ├── directory-submissions.md
│   │   ├── email-capture-and-sequence.md
│   │   ├── email-capture-widget.html
│   │   ├── facebook-group-posts.md
│   │   ├── google-ads.md
│   │   ├── influencer-outreach.md
│   │   ├── launch-budget-breakdown.csv
│   │   ├── launch-budget-strategy.md
│   │   ├── launch-projection-calculator.py
│   │   ├── meta-ads.md
│   │   ├── reddit-posts.md
│   │   ├── seo-blog-outlines.md
│   │   ├── tiktok-scripts.md
│   │   └── youtube-demo-script.md
│   ├── plans
│   │   ├── ai-lure-merge.md
│   │   ├── science-engine-overhaul.md
│   │   └── separate-app-from-android.md
│   ├── specs
│   │   ├── ai-lure-merge.md
│   │   ├── science-engine-overhaul.md
│   │   └── scientific-verdict-science-engine-overhaul.md
│   ├── fish-behavior-patterns.md
│   ├── fish-behavior-patterns-research.md
│   ├── fish-behavior-patterns-research-v2.md
│   ├── fishing-apps-competitor-analysis.md
│   ├── fishsmart-pro-competitor-comparison.md
│   └── science-review-report.md
├── landing-page
│   ├── assets
│   │   ├── screenshots
│   │   │   ├── screenshot-1-playstore.png
│   │   │   ├── screenshot-2-playstore.png
│   │   │   ├── screenshot-3-playstore.png
│   │   │   ├── screenshot-4-playstore.png
│   │   │   ├── screenshot-5-playstore.png
│   │   │   ├── screenshot-6-playstore.png
│   │   │   ├── screenshot-7-playstore.png
│   │   │   └── screenshot-8-playstore.png
│   │   └── store_icon.png
│   ├── index.html
│   ├── landing-full-page.png
│   ├── landing-hero-desktop.png
│   ├── landing-hero-mobile.png
│   ├── script.js
│   └── style.css
├── store-assets
│   ├── screenshots
│   │   ├── screenshot-1-original.png
│   │   ├── screenshot-1-playstore.png
│   │   ├── screenshot-2-original.png
│   │   ├── screenshot-2-playstore.png
│   │   ├── screenshot-3-playstore.png
│   │   ├── screenshot-4-playstore.png
│   │   ├── screenshot-5-playstore.png
│   │   ├── screenshot-6-playstore.png
│   │   ├── screenshot-7-playstore.png
│   │   └── screenshot-8-playstore.png
│   ├── play-store-listing.md
│   └── store_icon.png
├── tools
│   └── sync-versions.js
├── CHANGELOG.md
├── .env
├── .gitignore
├── package.json
├── package-lock.json
├── pricing.promptinclude.md
├── README.md
├── server.js
└── skills-lock.json
\`\`\`
