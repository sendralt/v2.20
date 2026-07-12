"use strict";

const express = require('express');
const rateLimit = require('express-rate-limit');

function createWebhookRoutes({ stripe, db, processStripeEvent }) {
    const router = express.Router();

    // Rate limit: 100 requests per minute
    const webhookLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
    });

    // POST /stripe — raw body for signature verification
    router.post('/stripe',
        webhookLimiter,
        express.raw({ type: 'application/json' }),
        async (req, res) => {
            const sig = req.headers['stripe-signature'];
            let event;

            // 1. Verify signature
            try {
                event = stripe.webhooks.constructEvent(
                    req.body, sig, process.env.STRIPE_WEBHOOK_SECRET
                );
            } catch (err) {
                console.error('Webhook signature verification failed', { error: err.message });
                return res.status(401).send('Invalid signature');
            }

            // 2. Idempotency check (wrapped — DB failures must not hang the request)
            try {
                const { rowCount } = await db.query(
                    'SELECT 1 FROM webhook_events WHERE id = $1', [event.id]
                );
                if (rowCount > 0) {
                    return res.status(200).json({ received: true, duplicate: true });
                }
            } catch (err) {
                console.error('Webhook idempotency check failed', {
                    eventId: event.id, error: err.message
                });
                // Return 500 so Stripe retries; do NOT hang
                return res.status(500).json({ received: true, processed: false });
            }

            // 3. Insert event (unprocessed)
            try {
                await db.query(
                    "INSERT INTO webhook_events (id, provider, payload) VALUES ($1, 'stripe', $2)",
                    [event.id, event]
                );
            } catch (err) {
                console.error('Webhook event insert failed', {
                    eventId: event.id, error: err.message
                });
                return res.status(500).json({ received: true, processed: false });
            }

            // 4. Process event
            try {
                await processStripeEvent(event);
            } catch (err) {
                // Leave unprocessed — Stripe retries up to 72h
                console.error('webhook processing failed', {
                    eventId: event.id, error: err.message
                });
                return res.status(500).json({ received: true, processed: false });
            }

            // 5. Mark processed (non-fatal if UPDATE fails — event was handled)
            try {
                await db.query(
                    'UPDATE webhook_events SET processed = true WHERE id = $1', [event.id]
                );
            } catch (err) {
                console.warn('webhook processed but UPDATE failed', {
                    eventId: event.id, error: err.message
                });
            }
            console.info('webhook processed', {
                eventId: event.id, eventType: event.type
            });

            res.status(200).json({ received: true });
        }
    );

    return router;
}

module.exports = { createWebhookRoutes };
