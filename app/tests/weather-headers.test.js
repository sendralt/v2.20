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
 * This test now enforces that ALL external fetch calls go through the
 * centralized safeFetch() wrapper, which ALWAYS includes the header.
 */

function checkNoRawFetch(filePath) {
    const source = fs.readFileSync(filePath, 'utf8');
    const lines = source.split('\n');
    const violations = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
        // Look for raw fetch( calls that are NOT safeFetch
        if (line.match(/\bfetch\(/) && !line.includes('safeFetch')) {
            violations.push(i + 1);
        }
    }
    return violations;
}

test('weather.js uses safeFetch — no raw fetch() calls', () => {
    const filePath = path.join(__dirname, '..', 'src', 'services', 'weather.js');
    const violations = checkNoRawFetch(filePath);
    assert.deepStrictEqual(violations, [],
        'weather.js has raw fetch() calls that bypass safeFetch (lines: ' + violations.join(', ') + '). ' +
        'Use safeFetch() from ../lib/safe-fetch for ALL external requests to prevent gzip corruption on Render.'
    );
});

test('water-temp.js uses safeFetch — no raw fetch() calls', () => {
    const filePath = path.join(__dirname, '..', 'src', 'engine', 'water-temp.js');
    const violations = checkNoRawFetch(filePath);
    assert.deepStrictEqual(violations, [],
        'water-temp.js has raw fetch() calls that bypass safeFetch (lines: ' + violations.join(', ') + '). ' +
        'Use safeFetch() from ../lib/safe-fetch for ALL external requests to prevent gzip corruption on Render.'
    );
});

test('safeFetch always includes Accept-Encoding: identity by default', async () => {
    const { safeFetch } = require('../src/lib/safe-fetch');
    let capturedHeaders = null;
    // Mock global fetch
    const origFetch = global.fetch;
    global.fetch = async (resource, options) => {
        capturedHeaders = options?.headers || {};
        return { ok: true, json: async () => ({}), text: async () => '', clone: function() { return this; } };
    };
    try {
        await safeFetch('https://example.com');
        assert.ok(
            capturedHeaders['Accept-Encoding'] === 'identity',
            'safeFetch should include Accept-Encoding: identity by default'
        );

        // Test with custom headers — identity should still be present
        await safeFetch('https://example.com', { headers: { 'Custom': 'value' } });
        assert.strictEqual(capturedHeaders['Accept-Encoding'], 'identity');
        assert.strictEqual(capturedHeaders['Custom'], 'value');
    } finally {
        global.fetch = origFetch;
    }
});
