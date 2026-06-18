"use strict";

/**
 * Hardened Session Authentication Service
 * 
 * Implements secure session management for TWA using:
 * 1. Server-side Google Play token validation
 * 2. Purchase token as cryptographically secure session key
 * 3. Play Integrity API for free tier hardening
 * 4. Stateless verification with caching
 */

const crypto = require('crypto');

// Configuration
const SESSION_CONFIG = {
    // Cache TTL for verification results (milliseconds)
    verificationCacheTtl: parseInt(process.env.VERIFICATION_CACHE_TTL) || 5 * 60 * 1000, // 5 minutes
    
    // Session token expiration for subscribed users
    sessionTokenExpiry: parseInt(process.env.SESSION_TOKEN_EXPIRY) || 24 * 60 * 60 * 1000, // 24 hours
    
    // Play Integrity API settings
    playIntegrityEnabled: process.env.PLAY_INTEGRITY_ENABLED === 'true',
    playIntegrityProjectNumber: process.env.PLAY_INTEGRITY_PROJECT_NUMBER,
    
    // Free tier: device hash rotation prevention
    deviceBindingEnabled: true,
    
    // Maximum failed verification attempts before lockout
    maxFailedAttempts: 5,
    lockoutDurationMs: 15 * 60 * 1000, // 15 minutes
};

/**
 * Create Hardened Session Authentication Service
 * @param {Object} googlePlayBilling - Google Play Billing service instance
 * @param {Object} cache - Optional external cache (Redis). Falls back to in-memory.
 */
