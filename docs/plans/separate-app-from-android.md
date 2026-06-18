# Implementation Plan: Separate PWA App from Android Files

## Overview

Restructure the FishSmart Pro repository into a clean monorepo with two clearly separated top-level trees: `app/` (the Node.js PWA application) and `android/` (the Trusted Web Activity wrapper). Cross-cutting tooling (version sync, docs) stays at root. This eliminates the current mixing of PWA source, Android build artifacts, and Play Store assets at the repository root.

## Current State Analysis

### What's Already Clean
- All Android TWA source lives in `android-project/` — this is already well-isolated.
- PWA dependencies are declared in a single `package.json`.

### What's Mixed / Coupled

| Issue | Details |
|-------|---------|
| **Android artifacts at root** | `gradle-build.log`, `gradle-assemble.log`, `gradle-rebuild.log`, `gradle-rebuild-v13.log`, `app-release-signed.aab` |
| **Play Store screenshots in PWA `public/`** | `screenshot-*-playstore.png` (8 files) are Android store assets, not PWA assets |
| **Marketing video at root** | `fishsmart_promo.mp4` — Play Store promo video |
| **Play Store listing in Android dir** | `android-project/play-store-listing.md` is fine but should be grouped with other store assets |
| **Version sync script crosses boundaries** | `scripts/sync-versions.js` patches `android-project/`, `public/sw.js`, and reads `package.json` |
| **`.gitignore` mixes both domains** | PWA ignores and Android ignores in one file |
| **Root-level data files** | `lures.json`, `fishingData.json`, `fish-behavior-patterns-v2` are PWA runtime data sitting at root |
| **`ai.js` at root** | Appears to be a standalone/experimental script, not part of the server |

### Coupling Points That Must Be Preserved

1. **`public/.well-known/assetlinks.json`** — Served by the PWA but required by Android TWA for Digital Asset Links verification. Must stay in PWA's served directory.
2. **Version synchronization** — `sync-versions.js` propagates `package.json` version → Android `build.gradle` + `twa-manifest.json` + PWA `sw.js`. Must continue to work after paths change.
3. **TWA manifest references** — `twa-manifest.json` references PWA URLs (`manifest-icon-512.png`, `manifest.json`). These are URL-based (not file-path), so no change needed.
4. **Deployment** — Render.com runs `./start.sh` or `node server.js` from repo root. Start command / build config may need updating.

## Target Structure

```
project_1/
├── app/                            # ← PWA application (moved from root)
│   ├── server.js
│   ├── src/
│   │   ├── config/
│   │   ├── services/
│   │   ├── middleware/
│   │   ├── data/
│   │   ├── engine/
│   │   ├── routes/
│   │   └── input.css
│   ├── public/
│   │   ├── js/
│   │   ├── css/
│   │   ├── .well-known/
│   │   ├── manifest.json
│   │   ├── sw.js
│   │   ├── index.html
│   │   ├── privacy.html
│   │   └── ... (PWA assets only)
│   ├── migrations/
│   ├── tests/
│   ├── scripts/
│   │   ├── build-css-debug.js
│   │   └── generate-promo.js
│   ├── data/
│   │   ├── lures.json
│   │   ├── fishingData.json
│   │   └── fish-behavior-patterns-v2
│   ├── tailwind.config.js
│   ├── package.json                # ← moved here (PWA owns it)
│   ├── start.sh                    # ← moved here
│   └── .env.example                # ← new (document env vars)
│
├── android/                        # ← renamed from android-project/
│   ├── app/
│   │   ├── src/
│   │   └── build.gradle
│   ├── gradle/
│   ├── twa-manifest.json
│   ├── store_icon.png
│   ├── gradle.properties
│   ├── settings.gradle
│   ├── build.gradle
│   ├── gradlew
│   ├── gradlew.bat
│   ├── manifest-checksum.txt
│   ├── android.keystore            # (gitignored)
│   └── local.properties            # (gitignored)
│
├── store-assets/                   # ← new: Play Store marketing materials
│   ├── play-store-listing.md       # ← moved from android-project/
│   ├── screenshots/                # ← moved from public/screenshot-*-playstore.png
│   │   ├── screenshot-1-playstore.png
│   │   └── ... (8 files)
│   ├── store_icon.png              # ← copy/symlink
│   └── fishsmart_promo.mp4         # ← moved from root
│
├── tools/                          # ← new: cross-cutting scripts
│   └── sync-versions.js            # ← moved from scripts/, paths updated
│
├── docs/                           # stays at root (shared)
│   ├── plans/
│   ├── fish-behavior-patterns.md
│   └── ...
│
├── .agents/                        # stays at root (A0 framework)
├── .a0proj/                        # stays at root (A0 framework)
├── .gitignore                      # ← updated with new paths
├── CHANGELOG.md                    # stays at root
└── README.md                       # ← new or updated
```

