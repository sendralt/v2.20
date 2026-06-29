"use strict";

/**
 * Secure Free-Tier Enforcement Middleware
 *
 * Replaces checkSubscription (authMiddleware.requireAuth) on the forecast
 * route ONLY. All other endpoints keep their existing auth. This middleware
 * grants anonymous users 3 free forecasts using a stateless, tamper-evident
 * HMAC token (primary) and a DB-backed IP/device fallback (secondary).
 *
 * Design goals:
 *   - No phantom accounts or in-memory sessions for anonymous users
 *   - Server-side authoritative counter that survives restarts and cookie clears
 *   - Premium (subscribed) users bypass the free-tier check entirely
 *   - Completely separate from billing — never touches Stripe/accounts code
 *
 * Flow of requireFreeTier(req, res, next):
 *   1. Premium bypass: if the request already carries a valid subscribed
 *      session (req.stripeEntitlement.isPremium) → next()
 *   2. Token path: verify the HMAC token from the cookie/header. If valid and
 *      count < FREE_TIER_LIMIT → allow, increment, re-sign, next()
 *   3. DB fallback: if no/invalid token, look up ip_hash in
 *      free_tier_usage_v2. If total_uses < FREE_TIER_LIMIT → allow,
 *      increment DB, mint new signed token, next()
 *   4. Deny: if count >= FREE_TIER_LIMIT → 403 with subscription prompt
 */

const crypto = require('crypto');
const tokenService = require('../services/free-tier-token');

const FREE_TIER_LIMIT = 3;

// Token validity window — matches memory note (30 days).
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const FREE_TIER_COOKIE_OPTS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TOKEN_TTL_MS,
    path: '/'
};

/**
 * SHA-256 hash the client IP for storage. We never store raw IPs.
 * Uses x-forwarded-for when present (behind a proxy) then req.ip.
 */
