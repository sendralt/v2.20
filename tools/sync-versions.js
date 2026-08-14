#!/usr/bin/env node

/**
 * sync-versions.js
 *
 * Canonical version source: app/package.json
 *
 * Modes:
 *   (default)      Dry-run: show what would change.
 *   --write        Apply sync only (propagate current version everywhere).
 *   --bump         Bump MINOR (2.36 -> 2.37) then sync. Use for releases
 *                  that must bust the PWA service-worker cache.
 *   --bump-patch   Bump PATCH (2.36 -> 2.36.1) then sync.
 *   --check        Verify all targets match the canonical version; exit 1 on
 *                  drift. Used by CI to prevent silent version regressions.
 *
 * Propagation targets:
 *   package.json               root version ("<appVersion>.0" for 2-part versions)
 *   app/package.json           canonical source (only changed by --bump*)
 *   android/app/build.gradle   versionCode + versionName
 *   android/twa-manifest.json  appVersion + appVersionCode + appVersionName
 *   app/public/sw.js           CACHE_NAME (PWA cache bust)
 *
 * Usage:
 *   npm run bump                 # release: minor bump + full sync (busts SW cache)
 *   npm run bump:patch           # hotfix bump + full sync
 *   npm run sync-versions        # dry-run
 *   npm run sync-versions:write  # re-sync after manual app/package.json edit
 *   npm run version:check        # CI drift guard
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);

const MODE = argv.includes('--check') ? 'check'
  : argv.includes('--bump-patch') ? 'bump-patch'
  : argv.includes('--bump') ? 'bump'
  : argv.includes('--write') ? 'write'
  : 'dry-run';

const APPLY = MODE === 'write' || MODE === 'bump' || MODE === 'bump-patch';

function readJSON(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

function writeJSON(relPath, obj) {
  const dest = path.join(ROOT, relPath);
  if (!APPLY) {
    console.log('  [dry-run] would write ' + relPath);
  } else {
    fs.writeFileSync(dest, JSON.stringify(obj, null, 4) + '\n');
    console.log('  wrote ' + relPath);
  }
}

function patchFile(relPath, replacements) {
  const dest = path.join(ROOT, relPath);
  let content = fs.readFileSync(dest, 'utf8');
  let changed = false;

  for (const [label, pattern, replacement] of replacements) {
    if (pattern.test(content)) {
      const updated = content.replace(pattern, replacement);
      if (updated !== content) {
        content = updated;
        changed = true;
        console.log('  ' + relPath + ': ' + label);
      } else {
        console.log('  ' + relPath + ': already correct (' + label + ')');
      }
    } else {
      console.log('  ' + relPath + ': pattern not found — skipping (' + label + ')');
    }
  }

  if (changed) {
    if (!APPLY) {
      console.log('  [dry-run] would patch ' + relPath);
    } else {
      fs.writeFileSync(dest, content, 'utf8');
      console.log('  patched ' + relPath);
    }
  }
}

/**
 * Derive Android versionCode from version string.
 * Convention: major.minor -> minor (e.g. "2.19" -> 19)
 * For 3-part semver: major.minor.patch -> minor * 100 + patch (e.g. "2.19.3" -> 1903)
 */
function versionToCode(ver) {
  const parts = ver.split('.').map(Number);
  if (parts.length >= 3) return parts[1] * 100 + parts[2];
  return parts[1] !== undefined ? parts[1] : parts[0];
}

function bumpMinor(ver) {
  const parts = ver.split('.');
  parts[1] = String(Number(parts[1]) + 1);
  return parts.slice(0, 2).join('.');
}

function bumpPatch(ver) {
  const parts = ver.split('.');
  if (parts.length < 3) parts.push('1');
  else parts[2] = String(Number(parts[2]) + 1);
  return parts.join('.');
}

/** Root package.json uses 3-part semver: "2.37" -> "2.37.0"; "2.37.1" stays. */
function rootVersion(appVer) {
  return appVer.split('.').length >= 3 ? appVer : appVer + '.0';
}

