"use strict";

/**
 * Google Play Billing Service - Server-side verification
 * Uses Google Play Developer API to verify purchases
 */

const { google } = require('googleapis');

// Configuration
const GOOGLE_PLAY_CONFIG = {
    // Path to service account JSON key file
    // Download from Google Play Console > API Access > Service Accounts
    keyFile: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY || './config/google-play-service-account.json',
    
    // Android package name
    packageName: process.env.ANDROID_PACKAGE_NAME || 'com.fishsmart.pro',
    
    // Subscription product IDs defined in Google Play Console
    subscriptionIds: {
        monthly: process.env.SUBSCRIPTION_MONTHLY_ID || 'fishsmart_pro_monthly',
        yearly: process.env.SUBSCRIPTION_YEARLY_ID || 'fishsmart_pro_yearly'
    }
};

// Cache for Google Play API client
let playClient = null;

function createGooglePlayBillingService() {
    /**
     * Initialize Google Play Developer API client
     */
    async function getPlayClient() {
        if (playClient) return playClient;

        const auth = new google.auth.GoogleAuth({
            keyFile: GOOGLE_PLAY_CONFIG.keyFile,
            scopes: ['https://www.googleapis.com/auth/androidpublisher']
        });

        const client = google.androidpublisher({
            version: 'v3',
            auth
        });

        playClient = client;
        return client;
    }

    /**
     * Verify a subscription purchase with Google Play
     * @param {string} productId - Subscription product ID
     * @param {string} purchaseToken - Purchase token from Google Play
     */
    async function verifySubscription(productId, purchaseToken) {
        try {
            const client = await getPlayClient();
            
            const response = await client.purchases.subscriptions.get({
                packageName: GOOGLE_PLAY_CONFIG.packageName,
                subscriptionId: productId,
                token: purchaseToken
            });

            const subscription = response.data;

            // Check if subscription is active
            const now = Date.now();
            const expiryTime = parseInt(subscription.expiryTimeMillis);
            
            return {
                valid: subscription.paymentState === 1 && now < expiryTime,
                productId: productId,
                purchaseToken: purchaseToken,
                orderId: subscription.orderId,
                autoRenewing: subscription.autoRenewing,
                startTimeMillis: parseInt(subscription.startTimeMillis),
                expiryTimeMillis: expiryTime,
                priceCurrencyCode: subscription.priceCurrencyCode,
                priceAmountMicros: subscription.priceAmountMicros,
                paymentState: subscription.paymentState,
                // paymentState: 0 = payment pending, 1 = payment received, 2 = free trial, 3 = pending deferred upgrade/downgrade
                acknowledged: subscription.acknowledged
            };
        } catch (error) {
            console.error('Google Play verification failed:', error.message);
            return { valid: false, error: error.message };
        }
    }

    /**
     * Acknowledge a subscription purchase
     * Must be called after verifying the purchase
     */
    async function acknowledgeSubscription(productId, purchaseToken) {
        try {
            const client = await getPlayClient();
            
            await client.purchases.subscriptions.acknowledge({
                packageName: GOOGLE_PLAY_CONFIG.packageName,
                subscriptionId: productId,
                token: purchaseToken
            });

            return { success: true };
        } catch (error) {
            console.error('Failed to acknowledge subscription:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Cancel a subscription
     */
    async function cancelSubscription(productId, purchaseToken) {
        try {
            const client = await getPlayClient();
            
            await client.purchases.subscriptions.cancel({
                packageName: GOOGLE_PLAY_CONFIG.packageName,
                subscriptionId: productId,
                token: purchaseToken
            });

            return { success: true };
        } catch (error) {
            console.error('Failed to cancel subscription:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get subscription details from purchase token
     */
    async function getSubscriptionDetails(productId, purchaseToken) {
        return await verifySubscription(productId, purchaseToken);
    }

    /**
     * Map subscription type to product ID
     */
    function getProductId(subscriptionType) {
        return GOOGLE_PLAY_CONFIG.subscriptionIds[subscriptionType] || 
               GOOGLE_PLAY_CONFIG.subscriptionIds.monthly;
    }

    return {
        verifySubscription,
        acknowledgeSubscription,
        cancelSubscription,
        getSubscriptionDetails,
        getProductId,
        GOOGLE_PLAY_CONFIG
    };
}

module.exports = { createGooglePlayBillingService };