### What Gets Deleted (Not Moved)

| File | Reason |
|------|--------|
| `gradle-build.log` | Android build log — transient, regenerated |
| `gradle-assemble.log` | Same |
| `gradle-rebuild.log` | Same |
| `gradle-rebuild-v13.log` | Same |
| `app-release-signed.aab` | Build artifact, already gitignored |
| `ai.js` (root) | Verify if unused — appears to be standalone experiment. If unused, archive to `docs/archive/` |
| `public/screenshot-*-original.png` | Verify if still needed (non-playstore screenshots) |
| `public/new-12-hour-chart.html` | Verify if development artifact |

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **Monorepo, not split repos** | TWA is a thin wrapper; version sync and assetlinks cross boundaries. Two repos would add external sync complexity for no real benefit. |
| **`app/` subdirectory for PWA** | Cleanest separation. Root stays minimal. |
| **Rename `android-project/` → `android/`** | Shorter, conventional, clearly paired with `app/`. |
| **`store-assets/` directory** | Play Store screenshots and promo video are neither PWA code nor Android source — they're marketing assets. Separate directory prevents pollution of either tree. |
| **`tools/` for version sync** | `sync-versions.js` operates across `app/` and `android/` — it doesn't belong to either. |
| **Keep `assetlinks.json` in `app/public/`** | Must be served by the PWA at `/.well-known/assetlinks.json`. It's PWA-served but Android-consumed — PWA owns the file. |

## Task List

### Phase 1: Preparation & Safety

#### Task 1: Create a backup branch
**Description:** Create a git branch to perform all restructuring work safely.
**Acceptance criteria:**
- [ ] `git checkout -b refactor/separate-app-android` succeeds
- [ ] Working directory is clean before starting
**Verification:** `git branch --show-current` shows the new branch
**Dependencies:** None
**Files likely touched:** None (git operation only)
**Estimated scope:** XS

#### Task 2: Audit `ai.js` and ambiguous root files
**Description:** ~~Determine whether `ai.js`, `public/new-12-hour-chart.html`, and `public/screenshot-*-original.png` are used anywhere.~~
**RESOLVED** — All decisions made by user:
- `ai.js` → **Keep**, moves to `app/` with PWA code
- `new-12-hour-chart.html` → **Delete** (dev artifact)
- `screenshot-*-original.png` → **Move** to `store-assets/screenshots/`
**Acceptance criteria:**
- [x] `ai.js` → keep, moves to `app/`
- [x] `new-12-hour-chart.html` → delete (dev artifact)
- [x] `screenshot-*-original.png` → move to `store-assets/screenshots/`
- [x] `grep` audit to confirm `ai.js` and `new-12-hour-chart.html` have no references before acting
**Verification:** Output saved to plan notes
**Dependencies:** None
**Files likely touched:** None (read-only audit)
**Estimated scope:** XS

### Checkpoint: Preparation Complete
- [ ] Branch created
- [ ] Ambiguous files audited

---

### Phase 2: Create New Directory Structure & Move PWA Files

