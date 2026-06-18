/**
 * FishSmart Pro Subscription Module - Hardened Session Authentication
 * 
 * Implements secure session management:
 * 1. Server-side Google Play token validation for subscribers
 * 2. Purchase token as cryptographically secure session key
 * 3. Play Integrity API for free tier hardening
 * 4. Stateless verification with session tokens
 */

// Constants
const SUBSCRIPTION_KEY = 'fishsmart_device_id';
const SESSION_TOKEN_KEY = 'fishsmart_session_token';
const SESSION_EXPIRY_KEY = 'fishsmart_session_expiry';
const USAGE_CACHE_KEY = 'fishsmart_usage_cache';
const GOOGLE_PLAY_TOKEN_KEY = 'fishsmart_google_play_token';
const FREE_TIER_LIMIT = 3;

// Google Play Product IDs (must match Play Console)
const GOOGLE_PLAY_PRODUCTS = {
    monthly: 'fishsmart_pro_monthly',
    yearly: 'fishsmart_pro_yearly'
};

// State
let deviceId = null;
let sessionToken = null;
let usageData = { usageCount: 0, isSubscribed: false, remaining: FREE_TIER_LIMIT };
let digitalGoodsService = null;
let isGooglePlayAvailable = false;
let playIntegrityAvailable = false;

let overlayLocked = false;
function lockOverlay() {
    if (overlayLocked) return false;
    overlayLocked = true;
    return true;
}
function unlockOverlay() {
    overlayLocked = false;
}

function notifyToast(message, type = 'info') {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
        window.showToast(message, type);
        return;
    }
    console.log(`[${String(type).toUpperCase()}] ${message}`);
}

/**
 * Defensive check for paywall requirement
 */
function requiresPaywall() {
    // If we don't have remaining count yet, assume user has full limit (don't block first open)
    const remaining = usageData.remaining ?? (usageData.isSubscribed ? Infinity : FREE_TIER_LIMIT);
    return !usageData.isSubscribed && remaining <= 0;
}

function enforcePaywallState() {
    if (requiresPaywall()) {
        showPaywall();
        return false;
    }

    hidePaywall(true);
    return true;
}

/**
 * Initialize subscription system with hardened session authentication
 */
async function initSubscription() {
    deviceId = getDeviceId();
    sessionToken = getSessionToken();

    // Check if Play Integrity API is available
    if ('PlayIntegrity' in window || 'google' in window) {
        playIntegrityAvailable = true;
    }

    let gpPromise = Promise.resolve();
    // Check if Digital Goods API is available
    if ('getDigitalGoodsService' in window) {
        gpPromise = (async () => {
            try {
                digitalGoodsService = await window.getDigitalGoodsService('https://play.google.com/billing');
                if (digitalGoodsService) {
                    isGooglePlayAvailable = true;
                    await syncWithGooglePlay();
                }
            } catch (error) {
                console.log('Google Play Billing not available:', error.message);
                isGooglePlayAvailable = false;
            }
        })();
    }

    // Create or validate session
    await ensureSession();

    // Fetch usage stats and handle checkout return in parallel
    await Promise.all([fetchUsageStats(), handleCheckoutReturn(), gpPromise]);

    if (!usageData.isSubscribed) {
        const ent = await fetchStripeEntitlement();
        if (ent && ent.is_premium) {
            usageData.isSubscribed = true;
            usageData.remaining = Infinity;
            updateUsageDisplay();
            hidePaywall(true);
        }
    }
    // Show manage billing button if Stripe subscriber
    updateManageBillingButton();
}

function getDeviceId() {
    let id = localStorage.getItem(SUBSCRIPTION_KEY);
    if (!id) {
        id = 'fs_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem(SUBSCRIPTION_KEY, id);
    }
    // H-2: Sync to shared AuthUtils module
    if (typeof window.AuthUtils !== 'undefined') window.AuthUtils.setDeviceId(id);
    return id;
}

function getSessionToken() {
    const token = localStorage.getItem(SESSION_TOKEN_KEY);
    const expiry = localStorage.getItem(SESSION_EXPIRY_KEY);
    if (expiry && Date.now() > parseInt(expiry)) {
        clearSession();
        return null;
    }
    return token;
}

