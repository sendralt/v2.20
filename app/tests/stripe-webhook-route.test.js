"use strict";

/**
 * Regression tests for the Stripe webhook ROUTE (not the handler).
 *
 * Bug: Express 4 does not catch rejected promises from async route handlers.
 * The DB idempotency check and event insert were awaited without try-catch,
 * causing requests to hang on any DB error → Stripe timed out and reported
 * the webhook as Failed.
 *
 * Fix: Every async DB operation in the route is now wrapped in try-catch
 * with an explicit error response.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { createWebhookRoutes } = require('../src/routes/webhooks');

/** Create a minimal Express app with just the webhook route for testing. */
function createTestApp({ db, processStripeEvent }) {
    const app = express();
    app.set('trust proxy', 1);

    // Skip JSON parsing for webhook routes (same as production)
    app.use((req, res, next) => {
        if (req.path.startsWith('/api/webhooks')) return next();
        express.json()(req, res, next);
    });

    // Mock Stripe client
    const stripe = {
        webhooks: {
            constructEvent: (body, sig, secret) => {
                if (!sig || sig === 'bad-sig') {
                    throw new Error('No signature found');
                }
                return JSON.parse(body);
            }
        }
    };

    const router = createWebhookRoutes({ stripe, db, processStripeEvent });
    app.use('/api/webhooks', router);

    // Global error handler (same as production fix)
    app.use((err, _req, res, _next) => {
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return app;
}

/** Send a POST request to the test app. */
function sendWebhook(app, payload, signature = 'valid-sig') {
    return new Promise((resolve) => {
        const server = app.listen(0, () => {
            const port = server.address().port;
            const body = JSON.stringify(payload);
            const req = http.request({
                hostname: '127.0.0.1',
                port,
                path: '/api/webhooks/stripe',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'stripe-signature': signature,
                    'Content-Length': Buffer.byteLength(body),
                },
                timeout: 5000,
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    server.close();
                    resolve({ status: res.statusCode, body: data });
                });
            });
            req.on('error', () => {
                server.close();
                resolve({ status: 0, body: '', error: true });
            });
            req.write(body);
            req.end();
        });
    });
}

function makeEvent(id = 'evt_test_1', type = 'checkout.session.completed') {
    return { id, type, data: { object: { id: 'sub_1', mode: 'subscription' } } };
}

describe('Stripe Webhook Route — Async Error Safety', () => {

    it('returns 401 on invalid signature', async () => {
        const db = { query: async () => ({ rows: [] }) };
        const app = createTestApp({ db, processStripeEvent: async () => {} });
        const res = await sendWebhook(app, makeEvent(), 'bad-sig');
        assert.equal(res.status, 401);
    });

    it('returns 500 when idempotency DB check fails (does not hang)', async () => {
        const db = {
            query: async () => { throw new Error('Connection refused'); }
        };
        const app = createTestApp({ db, processStripeEvent: async () => {} });
        const res = await sendWebhook(app, makeEvent('evt_db_fail'));
        assert.equal(res.status, 500);
        const parsed = JSON.parse(res.body);
        assert.equal(parsed.processed, false);
    });

    it('returns 500 when event INSERT fails (does not hang)', async () => {
        let callCount = 0;
        const db = {
            query: async () => {
                callCount++;
                if (callCount === 1) return { rows: [] }; // idempotency OK
                throw new Error('INSERT failed: relation does not exist'); // insert fails
            }
        };
        const app = createTestApp({ db, processStripeEvent: async () => {} });
        const res = await sendWebhook(app, makeEvent('evt_insert_fail'));
        assert.equal(res.status, 500);
    });

    it('returns 200 on duplicate event (idempotency)', async () => {
        const db = {
            query: async () => ({ rows: [{ id: 1 }], rowCount: 1 })
        };
        const app = createTestApp({ db, processStripeEvent: async () => {} });
        const res = await sendWebhook(app, makeEvent('evt_dup'));
        assert.equal(res.status, 200);
        const parsed = JSON.parse(res.body);
        assert.equal(parsed.duplicate, true);
    });

    it('returns 500 when event processing fails (Stripe will retry)', async () => {
        const db = { query: async () => ({ rows: [] }) };
        const app = createTestApp({
            db,
            processStripeEvent: async () => { throw new Error('Stripe API error'); }
        });
        const res = await sendWebhook(app, makeEvent('evt_proc_fail'));
        assert.equal(res.status, 500);
    });

    it('returns 200 on successful processing', async () => {
        const db = { query: async () => ({ rows: [] }) };
        const app = createTestApp({
            db,
            processStripeEvent: async () => {}
        });
        const res = await sendWebhook(app, makeEvent('evt_ok'));
        assert.equal(res.status, 200);
        const parsed = JSON.parse(res.body);
        assert.equal(parsed.received, true);
    });

    it('returns 200 even if post-processing UPDATE fails (event was handled)', async () => {
        let callCount = 0;
        const db = {
            query: async () => {
                callCount++;
                if (callCount <= 2) return { rows: [] }; // idempotency OK + insert OK
                throw new Error('UPDATE failed'); // processed=true update fails
            }
        };
        const app = createTestApp({
            db,
            processStripeEvent: async () => {}
        });
        const res = await sendWebhook(app, makeEvent('evt_update_fail'));
        assert.equal(res.status, 200);
    });
});
