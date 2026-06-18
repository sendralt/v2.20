"use strict";

const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { getTokenUsageReport } = require('../services/ai');
const forecastHistory = require('../services/forecast-history');

function registerRoutes(app, aiService, config, fishingData, subscriptionService, googlePlayBilling = null, weatherService = null, sessionAuth = null, authMiddleware = null, db = null) {

    // Promo code rate limiter — prevent brute-force guessing
    const promoLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 5,
        message: { success: false, error: 'Too many promo attempts. Try again later.' }
    });

    // Derive allowed species from fishingData.json — single source of truth.
    const ALLOWED_SPECIES = fishingData?.species_data
        ? fishingData.species_data.map(s => s.name)
        : ['Largemouth Bass'];

    const ALLOWED_CLARITY = ['Muddy', 'Stained', 'Clear', 'Gin Clear'];

    const MAX_INPUT = 200;

    // Allowlist of valid Gemini model names
    const ALLOWED_ENGINES = [
        'gemini-2.0-flash',
        'gemini-2.5-flash-preview-05-20',
        'gemini-3-flash-preview'
    ];

    // Whitelist-based sanitizer: strip everything except safe characters
    function sanitizeInput(str, maxLen) {
        if (typeof str !== 'string') return '';
        return str.replace(/[^\w\s,.\-:;/()&@+]/g, '').trim().slice(0, maxLen);
    }

    // Rate limiter for AI generation endpoint
    const generateLimiter = rateLimit({
        windowMs: config.rateLimit.windowMs,
        max: config.rateLimit.max,
        standardHeaders: config.rateLimit.standardHeaders,
        legacyHeaders: config.rateLimit.legacyHeaders,
        message: {
            success: false,
            error: 'Too many requests. Please try again later.'
        }
    });

    // Legacy subscription middleware
    function checkSubscriptionLegacy(req, res, next) {
        const deviceId = req.headers['x-device-id'] || req.body.deviceId;
        
        if (!deviceId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Device ID required',
                code: 'DEVICE_ID_MISSING'
            });
        }

        const check = subscriptionService.canUse(deviceId);
        
        if (!check.allowed) {
            return res.status(403).json({
                success: false,
                error: 'Free tier limit reached. Please subscribe to continue.',
                code: 'SUBSCRIPTION_REQUIRED',
                usage: {
                    used: check.usageCount,
                    limit: subscriptionService.FREE_TIER_LIMIT,
                    remaining: 0
                }
            });
        }

        req.usageInfo = check;
        req.deviceId = deviceId;
        next();
    }

    const checkSubscription = authMiddleware ? authMiddleware.requireAuth : checkSubscriptionLegacy;

    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
    });

    app.get('/beta-signup', (req, res) => {
        res.sendFile(path.join(__dirname, '..', '..', 'public', 'beta-signup.html'));
    });

    app.get('/health', (req, res) => {
        const checks = {
            db: !!db,
            ai: !!config.geminiApiKey,
            weather: !!config.openWeatherApiKey,
            sessionAuth: !!sessionAuth,
            googlePlayBilling: !!googlePlayBilling
        };
        const healthy = checks.db && checks.ai && checks.weather && checks.sessionAuth;
        res.status(healthy ? 200 : 503).json({
            status: healthy ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
            services: checks
        });
    });

    if (authMiddleware) {
        app.post('/api/auth/session', express.json(), authMiddleware.createSessionEndpoint);
        app.get('/api/auth/validate', authMiddleware.validateSessionEndpoint);
        app.post('/api/auth/logout', express.json(), authMiddleware.logoutEndpoint);
    }

    app.get('/api/weather', async (req, res) => {
        const location = req.query.location;
        if (!location) return res.status(400).json({ success: false, error: 'Location parameter required' });
        if (!weatherService) return res.status(503).json({ success: false, error: 'Weather service not configured' });
        
        try {
            const sanitizedLocation = sanitizeInput(location, MAX_INPUT);
            const weatherData = await weatherService.getWeatherData(sanitizedLocation);
            if (!weatherData) return res.status(404).json({ success: false, error: 'Weather data not found' });
            res.json({ success: true, data: weatherData });
        } catch (error) {
            console.error('Weather endpoint error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch weather data' });
        }
    });

    // Usage stats endpoint - FIXED to support new sessions and 'remaining' field
    app.get('/api/usage', checkSubscription, async (req, res) => {
        const sessionToken = req.headers['x-session-token'] || req.sessionId;
        const deviceId = req.headers['x-device-id'] || req.deviceId;
        
        if (sessionAuth && sessionToken) {
            const info = sessionAuth.getSessionInfo(sessionToken);
            if (info) {
                let subscriptionInfo = null;
                const targetDeviceId = deviceId || info.deviceId;

                if (req.stripeEntitlement && req.stripeEntitlement.isPremium) {
                    return res.json({
                        success: true,
                        data: {
                            ...info,
                            type: 'subscribed',
                            isSubscribed: true,
                            remaining: Infinity,
                            subscriptionExpiresAt: req.stripeEntitlement.expiresAt,
                            entitlementSource: req.stripeEntitlement.source,
                            freeTierLimit: authMiddleware ? authMiddleware.FREE_TIER_LIMIT : 3
                        }
                    });
                }

                if (targetDeviceId && subscriptionService) {
                    const usageStats = subscriptionService.getUsageStats(targetDeviceId);
                    if (usageStats.isSubscribed && usageStats.subscriptionExpiresAt) {
                        const now = new Date();
                        const expires = new Date(usageStats.subscriptionExpiresAt);
                        if (now < expires) {
                            subscriptionInfo = usageStats;
                        }
                    }
                }
                
                const responseData = subscriptionInfo ? {
                    ...info,
                    isSubscribed: true,
                    remaining: Infinity,
                    subscriptionExpiresAt: subscriptionInfo.subscriptionExpiresAt,
                    promoCode: subscriptionInfo.promoCode,
                    freeTierLimit: authMiddleware ? authMiddleware.FREE_TIER_LIMIT : 3
                } : {
                    ...info,
                    isSubscribed: info.type === 'subscribed',
                    remaining: Math.max(0, (authMiddleware ? authMiddleware.FREE_TIER_LIMIT : 3) - (info.usageCount || 0)),
                    freeTierLimit: authMiddleware ? authMiddleware.FREE_TIER_LIMIT : 3
                };
                
                const response = { success: true, data: responseData };
                if (req.newSession) {
                    response.sessionId = req.newSession.sessionId;
                    response.sessionExpiresAt = req.newSession.expiresAt;
                }
                return res.json(response);
            }
        }
        
        if (!deviceId) return res.status(400).json({ success: false, error: 'Device ID required' });
        const stats = subscriptionService.getUsageStats(deviceId);
        res.json({ success: true, data: stats });
    });

    app.post('/api/subscribe', express.json(), async (req, res) => {
        const { deviceId, purchaseToken, provider = 'google-play', productId } = req.body;
        if (!deviceId || !purchaseToken) return res.status(400).json({ success: false, error: 'Device ID and purchase token required' });
        if (provider === 'google-play' && productId) {
            if (!googlePlayBilling) return res.status(503).json({ success: false, error: 'Google Play Billing not configured' });
            const result = await subscriptionService.activateSubscription(deviceId, productId, purchaseToken);
            return res.json(result);
        }
        const result = await subscriptionService.restoreSubscription(deviceId, purchaseToken, provider);
        res.json({ success: true, data: result });
    });

    app.post('/api/google-play/verify', express.json(), async (req, res) => {
        if (!googlePlayBilling) return res.status(503).json({ success: false, error: 'Google Play Billing not configured' });
        const { productId, purchaseToken, deviceId } = req.body;
        if (!productId || !purchaseToken || !deviceId) return res.status(400).json({ success: false, error: 'Missing params' });
        try {
            const result = await subscriptionService.activateSubscription(deviceId, productId, purchaseToken);
            res.json(result);
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.get('/api/google-play/products', (req, res) => {
        const products = googlePlayBilling ? [
            { id: googlePlayBilling.GOOGLE_PLAY_CONFIG.subscriptionIds.monthly, name: 'Monthly', price: '$4.99', period: 'month' },
            { id: googlePlayBilling.GOOGLE_PLAY_CONFIG.subscriptionIds.yearly, name: 'Yearly', price: '$29.99', period: 'year', savings: '40%' }
        ] : [
            { id: 'fishsmart_pro_monthly', name: 'Monthly Subscription', price: '$4.99', period: 'month' },
            { id: 'fishsmart_pro_yearly', name: 'Yearly Subscription', price: '$29.99', period: 'year', savings: '40%' }
        ];
        res.json({ success: true, products });
    });

    app.post('/api/promo', promoLimiter, express.json(), async (req, res) => {
        const { code } = req.body;
        if (!code || !db || !sessionAuth) {
            return res.status(400).json({ success: false, error: 'Invalid request' });
        }

        const normalizedCode = code.trim().toUpperCase();
        const fingerprint = sessionAuth.createDeviceFingerprint(req);

        try {
            // 1. Validate promo code exists
            const { rows: codes } = await db.query(
                'SELECT * FROM promo_codes WHERE code = $1', [normalizedCode]
            );
            if (codes.length === 0) {
                return res.status(404).json({ success: false, error: 'Invalid promo code' });
            }
            const promo = codes[0];

            // 2. Check global redemption limit
            if (promo.max_redemptions && promo.times_redeemed >= promo.max_redemptions) {
                return res.status(410).json({ success: false, error: 'This promo code has been fully redeemed' });
            }

            // 3. Check per-device redemption (single-use per device)
            const { rows: redemptions } = await db.query(
                'SELECT 1 FROM promo_redemptions WHERE code = $1 AND fingerprint_hash = $2',
                [normalizedCode, fingerprint]
            );
            if (redemptions.length > 0) {
                return res.status(409).json({ success: false, error: 'You have already used this promo code' });
            }

            // 4. Calculate subscription expiry
            const subscriptionExpiry = promo.type === 'unlimited'
                ? new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString()
                : new Date(Date.now() + (promo.duration_days || 30) * 24 * 60 * 60 * 1000).toISOString();

            // 5. Create promo session
            const sessionResult = sessionAuth.createPromoSession(fingerprint, subscriptionExpiry, normalizedCode, req);
            if (!sessionResult.success) {
                return res.status(500).json({ success: false, error: 'Failed to create session' });
            }

            // 6. Record redemption
            await db.query(
                'INSERT INTO promo_redemptions (code, fingerprint_hash) VALUES ($1, $2)',
                [normalizedCode, fingerprint]
            );
            await db.query(
                'UPDATE promo_codes SET times_redeemed = times_redeemed + 1 WHERE code = $1',
                [normalizedCode]
            );

            res.json({
                success: true,
                sessionId: sessionResult.sessionId,
                expiresAt: sessionResult.expiresAt,
                subscription: sessionResult.subscription
            });
        } catch (error) {
            console.error('Promo redemption error:', error.message);
            res.status(500).json({ success: false, error: 'Internal error' });
        }
    });

    app.post('/api/generate', generateLimiter, checkSubscription, async (req, res) => {
        const { location, species, clarity, engine, isBoat, currentTime } = req.body;
        if (!location || typeof location !== 'string' || location.length > MAX_INPUT) return res.status(400).json({ success: false, error: 'Invalid location' });
        const sanitizedLocation = sanitizeInput(location, MAX_INPUT);
        try {
            const result = await aiService.generateFishingStrategy({ location: sanitizedLocation, species, clarity, engine, isBoat, currentTime });
            const response = { success: true, data: result };
            if (req.newSession) {
                response.sessionId = req.newSession.sessionId;
                response.sessionExpiresAt = req.newSession.expiresAt;
            }

            // Persist forecast history (fire-and-forget, don't block response)
            if (db && sessionAuth) {
                const fp = sessionAuth.createDeviceFingerprint(req);
                forecastHistory.saveForecast(db, fp, {
                    location: sanitizedLocation, species, clarity, isBoat, engine, model_used: result.model_used,
                    bite_probability: result.bite_probability, bite_rank: result.bite_rank, result
                }).catch(err => console.error('Forecast history save failed:', err.message));
            }

            res.json(response);
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // --- Forecast History Endpoints ---

    app.get('/api/history', checkSubscription, async (req, res) => {
        if (!db || !sessionAuth) return res.status(503).json({ success: false, error: 'History not available' });
        const fp = sessionAuth.createDeviceFingerprint(req);
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        try {
            const rows = await forecastHistory.getHistory(db, fp, { limit, offset });
            res.json({ success: true, data: rows });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.get('/api/history/export', checkSubscription, async (req, res) => {
        if (!db || !sessionAuth) return res.status(503).json({ success: false, error: 'History not available' });
        const fp = sessionAuth.createDeviceFingerprint(req);
        const format = (req.query.format || 'json').toLowerCase();
        try {
            const rows = await forecastHistory.getHistory(db, fp, { limit: 50, offset: 0 });
            // Fetch full results for export
            const full = [];
            for (const row of rows) {
                const detail = await forecastHistory.getForecast(db, fp, row.id);
                if (detail) full.push(detail);
            }
            if (format === 'csv') {
                const header = 'id,created_at,location,species,clarity,is_boat,bite_probability,bite_rank\n';
                const csv = header + full.map(r =>
                    `${r.id},${r.created_at.toISOString()},"${(r.location || '').replace(/"/g, '""')}","${(r.species || '').replace(/"/g, '""')}","${(r.clarity || '').replace(/"/g, '""')}",${r.is_boat},${r.bite_probability},"${(r.bite_rank || '').replace(/"/g, '""')}"`
                ).join('\n');
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', 'attachment; filename=fishsmart-forecasts.csv');
                return res.send(csv);
            }
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename=fishsmart-forecasts.json');
            res.json({ exported: full.length, generated_at: new Date().toISOString(), forecasts: full });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.get('/api/history/:id', checkSubscription, async (req, res) => {
        if (!db || !sessionAuth) return res.status(503).json({ success: false, error: 'History not available' });
        const fp = sessionAuth.createDeviceFingerprint(req);
        try {
            const id = parseInt(req.params.id);
            if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid forecast ID' });
            const row = await forecastHistory.getForecast(db, fp, id);
            if (!row) return res.status(404).json({ success: false, error: 'Forecast not found' });
            res.json({ success: true, data: row });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.delete('/api/history/:id', checkSubscription, async (req, res) => {
        if (!db || !sessionAuth) return res.status(503).json({ success: false, error: 'History not available' });
        const fp = sessionAuth.createDeviceFingerprint(req);
        try {
            const id = parseInt(req.params.id);
            if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid forecast ID' });
            const deleted = await forecastHistory.deleteForecast(db, fp, id);
            if (!deleted) return res.status(404).json({ success: false, error: 'Forecast not found' });
            res.json({ success: true, message: 'Deleted' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.delete('/api/history', checkSubscription, async (req, res) => {
        if (!db || !sessionAuth) return res.status(503).json({ success: false, error: 'History not available' });
        const fp = sessionAuth.createDeviceFingerprint(req);
        try {
            const count = await forecastHistory.clearHistory(db, fp);
            res.json({ success: true, message: `Cleared ${count} forecasts` });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.get('/api/tokens', authMiddleware.requireAuth, (req, res) => {
        const { start, end, limit } = req.query;
        try {
            const report = getTokenUsageReport({ startTime: start, endTime: end, limit: parseInt(limit) || 100 });
            res.json({ success: true, data: report });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Report failed' });
        }
    });

    app.use((req, res) => res.status(404).json({ success: false, error: 'Not found' }));
    app.use((err, req, res, next) => {
        console.error('Unhandled error:', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    });
}

module.exports = { registerRoutes };