function setSessionToken(token, expiresAt) {
    sessionToken = token;
    localStorage.setItem(SESSION_TOKEN_KEY, token);
    if (expiresAt) {
        localStorage.setItem(SESSION_EXPIRY_KEY, expiresAt.toString());
    }

    // H-2: Sync to shared AuthUtils module
    if (typeof window.AuthUtils !== 'undefined') window.AuthUtils.setSessionToken(token);
}

function clearSession() {
    sessionToken = null;
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SESSION_EXPIRY_KEY);

    // H-2: Sync to shared AuthUtils module
    if (typeof window.AuthUtils !== 'undefined') window.AuthUtils.setSessionToken(null);
}

async function requestPlayIntegrityToken() {
    try {
        if (window.androidApp && window.androidApp.requestIntegrityToken) {
            return await window.androidApp.requestIntegrityToken();
        }
        if (window.fishsmart && window.fishsmart.getIntegrityToken) {
            return await window.fishsmart.getIntegrityToken();
        }
        return null;
    } catch (error) {
        console.error('Play Integrity token request failed:', error);
        return null;
    }
}

async function ensureSession() {
    if (sessionToken) {
        try {
            const response = await fetch('/api/auth/validate', {
                headers: { 'X-Session-Token': sessionToken }
            });
            if (response.ok) {
                const result = await response.json().catch(() => ({}));
                if (result.success) return;
            }
            clearSession();
        } catch (error) {
            clearSession();
        }
    }
    await createSession();
}

async function createSession() {
    try {
        const purchaseToken = localStorage.getItem(GOOGLE_PLAY_TOKEN_KEY);
        const productId = localStorage.getItem('fishsmart_subscription_plan');
        const integrityToken = await requestPlayIntegrityToken();
        
        if (!isGooglePlayAvailable && (purchaseToken || productId)) {
            localStorage.removeItem(GOOGLE_PLAY_TOKEN_KEY);
            localStorage.removeItem('fishsmart_subscription_plan');
        }

        const requestBody = { integrityToken };
        if (isGooglePlayAvailable && purchaseToken && productId) {
            requestBody.purchaseToken = purchaseToken;
            requestBody.productId = GOOGLE_PLAY_PRODUCTS[productId] || productId;
        }

        let response = await requestSession(requestBody);
        if (!response.ok && isGooglePlayAvailable && purchaseToken && productId) {
            localStorage.removeItem(GOOGLE_PLAY_TOKEN_KEY);
            localStorage.removeItem('fishsmart_subscription_plan');
            response = await requestSession({ integrityToken });
        }

        return await handleSessionResponse(response);
    } catch (error) {
        console.error('Session creation error:', error);
        return null;
    }
}

async function requestSession(requestBody) {
    return fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });
}

async function handleSessionResponse(response) {
    if (!response.ok) return null;

    const result = await response.json().catch(() => ({}));
    if (!result.success) return null;

    setSessionToken(result.sessionId, result.expiresAt);

    // Sync state immediately using returned data
    const data = result.data || result;
    if (result.type === 'subscribed' || data.isSubscribed) {
        usageData.isSubscribed = true;
        usageData.remaining = Infinity;
    } else {
        const usage = data.usage || data;
        usageData.usageCount = usage.used || usage.usageCount || 0;
        usageData.remaining = usage.remaining ?? (FREE_TIER_LIMIT - usageData.usageCount);
        usageData.isSubscribed = false;
    }

    updateUsageDisplay();
    enforcePaywallState();
    return result;
}

function getAuthHeaders() {
    // H-2: Prefer shared AuthUtils module when available
    if (typeof window.AuthUtils !== 'undefined') {
        return window.AuthUtils.getAuthHeaders();
    }
    // Fallback to internal state if auth-utils.js failed to load
    const headers = {};
    if (sessionToken) headers['X-Session-Token'] = sessionToken;
    if (deviceId) headers['X-Device-ID'] = deviceId;
    return headers;
}

let _usageStatsPromise = null;

async function fetchUsageStats(retryCount = 0) {
    if (_usageStatsPromise) return _usageStatsPromise;
    _usageStatsPromise = _doFetchUsageStats(retryCount);
    try {
        return await _usageStatsPromise;
    } finally {
        _usageStatsPromise = null;
    }
}