function createSessionAuthService(googlePlayBilling, cache = null, db = null) {
    
    if (db) console.log('✓ Session auth: DB-backed free tier enforcement enabled');
    
    // In-memory caches (use Redis in production for distributed systems)
    const verificationCache = new Map();
    const sessionStore = new Map();
    const failedAttempts = new Map();
    const integrityTokenCache = new Map();

    /**
     * Generate cryptographically secure session ID
     */
    function generateSessionId() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Hash a token for storage/comparison (prevents token leakage in logs/memory)
     */
    function hashToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    /**
     * Create device fingerprint from request metadata
     * Used to bind sessions to device characteristics
     */
    function createDeviceFingerprint(req) {
        const components = [
            req.headers['user-agent'] || '',
            req.headers['accept-language'] || '',
            req.headers['x-forwarded-for'] || req.ip || ''
        ];
        return crypto.createHash('sha256')
            .update(components.join('|'))
            .digest('hex');
    }

    /**
     * Check if IP/device is locked out due to failed attempts
     */
    function isLockedOut(clientId) {
        const record = failedAttempts.get(clientId);
        if (!record) return false;
        
        if (record.count >= SESSION_CONFIG.maxFailedAttempts) {
            if (Date.now() - record.lastAttempt < SESSION_CONFIG.lockoutDurationMs) {
                return true;
            }
            // Lockout expired, reset counter
            failedAttempts.delete(clientId);
        }
        return false;
    }

    /**
     * Record a failed verification attempt
     */
    function recordFailedAttempt(clientId) {
        const record = failedAttempts.get(clientId) || { count: 0, lastAttempt: 0 };
        record.count += 1;
        record.lastAttempt = Date.now();
        failedAttempts.set(clientId, record);
    }

    /**
     * Clear failed attempts on successful verification
     */
    function clearFailedAttempts(clientId) {
        failedAttempts.delete(clientId);
    }

    /**
     * Verify purchase token with Google Play and cache result
     * This is the core security mechanism - server-side validation
     */
    async function verifyPurchaseToken(productId, purchaseToken) {
        if (!googlePlayBilling) {
            return { valid: false, error: 'Google Play Billing not configured' };
        }

        const cacheKey = `gp:${hashToken(purchaseToken)}`;
        
        // Check cache first
        const cached = verificationCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < SESSION_CONFIG.verificationCacheTtl) {
            return { ...cached.result, cached: true };
        }

        // Verify with Google Play Developer API
        const result = await googlePlayBilling.verifySubscription(productId, purchaseToken);
        
        if (result.valid) {
            // Cache successful verification
            verificationCache.set(cacheKey, {
                result,
                timestamp: Date.now()
            });
        }

        return { ...result, cached: false };
    }

    /**
     * Validate Play Integrity token (for free tier hardening)
     * Requires Play Integrity API to be configured
     */
    async function validatePlayIntegrity(integrityToken, requestHash) {
        if (!SESSION_CONFIG.playIntegrityEnabled || !SESSION_CONFIG.playIntegrityProjectNumber) {
            // Play Integrity not configured - skip but log
            return { 
                valid: true, 
                bypassed: true,
                message: 'Play Integrity not configured - running in development mode'
            };
        }

        // Check cache for this integrity token
        const cacheKey = `pi:${hashToken(integrityToken)}`;
        const cached = integrityTokenCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 60000) { // 1 minute cache for integrity tokens
            return cached.result;
        }

        try {
            // Call Google Play Integrity API
            // Note: This requires the Google Play Integrity API client library
            const { google } = require('googleapis');
            
            const auth = new google.auth.GoogleAuth({
                keyFile: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY,
                scopes: ['https://www.googleapis.com/auth/playintegrity']
            });

            const playintegrity = google.playintegrity({
                version: 'v1',
                auth
            });

            const response = await playintegrity.v1.decodeIntegrityToken({
                packageName: process.env.ANDROID_PACKAGE_NAME || 'com.fishsmart.pro',
                requestBody: {
                    integrityToken: integrityToken
                }
            });

            const tokenPayload = response.data;
            
            // Validate token response
            const isValid = (
                tokenPayload.requestDetails?.requestPackageName === (process.env.ANDROID_PACKAGE_NAME || 'com.fishsmart.pro') &&
                tokenPayload.deviceIntegrity?.deviceRecognitionVerdict?.includes('MEETS_DEVICE_INTEGRITY') &&
                tokenPayload.appIntegrity?.appRecognitionVerdict === 'PLAY_RECOGNIZED' &&
                (!requestHash || tokenPayload.requestDetails?.requestHash === requestHash)
            );

            const result = {
                valid: isValid,
                deviceRecognition: tokenPayload.deviceIntegrity?.deviceRecognitionVerdict || [],
                appRecognition: tokenPayload.appIntegrity?.appRecognitionVerdict,
                accountDetails: tokenPayload.accountDetails?.appLicensingVerdict
            };

            // Cache the result briefly
            integrityTokenCache.set(cacheKey, {
                result,
                timestamp: Date.now()
            });

            return result;

        } catch (error) {
            console.error('Play Integrity validation failed:', error.message);
            return { valid: false, error: error.message };
        }
    }

    /**
     * Create a new session for a subscribed user
     * Uses purchase token as the cryptographically secure session identifier
     */
    async function createSession(productId, purchaseToken, req) {
        // Verify the purchase token with Google Play
        const verification = await verifyPurchaseToken(productId, purchaseToken);
        
        if (!verification.valid) {
            return { success: false, error: verification.error || 'Invalid subscription' };
        }

        // Create session with purchase token as the key
        const sessionId = generateSessionId();
        const deviceFingerprint = createDeviceFingerprint(req);
        
        const session = {
            sessionId,
            purchaseTokenHash: hashToken(purchaseToken),
            productId,
            deviceFingerprint,
            createdAt: Date.now(),
            expiresAt: Date.now() + SESSION_CONFIG.sessionTokenExpiry,
            subscriptionExpiry: verification.expiryTimeMillis,
            autoRenewing: verification.autoRenewing,
            orderId: verification.orderId,
            type: 'subscribed'
        };

        // Store session
        sessionStore.set(sessionId, session);

        // Clean up verification cache entry (session takes over)
        verificationCache.delete(`gp:${hashToken(purchaseToken)}`);

        return {
            success: true,
            sessionId,
            expiresAt: session.expiresAt,
            subscription: {
                productId,
                autoRenewing: verification.autoRenewing,
                expiryTimeMillis: verification.expiryTimeMillis
            }
        };
    }

    /**
     * Create a session for free tier user (with Play Integrity validation)
     */
    async function createFreeSession(integrityToken, req) {
        const clientId = req.ip || req.connection.remoteAddress;

        // Check for lockout
        if (isLockedOut(clientId)) {
            return { success: false, error: 'Too many failed attempts. Please try again later.' };
        }

        // Validate Play Integrity token if enabled
        let integrityResult = { valid: true };
        if (SESSION_CONFIG.playIntegrityEnabled) {
            integrityResult = await validatePlayIntegrity(integrityToken);
            
            if (!integrityResult.valid) {
                recordFailedAttempt(clientId);
                return { 
                    success: false, 
                    error: 'Device integrity check failed. Please use an official app version.',
                    integrity: integrityResult
                };
            }
        }

        clearFailedAttempts(clientId);

        // Read or generate persistent cookie-based device ID (HttpOnly — survives browser close)
        const cookieId = req.cookies && req.cookies['fishsmart_did']
            ? req.cookies['fishsmart_did']
            : crypto.randomBytes(16).toString('hex');

        const deviceFingerprint = createDeviceFingerprint(req);
        const ipAddress = clientId;

        // Check in-memory sessions for existing free session with same cookie
        for (const [, existing] of sessionStore.entries()) {
            if (existing.type === 'free' &&
                existing.cookieId === cookieId &&
                existing.expiresAt > Date.now()) {
                return {
                    success: true,
                    sessionId: existing.sessionId,
                    expiresAt: existing.expiresAt,
                    type: 'free',
                    cookieId,
                    integrityVerified: existing.integrityVerified
                };
            }
        }

        const sessionId = generateSessionId();
        const session = {
            sessionId,
            cookieId,
            deviceFingerprint,
            ipAddress,
            integrityTokenHash: integrityToken ? hashToken(integrityToken) : null,
            createdAt: Date.now(),
            expiresAt: Date.now() + SESSION_CONFIG.sessionTokenExpiry,
            type: 'free',
            usageCount: 0,
            integrityVerified: integrityResult.valid && !integrityResult.bypassed
        };

        sessionStore.set(sessionId, session);

        return {
            success: true,
            sessionId,
            expiresAt: session.expiresAt,
            type: 'free',
            cookieId,
            integrityVerified: session.integrityVerified
        };
    }

    /**
     * Create a session for a user with promo code subscription
     * This links subscriptionService promo activations to session auth
     */
    function createPromoSession(deviceId, subscriptionExpiresAt, promoCode, req) {
        const sessionId = generateSessionId();
        const deviceFingerprint = createDeviceFingerprint(req);
        
        const session = {
            sessionId,
            deviceFingerprint,
            deviceId,
            createdAt: Date.now(),
            expiresAt: Math.min(
                Date.now() + SESSION_CONFIG.sessionTokenExpiry,
                new Date(subscriptionExpiresAt).getTime()
            ),
            subscriptionExpiry: new Date(subscriptionExpiresAt).getTime(),
            type: 'subscribed',
            promoCode: promoCode,
            source: 'promo_code'
        };

        // Store session - THIS IS THE KEY FIX
        sessionStore.set(sessionId, session);

        return {
            success: true,
            sessionId,
            expiresAt: session.expiresAt,
            type: 'subscribed',
            subscription: {
                productId: 'promo',
                promoCode: promoCode,
                expiresAt: subscriptionExpiresAt
            }
        };
    }

    /**
     * Validate and refresh a session
     * Returns updated session info or error
     */
    async function validateSession(sessionId, purchaseToken = null, req = null) {
        const session = sessionStore.get(sessionId);
        
        if (!session) {
            return { valid: false, error: 'Session not found' };
        }

        // Check if session expired
        if (Date.now() > session.expiresAt) {
            sessionStore.delete(sessionId);
            return { valid: false, error: 'Session expired', code: 'SESSION_EXPIRED' };
        }

        // Validate device fingerprint if device binding is enabled
        if (SESSION_CONFIG.deviceBindingEnabled && req) {
            const currentFingerprint = createDeviceFingerprint(req);
            if (currentFingerprint !== session.deviceFingerprint) {
                // Fingerprint mismatch - possible token theft
                console.debug('Device fingerprint mismatch for session:', sessionId);
                // Don't immediately invalidate - could be legitimate UA change
                // But flag for review
            }
        }

        // For subscribed users, verify subscription is still active
        if (session.type === 'subscribed') {
            // Check if subscription expired
            const now = Date.now();
            if (now > session.subscriptionExpiry) {
                sessionStore.delete(sessionId);
                return { valid: false, error: 'Subscription expired', code: 'SUBSCRIPTION_EXPIRED' };
            }
        }

        // Refresh session expiry (extend session on activity)
        session.lastActivity = Date.now();
        sessionStore.set(sessionId, session);

        return {
            valid: true,
            session: {
                type: session.type,
                createdAt: session.createdAt,
                expiresAt: session.expiresAt,
                lastActivity: session.lastActivity,
                usageCount: session.usageCount,
                productId: session.productId,
                autoRenewing: session.autoRenewing
            }
        };
    }

    /**
     * Increment usage counter for free tier sessions
     */
    function incrementUsage(sessionId, limit) {
        const session = sessionStore.get(sessionId);
        
        if (!session || session.type !== 'free') {
            return { allowed: true, usageCount: 0 };
        }

        session.usageCount = (session.usageCount || 0) + 1;
        sessionStore.set(sessionId, session);

        // Persist EVERY increment to DB — cookie_id is authoritative key
        if (db && session.cookieId) {
            db.query(
                `INSERT INTO free_tier_usage (cookie_id, fingerprint_hash, ip_address, total_uses, last_used)
                 VALUES ($1, $2, $3, $4, now())
                 ON CONFLICT (cookie_id) DO UPDATE SET
                   fingerprint_hash = EXCLUDED.fingerprint_hash,
                   ip_address = EXCLUDED.ip_address,
                   total_uses = EXCLUDED.total_uses,
                   last_used = now()`,
                [session.cookieId, session.deviceFingerprint, session.ipAddress, session.usageCount]
            ).catch(err => console.error('DB free tier persist failed:', err.message));
        }

        const remaining = Math.max(0, limit - session.usageCount);
        
        return {
            allowed: session.usageCount <= limit,
            usageCount: session.usageCount,
            remaining,
            limit
        };
    }

    /**
     * Get session info without validation
     */
    function getSessionInfo(sessionId) {
        const session = sessionStore.get(sessionId);
        
        if (!session) return null;

        return {
            type: session.type,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            lastActivity: session.lastActivity,
            usageCount: session.usageCount,
            productId: session.productId,
            autoRenewing: session.autoRenewing
        };
    }

    /**
     * Invalidate a session (logout)
     */
    function invalidateSession(sessionId) {
        return sessionStore.delete(sessionId);
    }

    /**
     * Cleanup expired sessions and cache entries
     * Call periodically (e.g., via setInterval or cron)
     */
    function cleanup() {
        const now = Date.now();
        let cleanedSessions = 0;
        let cleanedCache = 0;

        // Clean expired sessions
        for (const [id, session] of sessionStore.entries()) {
            if (now > session.expiresAt) {
                sessionStore.delete(id);
                cleanedSessions++;
            }
        }

        // Clean expired verification cache
        for (const [key, entry] of verificationCache.entries()) {
            if (now - entry.timestamp > SESSION_CONFIG.verificationCacheTtl) {
                verificationCache.delete(key);
                cleanedCache++;
            }
        }

        // Clean expired integrity token cache
        for (const [key, entry] of integrityTokenCache.entries()) {
            if (now - entry.timestamp > 60000) {
                integrityTokenCache.delete(key);
                cleanedCache++;
            }
        }

        return { cleanedSessions, cleanedCache };
    }

    // Auto-cleanup every 10 minutes
    setInterval(cleanup, 10 * 60 * 1000);

    return {
        createSession,
        createFreeSession,
        createPromoSession,
        createDeviceFingerprint,
        validateSession,
        incrementUsage,
        getSessionInfo,
        invalidateSession,
        verifyPurchaseToken,
        validatePlayIntegrity,
        cleanup,
        SESSION_CONFIG
    };
}

module.exports = { createSessionAuthService, SESSION_CONFIG };
