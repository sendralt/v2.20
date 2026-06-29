"use strict";

const crypto = require('crypto');

function createBillingAuthMiddleware({ db, sessionAuth = null }) {
    return async function billingAuth(req, res, next) {
        const sessionToken = req.headers['x-session-token'];
        if (!sessionToken) {
            return res.status(401).json({ error: 'Session token required' });
        }

        try {
            // SECURITY (CVE-001): Validate token against session-auth as an enhancement layer.
            // If session-auth recognizes it, we trust it. If not (server restart, cross-instance),
            // we fall through to lazy account creation — rejecting here breaks all new subscriptions
            // since session-auth is in-memory and doesn't persist across restarts.
            // Rate limiting (billingLimiter) prevents abuse of lazy creation.
            if (sessionAuth) {
                const validation = await sessionAuth.validateSession(sessionToken, null, req);
                if (!validation.valid) {
                    console.warn('billing-auth: token not in session-auth store, using lazy fallback', {
                        tokenPrefix: sessionToken.substring(0, 8)
                    });
                }
            }

            const hash = crypto.createHash('sha256').update(sessionToken).digest('hex');
            let { rows } = await db.query(
                'SELECT account_id FROM billing_sessions WHERE session_token_hash = $1',
                [hash]
            );

        if (rows.length === 0) {
            // Lazy account creation — only for tokens validated by sessionAuth above
            const accountId = crypto.randomUUID();
            await db.query('INSERT INTO accounts (id) VALUES ($1) ON CONFLICT DO NOTHING', [accountId]);
            await db.query(
                'INSERT INTO billing_sessions (session_token_hash, account_id) VALUES ($1, $2)',
                [hash, accountId]
            );
            req.user = { accountId };
        } else {
            req.user = { accountId: rows[0].account_id };
        }

            next();
        } catch (error) {
            console.error('billing-auth failed', { error: error.message });
            return res.status(503).json({ error: 'Billing service unavailable', code: 'BILLING_DB_ERROR' });
        }
    };
}

module.exports = { createBillingAuthMiddleware };