async function _doFetchUsageStats(retryCount = 0) {
    try {
        const response = await fetch('/api/usage', {
            headers: getAuthHeaders()
        });

        if (response.ok) {
            const result = await response.json().catch(() => ({}));
            if (result.success) {
                // Extract data from result.data
                const data = result.data || result;
                usageData.isSubscribed = data.isSubscribed || data.type === 'subscribed';
                usageData.usageCount = data.usageCount || data.used || 0;
                usageData.remaining = data.remaining ?? (FREE_TIER_LIMIT - usageData.usageCount);

                updateUsageDisplay();
                enforcePaywallState();

                if (result.sessionId) {
                    setSessionToken(result.sessionId, result.sessionExpiresAt);
                }
            }
        } else if (response.status === 401 && retryCount < 1) {
            clearSession();
            const newSession = await createSession();
            if (newSession) {
                return _doFetchUsageStats(retryCount + 1);
            }
            // Session creation failed (e.g., FREE_TIER_EXHAUSTED) — stop retrying
            console.warn('Session creation failed, not retrying fetchUsageStats');
            const usageCounter = document.getElementById('usageCounter');
            if (usageCounter) usageCounter.setAttribute('title', 'Data may be stale — reconnect to refresh');
        }
    } catch (error) {
        console.error('Failed to fetch usage stats:', error);
        const cached = localStorage.getItem(USAGE_CACHE_KEY);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (parsed && typeof parsed.usageCount === 'number' && typeof parsed.remaining === 'number') {
                    usageData = parsed;
                    updateUsageDisplay();
                    enforcePaywallState();
                }
            } catch (e) {
                console.warn('Invalid usage cache', e);
            }
        }
    }
}

function updateUsageDisplay() {
    const usageText = document.getElementById('usageText');
    const usageCounter = document.getElementById('usageCounter');
    const paywallUsageText = document.getElementById('paywallUsageText');
    const paywallProgressBar = document.getElementById('paywallProgressBar');

    if (usageCounter) usageCounter.setAttribute('aria-live', 'polite');
    if (!usageText) return;

    if (usageData.isSubscribed) {
        usageText.textContent = 'PRO';
        usageCounter.classList.add('bg-yellow-400/20', 'border-yellow-400/40');
        usageCounter.classList.remove('bg-slate-800/50', 'border-cyan-500/20');
        if (paywallUsageText) paywallUsageText.textContent = 'Unlimited';
        if (paywallProgressBar) paywallProgressBar.style.width = '100%';
    } else {
        const remaining = usageData.remaining ?? (FREE_TIER_LIMIT - (usageData.usageCount || 0));
        usageText.textContent = `${Math.max(0, remaining)} use${remaining !== 1 ? 's' : ''} left`;
        
        usageCounter.classList.remove('bg-yellow-400/20', 'border-yellow-400/40');
        usageCounter.classList.add('bg-slate-800/50', 'border-cyan-500/20');

        const used = usageData.usageCount || 0;
        const percent = Math.min(100, (used / FREE_TIER_LIMIT) * 100);

        if (paywallUsageText) paywallUsageText.textContent = `${used}/${FREE_TIER_LIMIT} used`;
        if (paywallProgressBar) paywallProgressBar.style.width = `${percent}%`;

        usageCounter.classList.remove('border-red-500/40', 'border-yellow-500/40');
        usageText.classList.remove('text-red-400', 'text-yellow-400');
        
        if (remaining <= 0) {
            usageCounter.classList.add('border-red-500/40');
            usageText.classList.add('text-red-400');
        } else if (remaining === 1) {
            usageCounter.classList.add('border-yellow-500/40');
            usageText.classList.add('text-yellow-400');
        }
    }
    
    localStorage.setItem(USAGE_CACHE_KEY, JSON.stringify(usageData));
    // Update header free tier indicator if available
    if (typeof window.updateFreeTierIndicator === 'function') {
        window.updateFreeTierIndicator();
    }
}

function showPaywall() {
    const modal = document.getElementById('paywallModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        if (window.lucide) lucide.createIcons();
        updateUsageDisplay();
        if (typeof trapFocus === 'function') {
            trapFocus(modal);
            document.addEventListener('keydown', function paywallEsc(e) {
                if (e.key === 'Escape') {
                    hidePaywall(true);
                    document.removeEventListener('keydown', paywallEsc);
                }
            });
        }
    }
}

