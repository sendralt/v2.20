"use strict";

require('dotenv').config();

module.exports = {
    port: Number.parseInt(process.env.PORT, 10) || 3000,
    hasExplicitPort: Boolean(process.env.PORT),
    maxPortFallback: 10,
    geminiApiKey: process.env.GEMINI_API_KEY || null,
    openWeatherApiKey: process.env.OPENWEATHER_API_KEY || null,
    ipGeoApiKey: process.env.IPGEOLOCATION_API_KEY || null,
    nodeEnv: process.env.NODE_ENV || 'production',
    isDev: process.env.NODE_ENV === 'development',
    // Rate limiting (env overrides for deployment flexibility)
    rateLimit: {
        windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 min
        max: Number.parseInt(process.env.RATE_LIMIT_MAX, 10) || 10,                        // 10 requests per window
        standardHeaders: true,   // Return rate limit info in RateLimit-* headers
        legacyHeaders: false     // Disable X-RateLimit-* headers
    },
    // Stripe Billing (optional - requires DATABASE_URL + STRIPE_SECRET_KEY)
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || null,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || null,
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
    stripePriceMonthly: process.env.STRIPE_PRICE_MONTHLY || null,
    stripePriceYearly: process.env.STRIPE_PRICE_YEARLY || null,
    stripePortalConfigId: process.env.STRIPE_PORTAL_CONFIG_ID || null,
    databaseUrl: process.env.DATABASE_URL || null,
    appUrl: process.env.APP_URL || 'http://localhost:3000'
};
