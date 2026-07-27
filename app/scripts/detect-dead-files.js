'use strict';

/**
 * Dead File Detector
 *
 * Scans app/ for .js source files that are never require()'d by any other file.
 * Catches stale duplicates (like the old app/ai.js) and orphaned modules.
 *
 * Entry points (server.js) and tooling scripts (benchmarks, generators) are
 * allowlisted since they're run directly, not imported.
 *
 * Usage: node scripts/detect-dead-files.js
 * Exit code 0 = no dead files, 1 = dead files found
 */

const fs = require('fs');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '..');

// Directories to skip during scanning
const SKIP_DIRS = new Set(['node_modules', 'build', '.git', 'tests', '.well-known']);

// Files that are entry points or loaded by tooling/browser — not require()'d
const ALLOWLIST = new Set([
    'server.js',                    // app entry point
    'tailwind.config.js',           // loaded by tailwindcss CLI
    'scripts/generate-promo.js',    // standalone script
    'scripts/build-css-debug.js',   // standalone script
    'scripts/detect-dead-files.js', // this file (self-reference prevention)
    'benchmark-bite-score.js',      // standalone benchmark
    'benchmark-activity-forecast.js', // standalone benchmark
    // Browser-loaded public/ files (loaded via <script> tags, not require())
    'public/js/app.js',
    'public/js/auth-utils.js',
    'public/js/forecast-card.js',
    'public/js/bite-checker.js',
    'public/bite-checker.html',
    'public/js/subscription.js',
    'public/sw.js',
    'public/chart.umd.min.js',
    'public/lucide.min.js',
    'public/purify.min.js',
]);

/**
 * Recursively collect all .js files, excluding SKIP_DIRS and test files.
 */
function getAllSourceFiles(dir) {
    const results = [];
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return results;
    }
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            results.push(...getAllSourceFiles(fullPath));
        } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
            const relPath = path.relative(APP_ROOT, fullPath);
            if (!ALLOWLIST.has(relPath)) {
                results.push(fullPath);
            }
        }
    }
    return results;
}

/**
 * Collect all require() statements from ALL .js files (including tests).
 * Returns array of { requirer: absolutePath, target: requireString }.
 */
function getAllRequireStatements(dir) {
    const statements = [];
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return statements;
    }
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'build') continue;
            statements.push(...getAllRequireStatements(fullPath));
        } else if (entry.name.endsWith('.js')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            // Match require('...') or require("...")
            const regex = /require\(['"]([^'"]+)['"]\)/g;
            let match;
            while ((match = regex.exec(content)) !== null) {
                // Only relative requires matter for dead-file detection
                if (match[1].startsWith('.') || match[1].startsWith('/')) {
                    statements.push({ requirer: fullPath, target: match[1] });
                }
            }
        }
    }
    return statements;
}

/**
 * Resolve a require target relative to the requirer file.
 * Returns the absolute path if resolvable, null otherwise.
 */
function resolveRequire(requirer, target) {
    const requirerDir = path.dirname(requirer);
    // Try as-is, then with .js extension
    const candidates = [
        path.resolve(requirerDir, target),
        path.resolve(requirerDir, target + '.js'),
        path.resolve(requirerDir, target, 'index.js'), // directory require
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return candidate;
        }
    }
    return null;
}

/**
 * Main: detect dead files.
 * Returns { deadFiles: string[], scanned: number }.
 */
function detectDeadFiles() {
    const sourceFiles = getAllSourceFiles(APP_ROOT);
    const requireStatements = getAllRequireStatements(APP_ROOT);

    // Build set of all resolved target paths
    const requiredPaths = new Set();
    for (const { requirer, target } of requireStatements) {
        const resolved = resolveRequire(requirer, target);
        if (resolved) {
            requiredPaths.add(resolved);
        }
    }

    // Find source files that are never required
    const deadFiles = [];
    for (const file of sourceFiles) {
        if (!requiredPaths.has(file)) {
            deadFiles.push(path.relative(APP_ROOT, file));
        }
    }

    return { deadFiles, scanned: sourceFiles.length };
}

// CLI entry point
if (require.main === module) {
    const { deadFiles, scanned } = detectDeadFiles();
    console.log('Dead File Detector');
    console.log('==================');
    console.log('Scanned ' + scanned + ' source files in app/');
    console.log('');
    if (deadFiles.length === 0) {
        console.log('✓ No dead files detected — all source files are require()\'d by at least one other file.');
        process.exit(0);
    } else {
        console.error('✗ ' + deadFiles.length + ' dead file(s) found:');
        for (const f of deadFiles) {
            console.error('  - ' + f);
        }
        console.error('');
        console.error('These files are not require()\'d by any other file.');
        console.error('If they are entry points or tooling scripts, add them to ALLOWLIST in scripts/detect-dead-files.js');
        console.error('Otherwise, delete them.');
        process.exit(1);
    }
}

module.exports = { detectDeadFiles };
