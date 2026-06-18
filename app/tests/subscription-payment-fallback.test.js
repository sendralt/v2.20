"use strict";

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

function jsonResponse(ok, body) {
    return { ok, async json() { return body; } };
}

function loadSubscriptionScript(fetchImpl) {
    const dom = new JSDOM(`<!doctype html><body>
        <div id="loadingOverlay" class="hidden"></div>
        <div id="loadingText"></div>
    </body>`, {
        url: 'https://fishsmart.test/',
        runScripts: 'outside-only'
    });

    const { window } = dom;
    const originalAddEventListener = window.document.addEventListener.bind(window.document);
    window.document.addEventListener = (type, listener, options) => {
        if (type === 'DOMContentLoaded') return;
        return originalAddEventListener(type, listener, options);
    };
    window.fetch = fetchImpl;
    window.console = console;
    window.setTimeout = () => 0;
    window.clearTimeout = () => {};

    const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'subscription.js'), 'utf8');
    vm.runInContext(script, dom.getInternalVMContext());
    return { dom, window };
}

describe('subscription payment fallback', () => {
    it('falls back to Stripe checkout when Google Play billing is unavailable', async () => {
        const calls = [];
        const { dom, window } = loadSubscriptionScript(async (url, options = {}) => {
            calls.push({ url, options });

            if (url === '/api/auth/session') {
                return jsonResponse(true, {
                    success: true,
                    sessionId: 'session_123',
                    expiresAt: Date.now() + 60000,
                    data: { usageCount: 0, remaining: 3, isSubscribed: false }
                });
            }

            if (url === '/api/stripe/checkout') {
                return jsonResponse(false, { error: 'Checkout unavailable for test' });
            }

            assert.fail(`Unexpected fetch: ${url}`);
        });

        await window.subscription.initiatePayment('monthly');

        assert.deepEqual(calls.map(call => call.url), [
            '/api/auth/session',
            '/api/stripe/checkout'
        ]);
        assert.equal(JSON.parse(calls[1].options.body).plan, 'monthly');

        dom.window.close();
    });
});