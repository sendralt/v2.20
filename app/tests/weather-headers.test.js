'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Regression test for gzip corruption bug on Render.
 *
 * Commit 6779aa7 established that ALL external fetch() calls must include
 * `Accept-Encoding: identity` to prevent gzip-encoded responses from being
 * corrupted on Render's infrastructure, which causes getWeatherData() to
 * silently return null (weather shows as "offline" for new users while
 * the AI plan still generates).
 *
 * This test statically verifies that every fetch() call in weather.js
 * and water-temp.js includes the required header.
 */

const FILES_TO_CHECK = [
    path.join(__dirname, '..', 'src', 'services', 'weather.js'),
    path.join(__dirname, '..', 'src', 'engine', 'water-temp.js')
];

function extractFetchCallHeaders(filePath) {
    const source = fs.readFileSync(filePath, 'utf8');
    const lines = source.split('\n');
    const results = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('fetch(') && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
            // Grab surrounding context (5 lines before, 10 after) to find headers
            const start = Math.max(0, i - 2);
            const end = Math.min(lines.length - 1, i + 12);
            const context = lines.slice(start, end + 1).join('\n');
            results.push({ lineNum: i + 1, context });
        }
    }
    return results;
}

test('All fetch() calls in weather.js include Accept-Encoding: identity', () => {
    const filePath = path.join(__dirname, '..', 'src', 'services', 'weather.js');
    const calls = extractFetchCallHeaders(filePath);

    assert.ok(calls.length > 0, 'Should find at least one fetch() call in weather.js');

    for (const call of calls) {
        assert.ok(
            call.context.includes('Accept-Encoding') && call.context.includes('identity'),
            `fetch() at line ${call.lineNum} in weather.js is missing 'Accept-Encoding: identity' header.\n` +
            `This causes gzip corruption on Render, making weather data return null for new users.`
        );
    }
});

test('All fetch() calls in water-temp.js include Accept-Encoding: identity', () => {
    const filePath = path.join(__dirname, '..', 'src', 'engine', 'water-temp.js');
    const calls = extractFetchCallHeaders(filePath);

    assert.ok(calls.length > 0, 'Should find at least one fetch() call in water-temp.js');

    for (const call of calls) {
        assert.ok(
            call.context.includes('Accept-Encoding') && call.context.includes('identity'),
            `fetch() at line ${call.lineNum} in water-temp.js is missing 'Accept-Encoding: identity' header.\n` +
            `This causes gzip corruption on Render, making water temp data return null.`
        );
    }
});