function hidePaywall(force = false) {
    if (!force && requiresPaywall()) return;
    const modal = document.getElementById('paywallModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    if (typeof releaseFocus === 'function') releaseFocus();
}

function checkUsage() {
    if (requiresPaywall()) {
        enforcePaywallState();
        return false;
    }
    return true;
}

async function initiatePayment(plan) {
    if (!lockOverlay()) return;
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');

    let isRedirecting = false;
    let paymentResponse = null;

    try {
        if (!sessionToken) {
            await ensureSession();
        }

        if (!shouldUseGooglePlayBilling()) {
            unlockOverlay();
            return await initiateStripeCheckout(plan);
        }

        if (loadingOverlay) {
            loadingOverlay.classList.remove('hidden');
            loadingOverlay.classList.add('flex');
            if (loadingText) loadingText.textContent = 'Contacting Play Store...';
        }

        const productId = GOOGLE_PLAY_PRODUCTS[plan];
        const paymentMethodData = [{
            supportedMethods: 'https://play.google.com/billing',
            data: { sku: productId }
        }];

        const request = new PaymentRequest(paymentMethodData);
        paymentResponse = await request.show();
        const { purchaseToken } = paymentResponse.details;

        const verifyResponse = await fetch('/api/google-play/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId, purchaseToken, deviceId })
        });

        const result = await verifyResponse.json().catch(() => ({}));
        if (!verifyResponse.ok) {
            throw new Error(result.error || 'Google Play verification failed');
        }
        if (result.success) {
            localStorage.setItem(GOOGLE_PLAY_TOKEN_KEY, purchaseToken);
            localStorage.setItem('fishsmart_subscription_plan', plan);
            await paymentResponse.complete('success');
            notifyToast('Subscription active!', 'success');
            await fetchUsageStats();
        } else {
            throw new Error(result.error || 'Verification failed');
        }

    } catch (error) {
        console.error('Payment error:', error);
        if (paymentResponse?.complete) {
            try {
                await paymentResponse.complete('fail');
            } catch (completeError) {
                console.warn('Failed to complete Google Play payment response:', completeError);
            }
        }
        // If Google Play not available, fall back to Stripe for web users
        if (shouldFallbackToStripe(error)) {
            notifyToast('Redirecting to web checkout...', 'info');
            isRedirecting = true;
            unlockOverlay();
            return await initiateStripeCheckout(plan);
        }
        notifyToast(error.message, 'error');
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
            loadingOverlay.classList.remove('flex');
        }
    } finally {
        unlockOverlay();
        if (loadingOverlay && !isRedirecting) {
            loadingOverlay.classList.add('hidden');
            loadingOverlay.classList.remove('flex');
        }
    }
}

function shouldUseGooglePlayBilling() {
    return isGooglePlayAvailable
        && !!digitalGoodsService
        && typeof window.PaymentRequest !== 'undefined';
}

function shouldFallbackToStripe(error) {
    const message = error?.message || '';
    const name = error?.name || '';
    if (name === 'AbortError') return false;

    return message.includes('Google Play Billing not available')
        || message.includes('Google Play Billing not configured')
        || message.includes('getDigitalGoodsService')
        || message.includes('Google Play verification failed')
        || message.includes('PaymentRequest')
        || name === 'NotSupportedError'
        || name === 'InvalidStateError';
}

async function initiateStripeCheckout(plan) {
    if (!lockOverlay()) return;
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    if (loadingOverlay) {
        loadingOverlay.classList.remove('hidden');
        loadingOverlay.classList.add('flex');
        if (loadingText) loadingText.textContent = 'Opening checkout...';
    }
    let willRedirect = false;
    try {
        if (!sessionToken) {
            await ensureSession();
        }

        const response = await fetch('/api/stripe/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken || '' },
            body: JSON.stringify({ plan })
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.data && result.data.url) {
            willRedirect = true;
            window.location.href = result.data.url;
        } else {
            notifyToast(result.error || 'Checkout failed', 'error');
        }
    } catch (error) {
        console.error('Stripe checkout error:', error);
        notifyToast('Failed to start checkout', 'error');
    } finally {
        unlockOverlay();
        if (loadingOverlay && !willRedirect) {
            loadingOverlay.classList.add('hidden');
            loadingOverlay.classList.remove('flex');
        }
    }
}

