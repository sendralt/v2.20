"use strict";

/**
 * Hardened Authentication Middleware
 * 
 * Replaces simple deviceId-based auth with cryptographically secure session management:
 * - Purchase token validation for subscribed users
 * - Play Integrity API validation for free tier
 * - Session-based usage tracking
 */

const FREE_TIER_LIMIT = 3;

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    path: '/'
};

function setDeviceCookie(res, cookieId) {
    if (cookieId) res.cookie('fishsmart_did', cookieId, COOKIE_OPTIONS);
}

/**
 * Create authentication middleware
 * @param {Object} sessionAuth - SessionAuthService instance
 * @param {Object} subscriptionService - Legacy subscription service (for migration)
 */
function createAuthMiddleware(sessionAuth, subscriptionService = null, options = {}) {
    let stripeEntitlementResolver = options.stripeEntitlementResolver || null;

    function setStripeEntitlementResolver(resolver) {
        stripeEntitlementResolver = typeof resolver === 'function' ? resolver : null;
    }

    async function resolveStripeEntitlement(sessionToken) {
        if (!stripeEntitlementResolver || !sessionToken) return null;
        try {
            return await stripeEntitlementResolver(sessionToken);
        } catch (error) {
            console.warn('Stripe entitlement check failed:', error.message);
            return null;
        }
    }

    /**
     * Extract session token from request headers
     */
    function extractSessionToken(req) {
        // Primary: X-Session-Token header (new hardened sessions)
        const sessionToken = req.headers['x-session-token'];
        if (sessionToken) {
            return { type: 'session', token: sessionToken };
        }

        // Legacy X-Device-ID fallback — DEPRECATED: restricted to non-production only
        // if (process.env.NODE_ENV !== 'production') {
        //     const deviceId = req.headers['x-device-id'];
        //     if (deviceId) {
        //         console.warn('[DEPRECATED] X-Device-ID auth used — remove before production');
        //         return { type: 'legacy_device', token: deviceId };
        //     }
        // }

        return null;
    }

    /**
     * Extract purchase token from request (for subscribed users)
     */
    function extractPurchaseToken(req) {
        return req.headers['x-purchase-token'] || req.body?.purchaseToken;
    }

    /**
     * Extract Play Integrity token from request (for free tier)
     */
    function extractIntegrityToken(req) {
        return req.headers['x-integrity-token'] || req.body?.integrityToken;
    }

    /**
     * Extract product ID from request
     */
    function extractProductId(req) {
        return req.headers['x-product-id'] || req.body?.productId;
    }

    /**
     * Main authentication middleware
     * Validates session and checks subscription/usage status
     */
    async function requireAuth(req, res, next) {
        try {
            const sessionInfo = extractSessionToken(req);

            // No session token provided - create new session
            if (!sessionInfo) {
                return await handleNewSession(req, res, next);
            }

            // Legacy device ID support (migration path)
            if (sessionInfo.type === 'legacy_device') {
                return await handleLegacyAuth(sessionInfo.token, req, res, next);
            }

            // Validate existing session
            const purchaseToken = extractPurchaseToken(req);
            const validation = await sessionAuth.validateSession(
                sessionInfo.token,
                purchaseToken,
                req
            );

            if (!validation.valid) {
                // Session invalid or expired - clear and create new
                if (validation.code === 'SESSION_EXPIRED' || validation.code === 'SUBSCRIPTION_EXPIRED') {
                    return res.status(401).json({
                        success: false,
                        error: validation.error,
                        code: validation.code,
                        requiresReauth: true
                    });
                }

                return res.status(401).json({
                    success: false,
                    error: validation.error || 'Invalid session',
                    code: 'INVALID_SESSION'
                });
            }

            // Session valid - attach to request
            req.session = validation.session;
            req.sessionId = sessionInfo.token;

            const stripeEntitlement = await resolveStripeEntitlement(sessionInfo.token);
            if (stripeEntitlement && stripeEntitlement.isPremium) {
                req.session = { ...validation.session, type: 'subscribed' };
                req.stripeEntitlement = stripeEntitlement;
                req.usageInfo = {
                    allowed: true,
                    usageCount: validation.session.usageCount || 0,
                    remaining: Infinity,
                    limit: FREE_TIER_LIMIT,
                    isSubscribed: true
                };
                return next();
            }

            // Check usage limits for free tier
            if (validation.session.type === 'free') {
                // Only increment usage for actual generation, NOT for usage checks
                const isUsageCheck = req.path === '/api/usage' || req.path === '/api/auth/validate' || req.path.startsWith('/api/history');
                
                let usage;
                if (isUsageCheck) {
                    usage = {
                        usageCount: validation.session.usageCount || 0,
                        limit: FREE_TIER_LIMIT,
                        remaining: Math.max(0, FREE_TIER_LIMIT - (validation.session.usageCount || 0)),
                        allowed: (validation.session.usageCount || 0) < FREE_TIER_LIMIT
                    };
                } else {
                    usage = sessionAuth.incrementUsage(sessionInfo.token, FREE_TIER_LIMIT);
                }
                
                if (!usage.allowed && !isUsageCheck) {
                    return res.status(403).json({
                        success: false,
                        error: 'Free tier limit reached. Please subscribe to continue.',
                        code: 'SUBSCRIPTION_REQUIRED',
                        usage: {
                            used: usage.usageCount,
                            limit: FREE_TIER_LIMIT,
                            remaining: 0
                        }
                    });
                }

                req.usageInfo = usage;
            }

            next();

        } catch (error) {
            console.error('Auth middleware error:', error);
            res.status(500).json({
                success: false,
                error: 'Authentication error'
            });
        }
    }

    /**
     * Handle new session creation
     */
    async function handleNewSession(req, res, next) {
        const purchaseToken = extractPurchaseToken(req);
        const productId = extractProductId(req);
        const integrityToken = extractIntegrityToken(req);

        // If purchase token provided, create subscribed session
        if (purchaseToken && productId) {
            const result = await sessionAuth.createSession(productId, purchaseToken, req);
            
            if (!result.success) {
                return res.status(401).json({
                    success: false,
                    error: result.error,
                    code: 'INVALID_PURCHASE_TOKEN'
                });
            }

            // Return session token to client
            req.session = { type: 'subscribed' };
            req.sessionId = result.sessionId;
            req.newSession = result;
            
            return next();
        }

        // Check if old session token has a Stripe entitlement (survives server restart)
        const oldToken = req.headers['x-session-token'];
        if (oldToken) {
            const stripeEntitlement = await resolveStripeEntitlement(oldToken);
            if (stripeEntitlement && stripeEntitlement.isPremium) {
                // Restore subscribed status with a new session
                const result = await sessionAuth.createFreeSession(integrityToken, req);
                if (result.success) {
                    req.session = { type: 'subscribed' };
                    req.sessionId = result.sessionId;
                    req.stripeEntitlement = stripeEntitlement;
                    req.usageInfo = {
                        allowed: true,
                        usageCount: 0,
                        remaining: Infinity,
                        limit: FREE_TIER_LIMIT,
                        isSubscribed: true
                    };
                    req.newSession = result;
                    return next();
                }
            }
        }

        // Otherwise, create free session with Play Integrity check
        const result = await sessionAuth.createFreeSession(integrityToken, req);
        
        if (!result.success) {
            return res.status(401).json({
                success: false,
                error: result.error,
                code: result.code || 'INTEGRITY_CHECK_FAILED',
                integrity: result.integrity
            });
        }

        // Set HttpOnly device tracking cookie
        // Initialize usage info for new session
        const isUsageCheck = req.path === '/api/usage' || req.path === '/api/auth/validate' || req.path.startsWith('/api/history');
        let usage;

        if (isUsageCheck) {
            usage = {
                usageCount: 0,
                limit: FREE_TIER_LIMIT,
                remaining: FREE_TIER_LIMIT,
                allowed: true
            };
        } else {
            // Increment for actual work
            usage = sessionAuth.incrementUsage(result.sessionId, FREE_TIER_LIMIT);
        }

        req.session = { type: 'free', usageCount: usage.usageCount };
        req.sessionId = result.sessionId;
        req.usageInfo = usage;
        req.newSession = result;

        next();
    }

    /**
     * Handle legacy device ID authentication
     */
    // Legacy device ID authentication — DEPRECATED and disabled
    // This code path is intentionally no-op to prevent unauthenticated access
    async function handleLegacyAuth(deviceId, req, res, next) {
        console.warn('[DEPRECATED] Legacy device ID auth attempted — blocked');
        return res.status(401).json({
            success: false,
            error: 'Legacy authentication has been removed.',
            code: 'LEGACY_AUTH_REMOVED'
        });
    }

    /**
     * Middleware to require subscription (no free tier)
     */
    async function requireSubscription(req, res, next) {
        await requireAuth(req, res, async () => {
            if (req.legacyAuth) {
                const stats = subscriptionService.getUsageStats(req.deviceId);
                if (!stats.isSubscribed) {
                    return res.status(403).json({
                        success: false,
                        error: 'Subscription required',
                        code: 'SUBSCRIPTION_REQUIRED'
                    });
                }
                return next();
            }

            if (req.session.type !== 'subscribed') {
                return res.status(403).json({
                    success: false,
                    error: 'Subscription required',
                    code: 'SUBSCRIPTION_REQUIRED'
                });
            }

            next();
        });
    }

    /**
     * Session creation endpoint handler
     */
    async function createSessionEndpoint(req, res) {
        try {
            const { productId, purchaseToken, integrityToken } = req.body;

            if (purchaseToken && productId) {
                const result = await sessionAuth.createSession(productId, purchaseToken, req);
                if (!result.success) return res.status(401).json(result);

                return res.json({
                    success: true,
                    sessionId: result.sessionId,
                    expiresAt: result.expiresAt,
                    type: 'subscribed',
                    subscription: result.subscription
                });
            }

            const result = await sessionAuth.createFreeSession(integrityToken, req);
            if (!result.success) return res.status(401).json(result);

            // Set HttpOnly device tracking cookie
            setDeviceCookie(res, result.cookieId);

            res.json({
                success: true,
                sessionId: result.sessionId,
                expiresAt: result.expiresAt,
                type: 'free',
                usage: {
                    limit: FREE_TIER_LIMIT,
                    used: 0,
                    remaining: FREE_TIER_LIMIT
                }
            });
        } catch (error) {
            console.error('Session creation error:', error);
            res.status(500).json({ success: false, error: 'Failed to create session' });
        }
    }

    async function validateSessionEndpoint(req, res) {
        const sessionToken = req.headers['x-session-token'];
        if (!sessionToken) return res.status(400).json({ success: false, error: 'Session token required' });

        const validation = await sessionAuth.validateSession(sessionToken, null, req);
        if (!validation.valid) return res.status(401).json(validation);

        res.json({ success: true, session: validation.session });
    }

    async function logoutEndpoint(req, res) {
        const sessionToken = req.headers['x-session-token'];
        if (sessionToken) sessionAuth.invalidateSession(sessionToken);
        res.json({ success: true, message: 'Logged out' });
    }

    return {
        requireAuth,
        requireSubscription,
        createSessionEndpoint,
        validateSessionEndpoint,
        logoutEndpoint,
        setStripeEntitlementResolver,
        FREE_TIER_LIMIT
    };
}

module.exports = { createAuthMiddleware, FREE_TIER_LIMIT };
