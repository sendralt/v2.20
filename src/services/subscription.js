"use strict";

/**
 * Subscription Service - Manages usage tracking and subscription state
 * Free tier: 3 uses before paywall
 * Google Play Billing integration for subscriptions
 */

const crypto = require('crypto');

const FREE_TIER_LIMIT = 3;


// In-memory storage (use Redis/database in production)
const usageStore = new Map();
const subscriptionStore = new Map();

function createSubscriptionService(googlePlayBilling = null) {
    /**
     * Generate a unique device ID for anonymous users
     */
    function generateDeviceId() {
        return crypto.randomUUID();
    }

    /**
     * Get or create device usage record
     */
    function getUsage(deviceId) {
        if (!usageStore.has(deviceId)) {
            usageStore.set(deviceId, {
                deviceId,
                usageCount: 0,
                firstUseAt: new Date().toISOString(),
                lastUseAt: null,
                isSubscribed: false,
                subscriptionExpiresAt: null,
                googlePlayToken: null,
                subscriptionProductId: null
            });
        }
        return usageStore.get(deviceId);
    }

    /**
     * Check if user can make a request
     */
    function canUse(deviceId) {
        const usage = getUsage(deviceId);
        
        // Subscribed users have unlimited access
        if (usage.isSubscribed && usage.subscriptionExpiresAt) {
            const now = new Date();
            const expires = new Date(usage.subscriptionExpiresAt);
            if (now < expires) {
                return { allowed: true, remaining: Infinity, isSubscribed: true };
            }
            // Subscription expired
            usage.isSubscribed = false;
            usage.subscriptionExpiresAt = null;
        }

        // Free tier check
        const remaining = Math.max(0, FREE_TIER_LIMIT - usage.usageCount);
        return {
            allowed: remaining > 0,
            remaining,
            usageCount: usage.usageCount,
            isSubscribed: false
        };
    }

    /**
     * Increment usage counter
     */
    function incrementUsage(deviceId) {
        const usage = getUsage(deviceId);
        usage.usageCount += 1;
        usage.lastUseAt = new Date().toISOString();
        usageStore.set(deviceId, usage);
        return usage;
    }

    /**
     * Apply promo code for Google Play reviewers
     */
    function applyPromoCode(deviceId, code) {
        return { success: false, error: 'Promo codes are not available' };
    }

    /**
     * Activate subscription from Google Play purchase
     */
    async function activateSubscription(deviceId, productId, purchaseToken) {
        const usage = getUsage(deviceId);
        
        // If Google Play Billing is configured, verify the purchase
        if (googlePlayBilling) {
            const verification = await googlePlayBilling.verifySubscription(productId, purchaseToken);
            
            if (!verification.valid) {
                return { success: false, error: 'Invalid or expired subscription' };
            }
            
            // Acknowledge the purchase if not already acknowledged
            if (!verification.acknowledged) {
                await googlePlayBilling.acknowledgeSubscription(productId, purchaseToken);
            }
            
            usage.isSubscribed = true;
            usage.subscriptionExpiresAt = new Date(verification.expiryTimeMillis).toISOString();
            usage.googlePlayToken = purchaseToken;
            usage.subscriptionProductId = productId;
            
            subscriptionStore.set(deviceId, {
                deviceId,
                productId,
                purchaseToken,
                activatedAt: new Date().toISOString(),
                expiresAt: usage.subscriptionExpiresAt,
                autoRenewing: verification.autoRenewing,
                orderId: verification.orderId
            });
        } else {
            // Fallback: mock subscription for development
            const expires = new Date();
            expires.setDate(expires.getDate() + 30);
            
            usage.isSubscribed = true;
            usage.subscriptionExpiresAt = expires.toISOString();
            usage.googlePlayToken = purchaseToken;
            usage.subscriptionProductId = productId;
            
            subscriptionStore.set(deviceId, {
                deviceId,
                productId,
                purchaseToken,
                activatedAt: new Date().toISOString(),
                expiresAt: usage.subscriptionExpiresAt,
                autoRenewing: true
            });
        }
        
        usageStore.set(deviceId, usage);
        return { success: true, data: usage };
    }

    /**
     * Verify and restore subscription from Google Play
     */
    async function restoreSubscription(deviceId, purchaseToken, productId = null) {
        const usage = getUsage(deviceId);
        
        // If we have a stored subscription, verify it's still valid
        if (usage.googlePlayToken && googlePlayBilling) {
            const verification = await googlePlayBilling.verifySubscription(
                usage.subscriptionProductId, 
                usage.googlePlayToken
            );
            
            if (verification.valid) {
                usage.isSubscribed = true;
                usage.subscriptionExpiresAt = new Date(verification.expiryTimeMillis).toISOString();
                usageStore.set(deviceId, usage);
                return { success: true, data: usage, source: 'verified' };
            } else {
                // Subscription expired or invalid
                usage.isSubscribed = false;
                usage.subscriptionExpiresAt = null;
                usageStore.set(deviceId, usage);
                return { success: false, error: 'Subscription expired', data: usage };
            }
        }
        
        // If productId and purchaseToken provided, try to verify
        if (productId && purchaseToken && googlePlayBilling) {
            return await activateSubscription(deviceId, productId, purchaseToken);
        }
        
        return { success: false, data: usage };
    }

    /**
     * Get usage stats for a device
     */
    function getUsageStats(deviceId) {
        const usage = getUsage(deviceId);
        const check = canUse(deviceId);
        
        return {
            ...usage,
            ...check,
            freeTierLimit: FREE_TIER_LIMIT
        };
    }

    /**
     * Sync subscription status with Google Play
     * Call this periodically or on app start
     */
    async function syncWithGooglePlay(deviceId) {
        const usage = getUsage(deviceId);
        
        if (!usage.googlePlayToken || !googlePlayBilling) {
            return { synced: false, reason: 'no_token_or_billing' };
        }
        
        const verification = await googlePlayBilling.verifySubscription(
            usage.subscriptionProductId,
            usage.googlePlayToken
        );
        
        if (verification.valid) {
            usage.isSubscribed = true;
            usage.subscriptionExpiresAt = new Date(verification.expiryTimeMillis).toISOString();
        } else {
            usage.isSubscribed = false;
            usage.subscriptionExpiresAt = null;
        }
        
        usageStore.set(deviceId, usage);
        return { synced: true, isSubscribed: usage.isSubscribed, data: usage };
    }

    return {
        generateDeviceId,
        canUse,
        incrementUsage,
        applyPromoCode,
        activateSubscription,
        getUsageStats,
        restoreSubscription,
        syncWithGooglePlay,
        FREE_TIER_LIMIT
    };
}

module.exports = { createSubscriptionService, FREE_TIER_LIMIT };
