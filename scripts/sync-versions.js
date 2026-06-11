#!/usr/bin/env node

/**
 * sync-versions.js
 *
 * Reads the canonical version from package.json and propagates it to:
 *   - android-project/app/build.gradle  (versionCode, versionName)
 *   - android-project/twa-manifest.json (appVersion, appVersionCode, appVersionName)
 *   - public/sw.js                       (CACHE_NAME)
 *
 * Usage:
 *   node scripts/sync-versions.js          # dry-run
 *   node scripts/sync-versions.js --write   # apply
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY_RUN = !process.argv.includes('--write');

function readJSON(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

function writeJSON(relPath, obj) {
  const dest = path.join(ROOT, relPath);
  if (DRY_RUN) {
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
      content = content.replace(pattern, replacement);
      changed = true;
      console.log('  ' + relPath + ': ' + label);
    } else {
      console.log('  ' + relPath + ': already correct (' + label + ')');
    }
  }

  if (changed) {
    if (DRY_RUN) {
      console.log('  [dry-run] would patch ' + relPath);
    } else {
      fs.writeFileSync(dest, content, 'utf8');
      console.log('  patched ' + relPath);
    }
  }
}

/**
 * Derive Android versionCode from version string.
 * Convention: major.minor → minor (e.g. "2.19" → 19, "2.18" → 18)
 * For 3-part semver: major.minor.patch → minor * 100 + patch (e.g. "2.19.3" → 1903)
 */
function versionToCode(ver) {
  const parts = ver.split('.').map(Number);
  if (parts.length >= 3) {
    return parts[1] * 100 + parts[2];
  }
  return parts[1] !== undefined ? parts[1] : parts[0];
}

function main() {
  const pkg = readJSON('package.json');
  const version = pkg.version;

  if (!version) {
    console.error('ERROR: package.json has no "version" field.');
    process.exit(1);
  }

  const code = versionToCode(version);

  console.log('\nSource: package.json version = ' + version + ' (code: ' + code + ')\n');
  console.log(DRY_RUN ? '=== DRY RUN (no files changed) ===\n' : '=== WRITING ===\n');

  // build.gradle
  patchFile('android-project/app/build.gradle', [
    ['versionCode -> ' + code, /versionCode\s+\d+/, 'versionCode ' + code],
    ['versionName -> "' + version + '"', /versionName\s+"[^"]+"/, 'versionName "' + version + '"'],
  ]);

  // twa-manifest.json
  const twaPath = 'android-project/twa-manifest.json';
  const twa = readJSON(twaPath);

  if (twa.appVersionName !== version || twa.appVersionCode !== code || twa.appVersion !== version) {
    console.log('  ' + twaPath + ': needs update');
    twa.appVersionName = version;
    twa.appVersionCode = code;
    twa.appVersion = version;
    writeJSON(twaPath, twa);
  } else {
    console.log('  ' + twaPath + ': already up to date');
  }

  // sw.js (CACHE_NAME)
  patchFile('public/sw.js', [
    ['CACHE_NAME -> fishsmart-pro-v' + version, /const CACHE_NAME = 'fishsmart-pro-v[^']*';/, "const CACHE_NAME = 'fishsmart-pro-v" + version + "';"],
  ]);

  console.log('\nDone.\n');
}

main();