#### Task 3: Create `app/` directory and move PWA source files
**Description:** Move all PWA application files into `app/`.
**Acceptance criteria:**
- [ ] `ai.js` moved to `app/ai.js` (user: keep)
- [ ] `server.js` moved to `app/server.js`
- [ ] `src/` moved to `app/src/`
- [ ] `public/` moved to `app/public/` (minus Play Store screenshots)
- [ ] `migrations/` moved to `app/migrations/`
- [ ] `tests/` moved to `app/tests/`
- [ ] `tailwind.config.js` moved to `app/tailwind.config.js`
- [ ] `package.json` moved to `app/package.json`
- [ ] `start.sh` moved to `app/start.sh`
- [ ] Data files (`lures.json`, `fishingData.json`, `fish-behavior-patterns-v2`) moved to `app/data/`
- [ ] PWA scripts (`scripts/build-css-debug.js`, `scripts/generate-promo.js`) moved to `app/scripts/`
**Verification:** `ls app/` shows expected structure; no PWA source files remain at root
**Dependencies:** Task 1, Task 2
**Files likely touched:** All PWA files (moved)
**Estimated scope:** M

#### Task 4: Move Play Store assets to `store-assets/`
**Description:** Separate Play Store marketing materials from PWA and Android source.
**Acceptance criteria:**
- [ ] `store-assets/` directory created
- [ ] `public/screenshot-*-playstore.png` (8 files) moved to `store-assets/screenshots/`
- [ ] `fishsmart_promo.mp4` moved to `store-assets/`
- [ ] `android-project/play-store-listing.md` moved to `store-assets/`
- [ ] `android-project/store_icon.png` copied to `store-assets/` (keep original in android/)
**Verification:** `ls store-assets/` shows screenshots/, promo video, listing doc
**Dependencies:** Task 3 (public/ already moved)
**Files likely touched:** Marketing assets (moved)
**Estimated scope:** S

### Checkpoint: Files Moved
- [ ] `app/` contains all PWA source and no Android files
- [ ] `android-project/` (not yet renamed) contains only Android source
- [ ] `store-assets/` contains all Play Store marketing materials
- [ ] Root contains only shared tooling and docs

---

### Phase 3: Move Cross-Cutting Tooling & Update References

#### Task 5: Move version-sync script to `tools/` and update paths
**Description:** Move `sync-versions.js` to `tools/` and update its internal path references.
**Acceptance criteria:**
- [ ] `scripts/sync-versions.js` moved to `tools/sync-versions.js`
- [ ] ROOT path constant updated: `path.resolve(__dirname, '..')` → `path.resolve(__dirname, '..')` (still correct since `tools/` is one level below root)
- [ ] Path references updated:
  - `'android-project/app/build.gradle'` → `'android/app/build.gradle'`
  - `'android-project/twa-manifest.json'` → `'android/twa-manifest.json'`
  - `'public/sw.js'` → `'app/public/sw.js'`
  - `'package.json'` → `'app/package.json'`
- [ ] Dry run succeeds: `node tools/sync-versions.js` from repo root
**Verification:** `node tools/sync-versions.js` outputs correct current versions without errors
**Dependencies:** Task 3 (app/ exists), Task 6 (android/ renamed) — or do Task 6 first
**Files likely touched:** `tools/sync-versions.js`
**Estimated scope:** S

#### Task 6: Rename `android-project/` to `android/`
**Description:** Rename the Android directory to the conventional short name.
**Acceptance criteria:**
- [ ] `git mv android-project android`
- [ ] No remaining references to `android-project/` in any tracked file
**Verification:** `grep -rn "android-project" .` returns zero results (excluding `.git/` and logs)
**Dependencies:** Task 3 (so PWA files are already out of the way)
**Files likely touched:** Directory rename only
**Estimated scope:** XS

#### Task 7: Update `package.json` scripts for new paths
**Description:** Update npm script paths in `app/package.json` to work from `app/` directory.
**Acceptance criteria:**
- [ ] `build:css` script path still resolves correctly (tailwind CLI path relative to `app/`)
- [ ] `predev` hook still works
- [ ] `test` script path still works (`tests/*.test.js` relative to `app/`)
- [ ] `sync-versions` script updated to `node ../tools/sync-versions.js --write`
**Verification:** `cd app && npm run build:css` succeeds; `cd app && npm test` runs
**Dependencies:** Task 3, Task 5
**Files likely touched:** `app/package.json`
**Estimated scope:** S