function checkSync(version, code) {
  const problems = [];

  const rootPkg = readJSON('package.json');
  const expectedRoot = rootVersion(version);
  if (rootPkg.version !== expectedRoot) {
    problems.push('package.json: version ' + rootPkg.version + ' != ' + expectedRoot);
  }

  const gradle = fs.readFileSync(path.join(ROOT, 'android/app/build.gradle'), 'utf8');
  const gradleName = gradle.match(/versionName\s+"([^"]+)"/);
  const gradleCode = gradle.match(/versionCode\s+(\d+)/);
  if (!gradleName || gradleName[1] !== version) {
    problems.push('android/app/build.gradle: versionName ' + (gradleName ? gradleName[1] : '?') + ' != ' + version);
  }
  if (!gradleCode || Number(gradleCode[1]) !== code) {
    problems.push('android/app/build.gradle: versionCode ' + (gradleCode ? gradleCode[1] : '?') + ' != ' + code);
  }

  const twa = readJSON('android/twa-manifest.json');
  if (twa.appVersion !== version || twa.appVersionName !== version || Number(twa.appVersionCode) !== code) {
    problems.push('android/twa-manifest.json: appVersion/appVersionName/appVersionCode do not match ' + version + '/' + code);
  }

  const sw = fs.readFileSync(path.join(ROOT, 'app/public/sw.js'), 'utf8');
  const swName = sw.match(/const CACHE_NAME = 'fishsmart-pro-v([^']+)'/);
  if (!swName || swName[1] !== version) {
    problems.push('app/public/sw.js: CACHE_NAME v' + (swName ? swName[1] : '?') + ' != v' + version);
  }

  if (problems.length) {
    console.error('Version drift detected (canonical app/package.json = ' + version + '):');
    for (const p of problems) console.error('  - ' + p);
    console.error('\nFix with: npm run sync-versions:write  (or npm run bump for a release bump)');
    process.exit(1);
  }

  console.log('Version sync OK: ' + version + ' (versionCode ' + code + ') across all 5 targets.');
}

function main() {
  const pkg = readJSON('app/package.json');
  let version = pkg.version;

  if (!version) {
    console.error('ERROR: app/package.json has no "version" field.');
    process.exit(1);
  }

  if (MODE === 'bump' || MODE === 'bump-patch') {
    const next = MODE === 'bump' ? bumpMinor(version) : bumpPatch(version);
    console.log('\nBump: ' + version + ' -> ' + next + ' (' + (MODE === 'bump' ? 'minor' : 'patch') + ')\n');
    version = next;
    patchFile('app/package.json', [
      ['version -> ' + version, /"version":\s*"[^"]+"/, '"version": "' + version + '"'],
    ]);
  }

  const code = versionToCode(version);
  console.log('Source: app/package.json version = ' + version + ' (code: ' + code + ')\n');

  if (MODE === 'check') {
    checkSync(version, code);
    return;
  }

  console.log(APPLY ? '=== WRITING ===\n' : '=== DRY RUN (no files changed) ===\n');

  // root package.json (derived 3-part semver)
  patchFile('package.json', [
    ['version -> ' + rootVersion(version), /"version":\s*"[^"]+"/, '"version": "' + rootVersion(version) + '"'],
  ]);

  // android/app/build.gradle
  patchFile('android/app/build.gradle', [
    ['versionCode -> ' + code, /versionCode\s+\d+/, 'versionCode ' + code],
    ['versionName -> "' + version + '"', /versionName\s+"[^"]+"/, 'versionName "' + version + '"'],
  ]);

  // android/twa-manifest.json
  const twaPath = 'android/twa-manifest.json';
  const twa = readJSON(twaPath);
  if (twa.appVersionName !== version || Number(twa.appVersionCode) !== code || twa.appVersion !== version) {
    console.log('  ' + twaPath + ': needs update');
    twa.appVersionName = version;
    twa.appVersionCode = code;
    twa.appVersion = version;
    writeJSON(twaPath, twa);
  } else {
    console.log('  ' + twaPath + ': already up to date');
  }

  // app/public/sw.js (CACHE_NAME — PWA cache bust)
  patchFile('app/public/sw.js', [
    ['CACHE_NAME -> fishsmart-pro-v' + version, /const CACHE_NAME = 'fishsmart-pro-v[^']*';/, "const CACHE_NAME = 'fishsmart-pro-v" + version + "';"],
  ]);

  console.log('\nDone.');
}

main();
