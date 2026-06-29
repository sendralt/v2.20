"use strict";

/**
 * Tests for the secure anonymous free-tier system.
 *   - src/services/free-tier-token.js (HMAC token create/verify/extract)
 *   - src/middleware/free-tier-check.js (requireFreeTier / checkFreeTierUsage)
 *
 * Run: node --test tests/free-tier.test.js
 */

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

// --- Ensure a signing key exists BEFORE requiring the token service,
//     because the key is resolved lazily and cached on first use.
process.env.STRIPE_WEBHOOK_SECRET = 'test-signing-key-for-free-tier-tests-0123456789';

const tokenService = require('../src/services/free-tier-token');
const { createFreeTierMiddleware, FREE_TIER_LIMIT } = require('../src/middleware/free-tier-check');

// ---------------------------------------------------------------------------
// Test helpers: minimal Express-like mocks.
// ---------------------------------------------------------------------------

function mockReq(opts = {}) {
    return {
        headers: opts.headers || {},
        cookies: opts.cookies || {},
        ip: opts.ip || '203.0.113.42',
        body: opts.body || {},
        path: opts.path || '/api/generate',
        stripeEntitlement: opts.stripeEntitlement || null,
        // next() capture
        ...(opts.extra || {})
    };
}

function mockRes() {
    const res = {
        statusCode: 200,
        body: null,
        cookies: {},
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
        cookie(name, value, opts) { this.cookies[name] = { value, opts }; return this; }
    };
    return res;
}

/** Minimal in-memory DB mock that emulates the pg Pool interface. */
function mockDb(initialRows = []) {
    const store = new Map();
    for (const r of initialRows) store.set(r.ip_hash, r);
    return {
        store,
        async query(sql, params) {
            // INSERT ... ON CONFLICT DO UPDATE ... RETURNING total_uses
            if (/INSERT INTO free_tier_usage_v2/i.test(sql)) {
                const [ipHash, deviceHash] = params;
                const existing = store.get(ipHash);
                let total;
                if (existing) {
                    existing.total_uses += 1;
                    existing.device_hash = deviceHash;
                    existing.last_used = new Date();
                    total = existing.total_uses;
                } else {
                    total = 1;
                    store.set(ipHash, { ip_hash: ipHash, device_hash: deviceHash, total_uses: total });
                }
                return { rows: [{ total_uses: total }] };
            }
            // SELECT total_uses FROM free_tier_usage_v2 WHERE ip_hash = $1
            if (/SELECT total_uses/i.test(sql)) {
                const row = store.get(params[0]);
                return { rows: row ? [{ total_uses: row.total_uses }] : [] };
            }
            return { rows: [] };
        }
    };
}

function makeMiddleware(db = null, sessionAuth = null) {
    return createFreeTierMiddleware({ db, sessionAuth });
}

// ===========================================================================
// 1. Token creation and verification roundtrip
// ===========================================================================

test('createToken + verifyToken roundtrip preserves payload', () => {
    const now = Date.now();
    const payload = {
        count: 2,
        ipHash: 'deadbeef'.repeat(8),
        deviceHash: 'cafebabe'.repeat(8),
        createdAt: now,
        expiresAt: now + 60000
    };
    const token = tokenService.createToken(payload);
    assert.ok(typeof token === 'string' && token.length > 0, 'token should be non-empty string');
    assert.strictEqual(token.split('.').length, 2, 'token should have payload.signature shape');

    const verified = tokenService.verifyToken(token);
    assert.ok(verified, 'verified token should not be null');
    assert.strictEqual(verified.count, 2);
    assert.strictEqual(verified.ipHash, payload.ipHash);
    assert.strictEqual(verified.deviceHash, payload.deviceHash);
    assert.strictEqual(verified.createdAt, now);
    assert.strictEqual(verified.expiresAt, payload.expiresAt);
});

// ===========================================================================
// 2. Token tamper detection (modified token rejected)
// ===========================================================================

test('tampered token (modified payload) is rejected', () => {
    const now = Date.now();
    const token = tokenService.createToken({
        count: 1, ipHash: 'aaa', deviceHash: 'bbb', createdAt: now, expiresAt: now + 60000
    });
    const [payloadB64, sigB64] = token.split('.');

    // Decode payload, bump count, re-encode WITHOUT re-signing.
    const buf = Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/') + '==', 'base64');
    const parsed = JSON.parse(buf.toString('utf8'));
    parsed.count = 99; // attacker tries to reset quota
    const tamperedPayload = Buffer.from(JSON.stringify(parsed)).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const tamperedToken = tamperedPayload + '.' + sigB64;

    const verified = tokenService.verifyToken(tamperedToken);
    assert.strictEqual(verified, null, 'tampered payload must invalidate token');
});

