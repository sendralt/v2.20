'use strict';

/**
 * Billing Link Service
 *
 * Maps volatile session tokens (and the stable device cookie) to a billing account.
 *
 * Problem this fixes: billing_sessions binds ONE session-token hash to an account,
 * but session tokens rotate constantly (24h expiry, in-memory store wiped on Render
 * restarts, 401 auto-recovery minting new tokens). After rotation the subscriber's
 * entitlement lookup missed and they were silently demoted to the free tier —
 * paywall on every 3rd forecast even while subscribed.
 *
 * Solution: billing_device_links (cookie_id -> account_id) keyed on the HttpOnly
 * fishsmart_did cookie keeps a stable billing identity. Resolution order:
 *   1. session token hash (authoritative for this session)
 *   2. device cookie fallback + self-heal (re-link the rotated token)
 *
 * All device-link queries degrade gracefully if the table has not been migrated.
 */

function createBillingLinkService({ db }) {
    if (!db) {
        throw new Error('db is required for billing link service');
    }

    function isMissingTable(error) {
        return error && (error.code === '42P01' || /billing_device_links does not exist/.test(error.message || ''));
    }

    /**
     * Resolve the billing account for a request.
     * @param {string} tokenHash - sha256 of the session token
     * @param {string|null} cookieId - fishsmart_did cookie (stable device identity)
     * @returns {Promise<string|null>} account id
     */
    async function resolveAccount(tokenHash, cookieId) {
        if (!tokenHash && !cookieId) return null;

        // 1. Session token is authoritative.
        if (tokenHash) {
            const { rows } = await db.query(
                'SELECT account_id FROM billing_sessions WHERE session_token_hash = $1',
                [tokenHash]
            );
            if (rows.length > 0) {
                const accountId = rows[0].account_id;
                // Opportunistically record the device link (cookie may be newer than the token row).
                if (cookieId) {
                    try {
                        await db.query(
                            'INSERT INTO billing_device_links (cookie_id, account_id) VALUES ($1, $2) ON CONFLICT (cookie_id) DO NOTHING',
                            [cookieId, accountId]
                        );
                    } catch (error) {
                        if (!isMissingTable(error)) throw error;
                    }
                }
                return accountId;
            }
        }

        // 2. Device cookie fallback — this is what survives token rotation.
        if (cookieId) {
            let accountId = null;
            try {
                const { rows } = await db.query(
                    'SELECT account_id FROM billing_device_links WHERE cookie_id = $1',
                    [cookieId]
                );
                accountId = rows.length > 0 ? rows[0].account_id : null;
            } catch (error) {
                if (!isMissingTable(error)) throw error;
                return null; // table missing: no fallback available
            }

            if (accountId && tokenHash) {
                // Self-heal: re-link the rotated token so lookups stay fast next time.
                try {
                    await db.query(
                        'INSERT INTO billing_sessions (session_token_hash, account_id) VALUES ($1, $2) ON CONFLICT (session_token_hash) DO NOTHING',
                        [tokenHash, accountId]
                    );
                } catch (error) {
                    console.warn('billing-link: failed to self-heal session link:', error.message);
                }
            }
            return accountId;
        }

        return null;
    }

    /**
     * Resolve or lazily create the billing account for a session.
     * Reuses the device-linked account instead of minting an empty orphan after
     * server restarts / token rotation.
     */
    async function getOrCreateAccountForSession(tokenHash, cookieId) {
        const existing = await resolveAccount(tokenHash, cookieId);
        if (existing) return existing;

        const crypto = require('crypto');
        const accountId = crypto.randomUUID();
        await db.query('INSERT INTO accounts (id) VALUES ($1) ON CONFLICT DO NOTHING', [accountId]);
        await db.query(
            'INSERT INTO billing_sessions (session_token_hash, account_id) VALUES ($1, $2) ON CONFLICT (session_token_hash) DO NOTHING',
            [tokenHash, accountId]
        );
        if (cookieId) {
            try {
                await db.query(
                    'INSERT INTO billing_device_links (cookie_id, account_id) VALUES ($1, $2) ON CONFLICT (cookie_id) DO NOTHING',
                    [cookieId, accountId]
                );
            } catch (error) {
                if (!isMissingTable(error)) throw error;
            }
        }
        return accountId;
    }

    /**
     * Explicitly (re)bind a device cookie to an account — used by restore/checkout
     * so the link survives all future token rotations.
     */
    async function linkDevice(cookieId, accountId) {
        if (!cookieId || !accountId) return;
        await db.query(
            'INSERT INTO billing_device_links (cookie_id, account_id) VALUES ($1, $2) ' +
            'ON CONFLICT (cookie_id) DO UPDATE SET account_id = EXCLUDED.account_id, updated_at = now()',
            [cookieId, accountId]
        );
    }

    return { resolveAccount, getOrCreateAccountForSession, linkDevice };
}

module.exports = { createBillingLinkService };
