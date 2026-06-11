"use strict";

const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config/env');

function createBillingRoutes({ stripeService, db, getOrCreateCustomer, computeAndSaveEntitlement, billingAuth }) {
    const router = express.Router();
    const { stripe } = stripeService;
    const appUrl = config.appUrl;

    const billingLimiter = rateLimit({ windowMs: 60000, max: 10, standardHeaders: true, legacyHeaders: false });

    // POST /checkout — create Stripe Checkout Session
    router.post('/checkout', billingLimiter, billingAuth, async (req, res) => {
        try {
            const { accountId } = req.user;
            const { plan } = req.body; // 'monthly' or 'yearly'

            const priceId = plan === 'yearly'
                ? config.stripePriceYearly
                : config.stripePriceMonthly;
            if (!priceId) {
                return res.status(500).json({ data: null, error: 'Price not configured' });
            }

            // Check for existing active Stripe subscription (409)
            const { rows } = await db.query(
                `SELECT id FROM billing_subscriptions
                 WHERE account_id = $1 AND provider = 'stripe'
                 AND status IN ('active','trialing','past_due')`,
                [accountId]
            );
            if (rows.length > 0) {
                return res.status(409).json({ data: null, error: 'Active subscription exists' });
            }

            // Bypass Stripe SDK entirely — use native fetch (SDK networking fails on Render free tier)
            let customerId;
            const { rows: custRows } = await db.query(
                'SELECT customer_id FROM stripe_customers WHERE account_id = $1', [accountId]
            );
            if (custRows.length > 0) {
                customerId = custRows[0].customer_id;
            } else {
                const custRes = await fetch('https://api.stripe.com/v1/customers', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + config.stripeSecretKey, 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ 'metadata[appAccountId]': accountId })
                });
                if (!custRes.ok) throw new Error('Stripe customer create ' + custRes.status + ': ' + await custRes.text());
                const cust = await custRes.json();
                customerId = cust.id;
                await db.query('INSERT INTO stripe_customers (customer_id, account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [customerId, accountId]);
            }

            const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + config.stripeSecretKey, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    'mode': 'subscription', 'customer': customerId,
                    'line_items[0][price]': priceId, 'line_items[0][quantity]': '1',
                    'metadata[accountId]': accountId,
                    'subscription_data[metadata][appAccountId]': accountId,
                    'success_url': appUrl + '/?session_id={CHECKOUT_SESSION_ID}',
                    'cancel_url': appUrl + '/?canceled=true',
                })
            });
            if (!sessionRes.ok) throw new Error('Stripe checkout ' + sessionRes.status + ': ' + await sessionRes.text());
            const session = await sessionRes.json();

            console.info('checkout created', { sessionId: session.id, accountId });
            res.json({ data: { url: session.url }, error: null });
        } catch (error) {
            console.error('checkout failed', { accountId: req.user && req.user.accountId, error: error.message, stack: error.stack });
            const isStripeError = error.message && error.message.includes('Stripe');
            const isDbTimeout = !isStripeError && error.message && (error.message.includes('timeout') || error.message.includes('connection'));
            const status = (isDbTimeout || isStripeError) ? 503 : 500;
            const msg = isStripeError ? 'Payment service temporarily unavailable, please try again'
                       : isDbTimeout ? 'Service temporarily unavailable, please try again'
                       : 'Checkout creation failed';
            res.status(status).json({ data: null, error: msg, code: isStripeError ? 'STRIPE_ERROR' : isDbTimeout ? 'DB_TIMEOUT' : 'CHECKOUT_ERROR' });
        }
    });

    // GET /confirm-session — proactive sync after checkout return
    router.get('/confirm-session', billingLimiter, billingAuth, async (req, res) => {
        try {
            const { session_id } = req.query;
            if (!session_id) {
                return res.status(400).json({ error: 'session_id required' });
            }

            const { accountId } = req.user;

            // Retrieve from Stripe API via native fetch (SDK fails on Render free tier)
            const sessRes = await fetch('https://api.stripe.com/v1/checkout/sessions/' + session_id + '?expand[]=subscription', {
                headers: { 'Authorization': 'Bearer ' + config.stripeSecretKey }
            });
            if (!sessRes.ok) throw new Error('Stripe session retrieve ' + sessRes.status);
            const session = await sessRes.json();

            // Validate metadata matches authenticated user
            if (session.metadata && session.metadata.accountId !== accountId) {
                return res.status(403).json({ error: 'Session does not match account' });
            }

            // Proactive sync from Stripe API
            if (session.subscription) {
                const sub = session.subscription;
                await db.query(
                    'INSERT INTO billing_subscriptions\n                      (account_id, provider, provider_customer_id, provider_subscription_id, status, current_period_end, cancel_at_period_end, raw)\n                     VALUES ($1, \'stripe\', $2, $3, $4, $5, $6, $7)\n                     ON CONFLICT (provider_subscription_id) DO UPDATE SET\n                       status = EXCLUDED.status,\n                       current_period_end = EXCLUDED.current_period_end,\n                       cancel_at_period_end = EXCLUDED.cancel_at_period_end,\n                       raw = EXCLUDED.raw,\n                       updated_at = now()',
                    [accountId, sub.customer, sub.id, sub.status, sub.current_period_end, sub.cancel_at_period_end, sub]
                );
            }

            // Recompute entitlement
            const entitlement = await computeAndSaveEntitlement(accountId);

            res.json({
                is_premium: entitlement.isPremium,
                source: entitlement.source,
                expires_at: entitlement.expiresAt,
            });
        } catch (error) {
            console.error('confirm-session failed', { error: error.message });
            res.status(500).json({ error: 'Session confirmation failed' });
        }
    });

    // POST /portal-session — create Customer Portal session
    router.post('/portal-session', billingLimiter, billingAuth, async (req, res) => {
        try {
            const { accountId } = req.user;
            // Lookup customer via DB (bypass Stripe SDK)
            const { rows: custRows } = await db.query(
                'SELECT customer_id FROM stripe_customers WHERE account_id = $1', [accountId]
            );
            if (custRows.length === 0) {
                return res.status(404).json({ error: 'No Stripe customer found' });
            }
            const customerId = custRows[0].customer_id;

            const portalParams = new URLSearchParams({
                customer: customerId,
                return_url: appUrl + '/billing',
            });
            if (config.stripePortalConfigId) {
                portalParams.append('configuration', config.stripePortalConfigId);
            }
            const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + config.stripeSecretKey, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: portalParams
            });
            if (!portalRes.ok) throw new Error('Stripe portal ' + portalRes.status);
            const session = await portalRes.json();
            res.json({ url: session.url });
        } catch (error) {
            console.error('portal-session failed', { error: error.message });
            res.status(500).json({ error: 'Portal session creation failed' });
        }
    });

    // GET /entitlement — return current entitlement state
    router.get('/entitlement', billingAuth, async (req, res) => {
        try {
            const { accountId } = req.user;
            const entitlement = await computeAndSaveEntitlement(accountId);

            res.json({
                is_premium: entitlement.isPremium,
                source: entitlement.source,
                expires_at: entitlement.expiresAt,
            });
        } catch (error) {
            console.error('entitlement fetch failed', { error: error.message });
            res.status(500).json({ is_premium: false, source: 'error', expires_at: null });
        }
    });

    // POST /restore — link current session to existing Stripe subscription via email
    router.post('/restore', billingLimiter, async (req, res) => {
        try {
            const { email } = req.body;
            if (!email || typeof email !== 'string' || !email.includes('@')) {
                return res.status(400).json({ error: 'Valid email required' });
            }

            // 1. Find Stripe customer by email
            const custRes = await fetch(
                'https://api.stripe.com/v1/customers?email=' + encodeURIComponent(email) + '&limit=3',
                { headers: { 'Authorization': 'Bearer ' + config.stripeSecretKey } }
            );
            if (!custRes.ok) throw new Error('Stripe lookup failed');
            const custData = await custRes.json();
            if (!custData.data || custData.data.length === 0) {
                return res.status(404).json({ error: 'No subscription found for that email' });
            }

            // 2. Find matching account in our DB
            const customerIds = custData.data.map(c => c.id);
            const placeholders = customerIds.map((_, i) => '$' + (i + 1)).join(',');
            const { rows: accountRows } = await db.query(
                'SELECT customer_id, account_id FROM stripe_customers WHERE customer_id IN (' + placeholders + ')',
                customerIds
            );
            if (accountRows.length === 0) {
                return res.status(404).json({ error: 'No subscription found for that email' });
            }

            // 3. Check for active subscription
            const accountIds = accountRows.map(r => r.account_id);
            const acctPlaceholders = accountIds.map((_, i) => '$' + (i + 1)).join(',');
            const { rows: subRows } = await db.query(
                'SELECT account_id, status FROM billing_subscriptions\n                 WHERE account_id IN (' + acctPlaceholders + ')\n                 AND status IN (\'active\',\'trialing\',\'past_due\')\n                 LIMIT 1',
                accountIds
            );
            if (subRows.length === 0) {
                return res.status(404).json({ error: 'No active subscription found for that email' });
            }

            const accountId = subRows[0].account_id;

            // 4. Link current session to this account
            const sessionToken = req.headers['x-session-token'];
            if (!sessionToken) {
                return res.status(400).json({ error: 'Session token required' });
            }
            const crypto = require('crypto');
            const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
            await db.query(
                'INSERT INTO billing_sessions (session_token_hash, account_id)\n                 VALUES ($1, $2)\n                 ON CONFLICT (session_token_hash) DO UPDATE SET account_id = $2',
                [tokenHash, accountId]
            );

            // 5. Compute and return entitlement
            const entitlement = await computeAndSaveEntitlement(accountId);
            res.json({
                is_premium: entitlement.isPremium,
                source: entitlement.source,
                expires_at: entitlement.expiresAt
            });
        } catch (error) {
            console.error('restore failed', { error: error.message });
            res.status(500).json({ error: 'Restoration failed' });
        }
    });

    return router;
}

module.exports = { createBillingRoutes };