test('token with forged signature is rejected', () => {
    const now = Date.now();
    const token = tokenService.createToken({
        count: 0, ipHash: 'x', deviceHash: 'y', createdAt: now, expiresAt: now + 60000
    });
    const [payloadB64] = token.split('.');
    const forgedSig = Buffer.from('a'.repeat(64)).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const forgedToken = payloadB64 + '.' + forgedSig;
    assert.strictEqual(tokenService.verifyToken(forgedToken), null);
});

test('garbage input returns null without throwing', () => {
    assert.strictEqual(tokenService.verifyToken(''), null);
    assert.strictEqual(tokenService.verifyToken('not-a-token'), null);
    assert.strictEqual(tokenService.verifyToken('a.b.c'), null);
    assert.strictEqual(tokenService.verifyToken(null), null);
    assert.strictEqual(tokenService.verifyToken(undefined), null);
});

// ===========================================================================
// 3. Token expiry check
// ===========================================================================

test('expired token is rejected', () => {
    const now = Date.now();
    const expiredToken = tokenService.createToken({
        count: 0, ipHash: 'h', deviceHash: 'd',
        createdAt: now - 100000, expiresAt: now - 1000 // expired 1s ago
    });
    assert.strictEqual(tokenService.verifyToken(expiredToken), null);
});

test('token just before expiry is still valid', () => {
    const now = Date.now();
    const token = tokenService.createToken({
        count: 0, ipHash: 'h', deviceHash: 'd',
        createdAt: now, expiresAt: now + 5000 // 5s in future
    });
    assert.ok(tokenService.verifyToken(token), 'token with future expiry should be valid');
});

// ===========================================================================
// 4. Count increment across requests (token path)
// ===========================================================================