async function fetchStripeEntitlement() {
    try {
        const response = await fetch('/api/billing/entitlement', {
            headers: { 'X-Session-Token': sessionToken || '' }
        });
        if (!response.ok) return null;
        return await response.json().catch(() => null);
    } catch (error) {
        console.error('Failed to fetch Stripe entitlement:', error);
        return null;
    }
}

async function handleCheckoutReturn() {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const canceled = params.get('canceled');

    if (canceled === 'true') {
        notifyToast('Payment canceled. You can try again anytime.', 'warning');
        window.history.replaceState({}, '', '/');
        return;
    }

    if (!sessionId) return;

    // Clean URL
    window.history.replaceState({}, '', '/');

    notifyToast('Processing payment...', 'info');

    // Try confirm-session for proactive sync
    try {
        const res = await fetch('/api/billing/confirm-session?session_id=' + sessionId, {
            headers: { 'X-Session-Token': sessionToken || '' }
        });
        if (res.ok) {
            const data = await res.json().catch(() => ({}));
            if (data.is_premium) {
                usageData.isSubscribed = true;
                usageData.remaining = Infinity;
                updateUsageDisplay();
                hidePaywall(true);
                notifyToast('Pro activated!', 'success');
                return;
            }
        }
    } catch (e) {
        // Webhook may still be processing — poll
    }

    // Poll entitlement as fallback
    notifyToast('Verifying subscription, please wait...', 'info');
    let delay = 1000;
    for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
        const ent = await fetchStripeEntitlement();
        if (ent && ent.is_premium) {
            usageData.isSubscribed = true;
            usageData.remaining = Infinity;
            updateUsageDisplay();
            hidePaywall(true);
            notifyToast('Pro activated!', 'success');
            return;
        }
    }
    notifyToast('Payment is still processing. Please check back shortly.', 'warning');
}

async function openStripePortal() {
    try {
        const response = await fetch('/api/billing/portal-session', {
            method: 'POST',
            headers: { 'X-Session-Token': sessionToken || '' }
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.url) {
            window.location.href = result.url;
        } else {
            notifyToast(result.error || 'Could not open billing portal', 'error');
        }
    } catch (error) {
        notifyToast('Failed to open billing portal', 'error');
    }
}

async function updateManageBillingButton() {
    const btn = document.getElementById('manageBillingBtn');
    if (!btn) return;
    const ent = await fetchStripeEntitlement();
    if (ent && ent.is_premium && ent.source && ent.source.startsWith('stripe')) {
        btn.classList.remove('hidden');
    } else {
        btn.classList.add('hidden');
    }
}

async function restorePurchases() {
    notifyToast('Checking for active subscriptions...', 'info');
    try {
        if (!isGooglePlayAvailable || !digitalGoodsService) {
            throw new Error('Google Play Billing not available');
        }

        const purchases = await digitalGoodsService.listPurchases();
        for (const purchase of purchases) {
            const productId = purchase.itemId;
            const purchaseToken = purchase.purchaseToken;
            
            const response = await fetch('/api/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId, purchaseToken, productId })
            });
            
            const result = await response.json().catch(() => ({}));
            if (result.success) {
                localStorage.setItem(GOOGLE_PLAY_TOKEN_KEY, purchaseToken);
                notifyToast('Subscription restored!', 'success');
                await fetchUsageStats();
                return;
            }
        }
        notifyToast('No active subscriptions found', 'warning');
    } catch (error) {
        console.error('Restore error:', error);
        notifyToast(error.message, 'error');
    }
}

