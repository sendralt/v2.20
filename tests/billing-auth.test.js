"use strict";
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createBillingAuthMiddleware } = require('../src/middleware/billing-auth');

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function mockReq(headers = {}) {
    return { headers };
}

function mockRes() {
    const res = {
        status: (code) => { res.statusCode = code; return res; },
        json: (body) => { res.body = body; return res; }
    };
    return res;
}

describe('Billing Auth Middleware', () => {

    it('returns 401 when no session token provided', async () => {
        const db = { query: async () => ({ rows: [] }) };
        const billingAuth = createBillingAuthMiddleware({ db });
        const req = mockReq();
        const res = mockRes();
        let nextCalled = false;
        await billingAuth(req, res, () => { nextCalled = true; });
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.error, 'Session token required');
        assert.equal(nextCalled, false);
    });

    it('attaches user from existing billing session', async () => {
        const token = 'existing-session-token';
        const hash = hashToken(token);
        const db = {
            query: async (sql, params) => {
                if (sql.includes('billing_sessions')) {
                    return { rows: [{ account_id: 'acc-existing' }] };
                }
                return { rows: [] };
            }
        };
        const billingAuth = createBillingAuthMiddleware({ db });
        const req = mockReq({ 'x-session-token': token });
        const res = mockRes();
        await billingAuth(req, res, () => {});
        assert.equal(req.user.accountId, 'acc-existing');
    });

    it('auto-creates account when no session exists', async () => {
        const token = 'new-session-token';
        const hash = hashToken(token);
        const accountId = 'acc-new-uuid';
        const originalRandomUUID = crypto.randomUUID;
        crypto.randomUUID = () => accountId;
        let callCount = 0;
        const queries = [];
        const db = {
            query: async (sql, params) => {
                queries.push({ sql, params });
                callCount++;
                if (callCount === 1) {
                    // First query: lookup session — not found
                    return { rows: [] };
                }
                if (callCount === 2) {
                    // Second query: create account with app-generated UUID
                    return { rows: [] };
                }
                if (callCount === 3) {
                    // Third query: link session
                    return { rows: [] };
                }
                return { rows: [] };
            }
        };
        const billingAuth = createBillingAuthMiddleware({ db });
        const req = mockReq({ 'x-session-token': token });
        const res = mockRes();
        try {
            await billingAuth(req, res, () => {});
            assert.equal(req.user.accountId, accountId);
            assert.equal(callCount, 3);
            assert.deepEqual(queries[1].params, [accountId]);
            assert.deepEqual(queries[2].params, [hash, accountId]);
        } finally {
            crypto.randomUUID = originalRandomUUID;
        }
    });

});