test('requireFreeTier increments count across requests and re-signs token', async () => {
    const db = mockDb();
    const mw = makeMiddleware(db);

    // Request 1: no token — DB fallback issues count=1 token.
    let req = mockReq();
    let res = mockRes();
    let nextCalled = false;
    await mw.requireFreeTier(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(req.freeTier.used, 1);
    assert.strictEqual(req.freeTier.remaining, FREE_TIER_LIMIT - 1);
    assert.ok(res.cookies[tokenService.COOKIE_NAME], 'cookie should be set after req 1');

    // Request 2: use the issued token — count becomes 2.
    const token1 = res.cookies[tokenService.COOKIE_NAME].value;
    req = mockReq({ cookies: { [tokenService.COOKIE_NAME]: token1 } });
    res = mockRes();
    nextCalled = false;
    await mw.requireFreeTier(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(req.freeTier.used, 2);
    assert.ok(res.cookies[tokenService.COOKIE_NAME], 'cookie should be re-signed after req 2');

    // Request 3: use latest token — count becomes 3 (limit reached but allowed).
    const token2 = res.cookies[tokenService.COOKIE_NAME].value;
    req = mockReq({ cookies: { [tokenService.COOKIE_NAME]: token2 } });
    res = mockRes();
    nextCalled = false;
    await mw.requireFreeTier(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(req.freeTier.used, FREE_TIER_LIMIT);
    assert.strictEqual(req.freeTier.remaining, 0);
});

// ===========================================================================
// 5. 4th request blocked with 403
// ===========================================================================

test('4th request with token at limit is blocked with 403', async () => {
    const mw = makeMiddleware(mockDb());
    const now = Date.now();
    const atLimitToken = tokenService.createToken({
        count: FREE_TIER_LIMIT,
        ipHash: 'h', deviceHash: 'd',
        createdAt: now, expiresAt: now + 60000
    });

    const req = mockReq({ cookies: { [tokenService.COOKIE_NAME]: atLimitToken } });
    const res = mockRes();
    let nextCalled = false;
    await mw.requireFreeTier(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false, 'next() must not be called on block');
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.code, 'SUBSCRIPTION_REQUIRED');
    assert.strictEqual(res.body.usage.remaining, 0);
});

test('4th request via DB fallback is blocked with 403', async () => {
    const ipHash = crypto.createHash('sha256').update('198.51.100.7').digest('hex');
    const db = mockDb([{ ip_hash: ipHash, device_hash: 'd', total_uses: FREE_TIER_LIMIT }]);
    const mw = makeMiddleware(db);

    // No token — must hit DB fallback and find limit already reached.
    const req = mockReq({ ip: '198.51.100.7' });
    const res = mockRes();
    let nextCalled = false;
    await mw.requireFreeTier(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
});

// ===========================================================================
// 6. IP fallback when token is missing
// ===========================================================================

test('DB fallback serves request when token is missing and count < limit', async () => {
    const db = mockDb();
    const mw = makeMiddleware(db);

    const req = mockReq({ ip: '192.0.2.1' }); // no cookies, no header
    const res = mockRes();
    let nextCalled = false;
    await mw.requireFreeTier(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(req.freeTier.used, 1);
    assert.ok(res.cookies[tokenService.COOKIE_NAME], 'fallback must still issue a token cookie');

    // Verify the DB was actually written.
    const ipHash = crypto.createHash('sha256').update('192.0.2.1').digest('hex');
    assert.strictEqual(db.store.get(ipHash).total_uses, 1);
});

test('DB fallback respects existing usage from prior IP hits', async () => {
    const ipHash = crypto.createHash('sha256').update('203.0.113.99').digest('hex');
    const db = mockDb([{ ip_hash: ipHash, device_hash: 'd', total_uses: 2 }]);
    const mw = makeMiddleware(db);

    const req = mockReq({ ip: '203.0.113.99' });
    const res = mockRes();
    await mw.requireFreeTier(req, res, () => {});

    assert.strictEqual(req.freeTier.used, FREE_TIER_LIMIT); // 2 + 1
    assert.strictEqual(req.freeTier.remaining, 0);
});

// ===========================================================================
// 7. Premium user bypasses free-tier check
// ===========================================================================

test('premium user (stripeEntitlement.isPremium) bypasses free-tier entirely', async () => {
    const mw = makeMiddleware(mockDb());
    const req = mockReq({
        stripeEntitlement: { isPremium: true, expiresAt: '2099-01-01', source: 'stripe' }
    });
    const res = mockRes();
    let nextCalled = false;
    await mw.requireFreeTier(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(res.statusCode, 200, 'premium must not receive 403');
    assert.ok(!res.cookies[tokenService.COOKIE_NAME], 'premium must not get free-tier cookie');
    assert.ok(!req.freeTier, 'premium must not get a freeTier counter');
});

test('checkFreeTierUsage gives premium users Infinity remaining', async () => {
    const mw = makeMiddleware(mockDb());
    const req = mockReq({
        stripeEntitlement: { isPremium: true }
    });
    const res = mockRes();
    let nextCalled = false;
    await mw.checkFreeTierUsage(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(req.freeTier.remaining, Infinity);
});

// ===========================================================================
// Bonus: extractTokenFromRequest precedence
// ===========================================================================

test('extractTokenFromRequest prefers cookie over header', () => {
    const token = 'cookie-token-value';
    const req = mockReq({
        cookies: { [tokenService.COOKIE_NAME]: token },
        headers: { [tokenService.HEADER_NAME]: 'header-token-value' }
    });
    assert.strictEqual(tokenService.extractTokenFromRequest(req), token);
});

test('extractTokenFromRequest falls back to header when no cookie', () => {
    const req = mockReq({
        headers: { [tokenService.HEADER_NAME]: 'header-token-value' }
    });
    assert.strictEqual(tokenService.extractTokenFromRequest(req), 'header-token-value');
});

test('extractTokenFromRequest returns null when nothing present', () => {
    assert.strictEqual(tokenService.extractTokenFromRequest(mockReq()), null);
    assert.strictEqual(tokenService.extractTokenFromRequest(null), null);
});

// ===========================================================================
// Bonus: checkFreeTierUsage is read-only (does not increment)
// ===========================================================================

test('checkFreeTierUsage does NOT increment the DB counter', async () => {
    const ipHash = crypto.createHash('sha256').update('203.0.113.50').digest('hex');
    const db = mockDb([{ ip_hash: ipHash, device_hash: 'd', total_uses: 1 }]);
    const mw = makeMiddleware(db);

    const req = mockReq({ ip: '203.0.113.50' });
    await mw.checkFreeTierUsage(req, mockRes(), () => {});

    assert.strictEqual(req.freeTier.used, 1, 'usage must remain 1 (read-only)');
    assert.strictEqual(db.store.get(ipHash).total_uses, 1, 'DB must not have been incremented');
});