async function applyPromoCode() {
    const input = document.getElementById('promoCodeInput');
    const message = document.getElementById('promoCodeMessage');
    const code = input?.value?.trim();

    if (!code) return;

    try {
        const response = await fetch('/api/promo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId, code })
        });

        const result = await response.json().catch(() => ({}));
        if (result.success) {
            if (result.sessionId) {
                setSessionToken(result.sessionId, result.expiresAt);
            }
            notifyToast('Promo code applied!', 'success');
            if (message) {
                message.textContent = 'Success! Subscription active.';
                message.className = 'text-xs mt-2 text-neon-green';
                message.classList.remove('hidden');
            }
            await fetchUsageStats();
            setTimeout(() => hidePaywall(true), 1500);
        } else {
            if (message) {
                message.textContent = result.error || 'Invalid promo code';
                message.className = 'text-xs mt-2 text-red-400';
                message.classList.remove('hidden');
            }
        }
    } catch (error) {
        notifyToast('Failed to apply promo code', 'error');
    }
}

async function syncWithGooglePlay() {
    if (!isGooglePlayAvailable) return;
    try {
        await fetch('/api/google-play/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId })
        });
    } catch (error) {
        console.error('GP sync error:', error);
    }
}

async function getAvailableProducts() {
    if (!isGooglePlayAvailable || !digitalGoodsService) return [];
    try {
        return await digitalGoodsService.getDetails(Object.values(GOOGLE_PLAY_PRODUCTS));
    } catch (error) {
        return [];
    }
}

async function logout() {
    if (sessionToken) {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST', 
                headers: getAuthHeaders()
            });
        } catch (e) {}
    }
    clearSession();
    localStorage.removeItem(GOOGLE_PLAY_TOKEN_KEY);
    localStorage.removeItem('fishsmart_subscription_plan');
    await fetchUsageStats();
}

document.addEventListener('DOMContentLoaded', () => {
    initSubscription();
    document.getElementById('payMonthlyBtn')?.addEventListener('click', () => initiatePayment('monthly'));
    document.getElementById('payYearlyBtn')?.addEventListener('click', () => initiatePayment('yearly'));
    document.getElementById('restorePurchasesBtn')?.addEventListener('click', restorePurchases);
    document.getElementById('restoreEmailBtn')?.addEventListener('click', restoreSubscriptionByEmail);
    document.getElementById('promoApplyBtn')?.addEventListener('click', applyPromoCode);
    document.getElementById('manageBillingBtn')?.addEventListener('click', openStripePortal);
});

async function restoreSubscriptionByEmail() {
    const btn = document.getElementById('restoreEmailBtn');
    const input = document.getElementById('restoreEmailInput');
    const message = document.getElementById('restoreEmailMessage');
    const email = input?.value?.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (message) {
            message.textContent = 'Please enter a valid email.';
            message.className = 'text-xs mt-2 text-red-400';
            message.classList.remove('hidden');
        }
        return;
    }

    if (btn) {
        btn.textContent = '...';
        btn.disabled = true;
    }

    try {
        const response = await fetch('/api/stripe/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken || '' },
            body: JSON.stringify({ email })
        });

        const result = await response.json().catch(() => ({}));
        if (result.is_premium) {
            if (message) {
                message.textContent = 'Subscription restored! Refreshing...';
                message.className = 'text-xs mt-2 text-green-400';
                message.classList.remove('hidden');
            }
            notifyToast('Subscription restored!', 'success');
            setTimeout(() => location.reload(), 1500);
        } else {
            if (message) {
                message.textContent = result.error || 'No active subscription found';
                message.className = 'text-xs mt-2 text-red-400';
                message.classList.remove('hidden');
            }
        }
    } catch (error) {
        notifyToast('Failed to restore subscription', 'error');
    } finally {
        if (btn) {
            btn.textContent = 'Restore';
            btn.disabled = false;
        }
    }
}

window.subscription = {
    init: initSubscription,
    getDeviceId, getSessionToken, createSession, ensureSession, getAuthHeaders, fetchUsageStats,
    updateUsageDisplay, enforcePaywallState, showPaywall, hidePaywall, checkUsage, initiatePayment,
    initiateStripeCheckout, fetchStripeEntitlement, handleCheckoutReturn, openStripePortal,
    restorePurchases, applyPromoCode, logout, syncWithGooglePlay, getAvailableProducts,
    requestPlayIntegrityToken,
    isGooglePlayAvailable: () => isGooglePlayAvailable,
    isPlayIntegrityAvailable: () => playIntegrityAvailable,
    getUsageData: () => usageData
};