#### Task 8: Update `start.sh` for new location
**Description:** Ensure startup script works from `app/` directory.
**Acceptance criteria:**
- [ ] `SCRIPT_DIR` resolution still works (uses `dirname "$0"`, so self-correcting)
- [ ] Any hardcoded paths in `start.sh` updated if needed
- [ ] API key injection still works
**Verification:** `cd app && bash start.sh development` starts without path errors (kill after verifying)
**Dependencies:** Task 3
**Files likely touched:** `app/start.sh`
**Estimated scope:** XS

### Checkpoint: References Updated
- [ ] Version sync runs from new location
- [ ] Android directory renamed
- [ ] All npm scripts work from `app/`
- [ ] Startup script works from `app/`

---

### Phase 4: Update Configs & Clean Up Root

#### Task 9: Update `.gitignore` for new structure
**Description:** Rewrite `.gitignore` to reflect the new directory layout with clear sections.
**Acceptance criteria:**
- [ ] Node.js ignores updated for `app/` paths
- [ ] Android ignores updated for `android/` paths (`.gradle/`, `build/`, keystore, etc.)
- [ ] Root-level artifact ignores removed or updated
- [ ] Sections clearly commented: `# PWA/Node.js`, `# Android`, `# Build artifacts`
**Verification:** `git status` shows no unexpected untracked files
**Dependencies:** Task 3, Task 6
**Files likely touched:** `.gitignore`
**Estimated scope:** S

#### Task 10: Update server.js path references
**Description:** Update any path references in `app/server.js` that assumed root-level execution.
**Acceptance criteria:**
- [ ] `__dirname`-based paths reviewed (most should self-correct)
- [ ] Static file serving paths (`public/`) resolve correctly from new location
- [ ] Data file paths (`lures.json`, `fishingData.json`) updated to `data/` subdirectory
- [ ] Migration paths resolve correctly
**Verification:** `cd app && node server.js` starts and serves pages without 404 errors
**Dependencies:** Task 3
**Files likely touched:** `app/server.js`, possibly `app/src/data/loader.js`
**Estimated scope:** S

#### Task 11: Update `src/` internal path references
**Description:** Audit and update any internal path references that assumed root-level execution.
**Acceptance criteria:**
- [ ] `src/data/loader.js` path references checked (lures.json, fishingData.json)
- [ ] `src/config/env.js` checked for path-dependent logic
- [ ] Any `path.join(__dirname, '../../...')` patterns audited and fixed
- [ ] Test file paths checked if they load fixtures from relative paths
**Verification:** `cd app && npm test` — all tests pass
**Dependencies:** Task 3, Task 10
**Files likely touched:** 2-3 files in `app/src/`
**Estimated scope:** S

#### Task 12: Clean up Android build logs and root artifacts
**Description:** Remove transient Android build logs and artifacts from root.
**Acceptance criteria:**
- [ ] `gradle-build.log`, `gradle-assemble.log`, `gradle-rebuild.log`, `gradle-rebuild-v13.log` deleted
- [ ] `app-release-signed.aab` deleted (if exists, already gitignored)
- [ ] `scripts/` directory at root deleted if empty (contents moved to `app/scripts/` and `tools/`)
- [ ] Any empty directories cleaned up
**Verification:** `ls` at root shows only expected files
**Dependencies:** Task 3, Task 5
**Files likely touched:** Deletions only
**Estimated scope:** XS

### Checkpoint: Configs Updated & Root Clean
- [ ] `.gitignore` updated
- [ ] Server starts and serves pages
- [ ] All tests pass
- [ ] Root directory is clean

---

### Phase 5: Verification & Documentation

