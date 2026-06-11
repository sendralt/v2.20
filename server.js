"use strict";

console.log('\ud83d\ude80 Server initialization started...');

// Patch: prevent gzip responses from ALL external APIs on Render (Node.js fetch
// doesn't auto-decompress, causing JSON parse failures with garbled bytes)
const _originalFetch = globalThis.fetch;
globalThis.fetch = function(url, init = {}) {
    const u = typeof url === 'string' ? url : url instanceof URL ? url.href : String(url);
    if (u.startsWith('https://')) {
        init.headers = { ...(init.headers || {}), 'Accept-Encoding': 'identity' };
    }
    return _originalFetch(url, init);
};

const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const helmet = require('helmet');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// --- Stripe Billing (lazy init - requires DATABASE_URL + STRIPE_SECRET_KEY) ---
let db = null;
let stripeService = null;
let billingRoutes = null;
let webhookRoutes = null;

// --- Security Middleware ---
const { strictCSP, cspReportHandler } = require('./src/middleware/csp');
const { sanitizeRequest, validateUris } = require('./src/middleware/sanitization');

// --- Configuration ---
const config = require('./src/config/env');

// --- Express App ---
const app = express();
app.set('trust proxy', 1); // Required for express-rate-limit behind proxies (Render, etc.)

// Apply strict CSP middleware BEFORE helmet to override its CSP
app.use(strictCSP());

// Apply Helmet for other security headers (CSP disabled, we handle it above)
app.use(helmet({
    contentSecurityPolicy: false, // We use our custom strict CSP
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    xFrameOptions: { action: 'deny' },
    xContentTypeOptions: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false, // Allow embedding from CDNs
}));

app.disable('x-powered-by');

// Parse cookies (needed for HttpOnly device tracking)
app.use(cookieParser());

// --- Body Parsing with Size Limits ---

