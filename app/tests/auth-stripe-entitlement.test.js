"use strict";

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createAuthMiddleware } = require('../src/middleware/auth');

function mockReq(path = '/api/generate') {
    return { path, headers: { 'x-session-token': 'session-token' }, body: {} };
}

function mockRes() {
    const res = {
        status: (code) => { res.statusCode = code; return res; },
        json: (body) => { res.body = body; return res; }
    };
    return res;
}

describe('Auth middleware Stripe entitlement integration', () => {
    it('allows a free session with active Stripe entitlement without incrementing usage', async () => {
        let incrementCalled = false;
        const sessionAuth = {
            validateSession: async () => ({ valid: true, session: { type: 'free', usageCount: 3 } }),
            incrementUsage: () => { incrementCalled = true; return { allowed: false, usageCount: 4, remaining: 0 }; }
        };
        const auth = createAuthMiddleware(sessionAuth);
        auth.setStripeEntitlementResolver(async () => ({ isPremium: true, source: 'stripe', expiresAt: null }));

        const req = mockReq();
        const res = mockRes();
        let nextCalled = false;
        await auth.requireAuth(req, res, () => { nextCalled = true; });

        assert.equal(nextCalled, true);
        assert.equal(incrementCalled, false);
        assert.equal(req.session.type, 'subscribed');
        assert.equal(req.usageInfo.isSubscribed, true);
        assert.equal(req.usageInfo.remaining, Infinity);
        assert.equal(req.stripeEntitlement.source, 'stripe');
    });

    it('keeps enforcing free limit when Stripe entitlement is absent', async () => {
        const sessionAuth = {
            validateSession: async () => ({ valid: true, session: { type: 'free', usageCount: 3 } }),
            incrementUsage: () => ({ allowed: false, usageCount: 4, remaining: 0 })
        };
        const auth = createAuthMiddleware(sessionAuth);
        auth.setStripeEntitlementResolver(async () => ({ isPremium: false, source: 'none', expiresAt: null }));

        const req = mockReq();
        const res = mockRes();
        let nextCalled = false;
        await auth.requireAuth(req, res, () => { nextCalled = true; });

        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.code, 'SUBSCRIPTION_REQUIRED');
    });

    it('REGRESSION: passes the request to the resolver so device-cookie fallback survives token rotation', async () => {
        // Bug: resolver only received the token; after rotation the cookie fallback
        // could never be consulted and subscribers were demoted to the free tier.
        let receivedReq = null;
        const sessionAuth = {
            validateSession: async () => ({ valid: true, session: { type: 'free', usageCount: 0 } }),
            incrementUsage: async () => ({ allowed: true, usageCount: 1, remaining: 2 })
        };
        const auth = createAuthMiddleware(sessionAuth);
        auth.setStripeEntitlementResolver(async (token, req) => {
            receivedReq = req;
            return { isPremium: true, source: 'stripe', expiresAt: null };
        });

        const req = mockReq();
        req.cookies = { fishsmart_did: 'stable-device-cookie' };
        const res = mockRes();
        let nextCalled = false;
        await auth.requireAuth(req, res, () => { nextCalled = true; });

        assert.equal(nextCalled, true);
        assert.equal(receivedReq, req);
        assert.equal(req.session.type, 'subscribed');
    });
});