#### Task 13: Update deployment configuration
**Description:** Update Render.com or other deployment configs for the new structure.
**Acceptance criteria:**
- [ ] Render start command updated (likely `cd app && node server.js` or `cd app && bash start.sh`)
- [ ] Build command updated if applicable (e.g., `cd app && npm install && npm run build:css`)
- [ ] Environment variable paths unchanged (Render injects env, not path-dependent)
- [ ] `render.yaml` or dashboard settings updated if they exist
**Verification:** Deployment config reviewed and updated
**Dependencies:** All prior tasks
**Files likely touched:** `render.yaml` or external dashboard
**Estimated scope:** S

#### Task 14: Create root `README.md` with monorepo guide
**Description:** Document the new repository structure.
**Acceptance criteria:**
- [ ] Explains `app/` vs `android/` vs `store-assets/` vs `tools/`
- [ ] Quick-start instructions for both PWA and Android
- [ ] Version sync instructions: `node tools/sync-versions.js --write`
**Verification:** README reviewed
**Dependencies:** All prior tasks
**Files likely touched:** `README.md` (new)
**Estimated scope:** S

#### Task 15: Full integration verification
**Description:** End-to-end verification that everything works after restructuring.
**Acceptance criteria:**
- [ ] `cd app && npm install` succeeds
- [ ] `cd app && npm run build:css` succeeds
- [ ] `cd app && npm test` — all tests pass
- [ ] `cd app && node server.js` starts and serves `http://localhost:3000`
- [ ] `curl http://localhost:3000/.well-known/assetlinks.json` returns valid JSON
- [ ] `node tools/sync-versions.js` (dry-run) reports all files current
- [ ] `grep -rn "android-project" .` returns zero results (excluding `.git/`)
- [ ] No broken symlinks or missing files
**Verification:** All checks pass
**Dependencies:** All prior tasks
**Files likely touched:** None (verification only)
**Estimated scope:** S

### Checkpoint: Complete
- [ ] PWA builds, tests, and runs from `app/`
- [ ] Android source intact in `android/`
- [ ] Version sync works from `tools/`
- [ ] Store assets organized in `store-assets/`
- [ ] Deployment config updated
- [ ] Root directory is clean and minimal
- [ ] Ready for review and merge

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Server path references break** | High — PWA won't start | Use `__dirname`-relative paths everywhere; test `node server.js` immediately after move |
| **Render deployment breaks** | High — production down | Update Render config before merging; test on a preview deployment if available |
| **CSS build paths break** | Medium — Tailwind output missing | Verify `build:css` script resolves `src/input.css` and `public/css/` from `app/` |
| **Git history becomes messy** | Low — cosmetic | Use `git mv` for all moves to preserve history; commit in logical phases |
| **Test fixtures use relative paths** | Medium — tests fail | Run `npm test` immediately after move; fix paths as needed |
| **`assetlinks.json` not served** | High — Android TWA breaks | Verify `curl` returns the file from the running server |
| **Keystore path references break** | Medium — Android build fails | `build.gradle` uses relative `../android.keystore`; verify after rename |

## Open Questions

1. **Should `ai.js` at root be kept, archived, or deleted?** Needs grep audit to determine if it's imported anywhere.
2. **Does Render.com need a `render.yaml` or is it dashboard-configured?** Determines if Task 13 is a file edit or external change.
3. **Should the two `public/screenshot-*-original.png` files stay in `app/public/` or move to `store-assets/`?** They may be source files for Play Store screenshots.
4. **Is `public/new-12-hour-chart.html` a development artifact or served page?** Needs grep audit.
5. **Should we create a root `package.json` workspace file**, or is a single `app/package.json` sufficient? Workspace would allow `npm run sync-versions` from root.

## Parallelization Opportunities

- **Tasks 1 & 2** can be done in parallel (branch creation + file audit).
- **Task 4** (store-assets) can be done in parallel with **Task 6** (android rename) after Task 3.
- **Tasks 9, 10, 11** can be partially parallelized after the file moves are complete.
- **Task 14** (README) can be written in parallel with verification tasks.