// Skip JSON parsing for webhook routes — express.raw() needs the raw buffer
app.use((req, res, next) => {
    if (req.path.startsWith('/api/webhooks')) return next();
    express.json({ limit: '100kb' })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// --- Security: Input Sanitization & URI Validation ---
app.use(sanitizeRequest());
app.use(validateUris());

// --- CSP Violation Reporting Endpoint ---
app.post('/api/csp-report', express.json({ type: 'application/csp-report' }), cspReportHandler());

// --- Static Files ---
app.use(express.static('public', { dotfiles: 'allow' }));

// --- Load Data ---
const { loadAllData } = require('./src/data/loader');
const { fishingData, lureData, fishPatterns } = loadAllData(__dirname);

// --- Initialize Gemini AI ---
let genAI = null;
try {
    if (config.geminiApiKey) {
        genAI = new GoogleGenerativeAI(config.geminiApiKey);
        console.log('\u2713 Gemini AI initialized successfully');
    } else {
        console.warn('\u26a0 GEMINI_API_KEY not found - AI features will be limited');
    }
} catch (error) {
    console.error('\u2717 Failed to initialize Gemini AI:', error.message);
}

if (config.isDev) console.log(' Before wire up services...');

// --- Wire Up Services ---
if (config.isDev) console.log(' Loading weather service module...');
const { createWeatherService } = require('./src/services/weather');
if (config.isDev) console.log(' Creating weather service...');
const weatherService = createWeatherService({
    ipGeoApiKey: config.ipGeoApiKey,
    openWeatherApiKey: config.openWeatherApiKey,
    isDev: config.isDev
});
if (config.isDev) console.log(' Weather service created');

if (config.isDev) console.log(' Loading lure scorer module...');
const { createLureScorer } = require('./src/engine/lure-scorer');
if (config.isDev) console.log(' Creating lure scorer...');
const lureScorer = createLureScorer(lureData);
if (config.isDev) console.log(' Lure scorer created');

if (config.isDev) console.log(' Loading bite engine module...');
const { createBiteScoreEngine } = require('./src/engine/bite-score');
if (config.isDev) console.log(' Creating bite engine...');
const biteEngine = createBiteScoreEngine(fishingData, lureScorer);
if (config.isDev) console.log(' Bite engine created');

if (config.isDev) console.log(' Loading AI service module...');
const { createAIService } = require('./src/services/ai');
if (config.isDev) console.log(' Creating AI service...');
const aiService = createAIService({
    genAI, weatherService, biteEngine, fishPatterns, isDev: config.isDev
});
if (config.isDev) console.log(' AI service created');

if (config.isDev) console.log(' Loading subscription modules...');
const { createSubscriptionService } = require('./src/services/subscription');
if (config.isDev) console.log(' Subscription module loaded');
const { createGooglePlayBillingService } = require('./src/services/google-play-billing');
if (config.isDev) console.log(' GPB module loaded');
const { createSessionAuthService } = require('./src/services/session-auth');
if (config.isDev) console.log(' Session auth module loaded');
const { createAuthMiddleware } = require('./src/middleware/auth');
if (config.isDev) console.log(' Auth middleware module loaded');

if (config.isDev) console.log(' Creating Google Play Billing service...');

// Initialize Google Play Billing (optional - will work without it for development)
let googlePlayBilling = null;
try {
    googlePlayBilling = createGooglePlayBillingService();
    console.log('✓ Google Play Billing service initialized');
} catch (error) {
    console.warn('⚠ Google Play Billing not configured:', error.message);
    console.log('  Set GOOGLE_PLAY_SERVICE_ACCOUNT_KEY env var to enable');
}

// Initialize Subscription Service with Google Play Billing
const subscriptionService = createSubscriptionService(googlePlayBilling);
// Initialize Database (needed for session auth free tier enforcement)
try {
    const { createDbPool } = require('./src/services/db');
    db = createDbPool();
} catch (error) {
    console.warn('⚠ Database not available:', error.message);
}

// Initialize Hardened Session Authentication Service
const sessionAuth = createSessionAuthService(googlePlayBilling, null, db);
console.log('✓ Hardened Session Authentication initialized');

// Initialize Authentication Middleware
if (config.isDev) console.log(' Creating auth middleware...');
const authMiddleware = createAuthMiddleware(sessionAuth, subscriptionService);
if (config.isDev) console.log(' Auth middleware created');
// --- Stripe Billing Initialization ---
try {
    if (!db) {
        const { createDbPool } = require('./src/services/db');
        db = createDbPool();
    }
    const { createStripeService } = require('./src/services/stripe');
    stripeService = createStripeService({ db });
    const { createEntitlementService } = require('./src/services/entitlement-service');
    const entitlementService = createEntitlementService({ db });
    const { createWebhookHandler } = require('./src/services/stripe-webhook-handler');
    const webhookHandler = createWebhookHandler({ stripe: stripeService.stripe, db, computeAndSaveEntitlement: entitlementService.computeAndSaveEntitlement });
    const { createBillingRoutes } = require('./src/routes/billing');
    const { createBillingAuthMiddleware } = require('./src/middleware/billing-auth');
    const billingAuth = createBillingAuthMiddleware({ db });
    authMiddleware.setStripeEntitlementResolver(async (sessionToken) => {
        const sessionTokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
        const { rows } = await db.query(
            'SELECT account_id FROM billing_sessions WHERE session_token_hash = $1',
            [sessionTokenHash]
        );
        if (rows.length === 0) return null;
        return entitlementService.computeAndSaveEntitlement(rows[0].account_id);
    });
    billingRoutes = createBillingRoutes({ stripeService, db, getOrCreateCustomer: stripeService.getOrCreateCustomer, computeAndSaveEntitlement: entitlementService.computeAndSaveEntitlement, billingAuth });
    const { createWebhookRoutes } = require('./src/routes/webhooks');
    webhookRoutes = createWebhookRoutes({ stripe: stripeService.stripe, db, processStripeEvent: webhookHandler.processStripeEvent });
    app.use('/api/webhooks', webhookRoutes);
    console.log('\u2713 Stripe webhook route registered');
    console.log('\u2713 Stripe billing service initialized');
} catch (error) {
    console.warn('\u26a0 Stripe billing not configured:', error.message);
    console.log('  Set DATABASE_URL and STRIPE_SECRET_KEY env vars to enable');
}


// --- Register Routes ---
if (config.isDev) console.log(' Loading routes...');
const { registerRoutes } = require('./src/routes/api');
if (billingRoutes) {
    app.use('/api/stripe', billingRoutes);
    app.use('/api/billing', billingRoutes);
    console.log('\u2713 Stripe billing routes registered');
}
if (config.isDev) console.log(' Registering routes...');
registerRoutes(app, aiService, config, fishingData, subscriptionService, googlePlayBilling, weatherService, sessionAuth, authMiddleware, db);
if (config.isDev) console.log(' Routes registered');


// --- Start Server ---
let server = null;

function logServerStart(port) {
    console.log('\n\ud83c\udfa3 FishSmart Pro - Advanced Fishing Intelligence Platform');
    console.log(`\ud83c\udf10 Server running at http://localhost:${port}`);
    console.log(`\ud83e\udd16 AI Service: ${genAI ? '\u2713 Online' : '\u2717 Offline'}`);
    console.log(`\ud83c\udf24\ufe0f  Weather Service: ${config.openWeatherApiKey ? '\u2713 Online' : '\u2717 Offline'}`);
    console.log('\nPress Ctrl+C to stop\n');
}

function startServer(port, remaining = config.maxPortFallback) {
    console.log(`Debug: Starting server on port ${port}...`);
    server = app.listen(port, '0.0.0.0', () => logServerStart(port));
    server.timeout = 120000; // 2 minutes — allow AI generation calls to complete
    server.headersTimeout = 10000;
    if (config.isDev) console.log(' called');
    server.once('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            if (config.hasExplicitPort || config.nodeEnv === 'production' || remaining <= 0) {
                console.error(`\u2717 Port ${port} is already in use.`);
                process.exit(1);
            }
            console.warn(`\u26a0 Port ${port} in use. Trying port ${port + 1}...`);
            startServer(port + 1, remaining - 1);
            return;
        }
        console.error('\u2717 Failed to start server:', error);
        process.exit(1);
    });
}


// --- Graceful Shutdown ---
function shutdown(signal) {
    console.log(`\n${signal} received — shutting down gracefully`);
    if (!server) {
        if (db) db.end().then(() => console.log('DB pool closed')).catch(() => {});
        process.exit(0);
    }

    server.close(() => {
        console.log('HTTP server closed');
        if (db) db.end().then(() => console.log('DB pool closed')).catch(() => {});
        process.exit(0);
    });
    setTimeout(() => { console.error('Forced exit after timeout'); process.exit(1); }, 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
startServer(config.port);