function hashIp(req) {
    const raw = (req.headers['x-forwarded-for'] || req.ip || '').toString();
    return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Device hash derived from stable request metadata. If a sessionAuth
 * instance is supplied we reuse its fingerprint; otherwise we derive a
 * standalone fingerprint from User-Agent + Accept-Language + IP.
 */
function hashDevice(req, sessionAuth) {
    if (sessionAuth && typeof sessionAuth.createDeviceFingerprint === 'function') {
        return sessionAuth.createDeviceFingerprint(req);
    }
    const components = [
        req.headers['user-agent'] || '',
        req.headers['accept-language'] || '',
        req.headers['x-forwarded-for'] || req.ip || ''
    ];
    return crypto.createHash('sha256').update(components.join('|')).digest('hex');
}

/**
 * Set the re-signed token as an HttpOnly cookie on the response.
 */
function setFreeTierCookie(res, token) {
    if (res && typeof res.cookie === 'function') {
        res.cookie(tokenService.COOKIE_NAME, token, FREE_TIER_COOKIE_OPTS);
    }
}

/**
 * Increment usage in the DB keyed by ip_hash. Idempotent insert/upsert.
 * Returns the new total_uses for this ip_hash. On DB error we fail open
 * (return current token count) so legitimate users are not blocked by a
 * transient DB outage — the signed token still enforces the per-client cap.
 */
async function incrementDbUsage(db, ipHash, deviceHash, currentTokenCount) {
    if (!db) return currentTokenCount;
    try {
        const { rows } = await db.query(
            `INSERT INTO free_tier_usage_v2 (ip_hash, device_hash, total_uses, first_used, last_used)
             VALUES ($1, $2, 1, now(), now())
             ON CONFLICT (ip_hash) DO UPDATE SET
               device_hash = EXCLUDED.device_hash,
               total_uses = free_tier_usage_v2.total_uses + 1,
               last_used = now()
             RETURNING total_uses`,
            [ipHash, deviceHash]
        );
        return rows.length > 0 ? rows[0].total_uses : currentTokenCount + 1;
    } catch (err) {
        console.error('free-tier-check: DB increment failed', err.message);
        return currentTokenCount + 1; // fail open (token still authoritative)
    }
}

/**
 * Read-only lookup of current usage for an ip_hash. Returns 0 on miss/error.
 */
async function getDbUsage(db, ipHash) {
    if (!db) return 0;
    try {
        const { rows } = await db.query(
            'SELECT total_uses FROM free_tier_usage_v2 WHERE ip_hash = $1',
            [ipHash]
        );
        return rows.length > 0 ? rows[0].total_uses : 0;
    } catch (err) {
        console.error('free-tier-check: DB read failed', err.message);
        return 0;
    }
}

/**
 * Build a signed token for the given count and request identity.
 */
function issueToken(count, ipHash, deviceHash) {
    const now = Date.now();
    return tokenService.createToken({
        count,
        ipHash,
        deviceHash,
        createdAt: now,
        expiresAt: now + TOKEN_TTL_MS
    });
}

/**
 * Deny helper: uniform 403 response with subscription prompt.
 */
function denyLimitReached(res) {
    return res.status(403).json({
        success: false,
        error: 'Free tier limit reached. Please subscribe to continue.',
        code: 'SUBSCRIPTION_REQUIRED',
        usage: {
            used: FREE_TIER_LIMIT,
            limit: FREE_TIER_LIMIT,
            remaining: 0
        }
    });
}

/**
 * Create the free-tier middleware set.
 * @param {object} opts
 * @param {object} opts.db - pg Pool / duck-node compatible query interface
 * @param {object} [opts.sessionAuth] - SessionAuthService instance (for device fingerprint reuse)
 */
function createFreeTierMiddleware({ db = null, sessionAuth = null } = {}) {

    /**
     * Enforce free-tier limit on the forecast route.
     * Increments usage on allowed requests and re-signs the token cookie.
     */
    async function requireFreeTier(req, res, next) {
        try {
            // 1. Premium bypass — subscribed users skip the free-tier counter.
            if (req.stripeEntitlement && req.stripeEntitlement.isPremium) {
                return next();
            }

            const ipHash = hashIp(req);
            const deviceHash = hashDevice(req, sessionAuth);

            // 2. Token path: verify the signed token from cookie/header.
            const rawToken = tokenService.extractTokenFromRequest(req);
            const tokenPayload = rawToken ? tokenService.verifyToken(rawToken) : null;

            if (tokenPayload) {
                // Valid token present — use its count as authoritative.
                if (tokenPayload.count >= FREE_TIER_LIMIT) {
                    return denyLimitReached(res);
                }
                const newCount = tokenPayload.count + 1;
                // Sync DB so the fallback record stays current.
                await incrementDbUsage(db, ipHash, deviceHash, tokenPayload.count);
                const newToken = issueToken(newCount, ipHash, deviceHash);
                setFreeTierCookie(res, newToken);
                req.freeTier = {
                    used: newCount,
                    limit: FREE_TIER_LIMIT,
                    remaining: Math.max(0, FREE_TIER_LIMIT - newCount)
                };
                return next();
            }

            // 3. DB fallback: no/invalid token — rely on ip_hash as the key.
            const dbCount = await getDbUsage(db, ipHash);
            if (dbCount >= FREE_TIER_LIMIT) {
                return denyLimitReached(res);
            }
            const newDbCount = await incrementDbUsage(db, ipHash, deviceHash, dbCount);
            const newToken = issueToken(newDbCount, ipHash, deviceHash);
            setFreeTierCookie(res, newToken);
            req.freeTier = {
                used: newDbCount,
                limit: FREE_TIER_LIMIT,
                remaining: Math.max(0, FREE_TIER_LIMIT - newDbCount)
            };
            return next();

        } catch (err) {
            console.error('free-tier-check: requireFreeTier error', err);
            // Fail closed on unexpected error — do not leak forecasts.
            return res.status(500).json({
                success: false,
                error: 'Free-tier verification failed'
            });
        }
    }

    /**
     * Read-only usage check for /api/usage. Does NOT increment the counter.
     * Reads the signed token count (authoritative) or DB ip_hash count.
     * If neither is available, returns 0 used (first visit).
     */
    async function checkFreeTierUsage(req, res, next) {
        try {
            if (req.stripeEntitlement && req.stripeEntitlement.isPremium) {
                req.freeTier = { used: 0, limit: FREE_TIER_LIMIT, remaining: Infinity };
                return next();
            }

            const ipHash = hashIp(req);
            const rawToken = tokenService.extractTokenFromRequest(req);
            const tokenPayload = rawToken ? tokenService.verifyToken(rawToken) : null;
            const used = tokenPayload
                ? tokenPayload.count
                : await getDbUsage(db, ipHash);

            req.freeTier = {
                used: Math.min(used, FREE_TIER_LIMIT),
                limit: FREE_TIER_LIMIT,
                remaining: Math.max(0, FREE_TIER_LIMIT - used)
            };
            next();
        } catch (err) {
            console.error('free-tier-check: checkFreeTierUsage error', err);
            req.freeTier = { used: 0, limit: FREE_TIER_LIMIT, remaining: FREE_TIER_LIMIT };
            next();
        }
    }

    return {
        requireFreeTier,
        checkFreeTierUsage,
        FREE_TIER_LIMIT,
        // Exported for testing only
        _hashIp: hashIp,
        _hashDevice: hashDevice,
        _issueToken: issueToken,
        _incrementDbUsage: incrementDbUsage,
        _getDbUsage: getDbUsage,
        _FREE_TIER_COOKIE_OPTS: FREE_TIER_COOKIE_OPTS
    };
}

module.exports = { createFreeTierMiddleware, FREE_TIER_LIMIT };
