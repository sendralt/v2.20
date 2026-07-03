"use strict";

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

function createTestService(db) {
    const { createSessionAuthService } = require('../src/services/session-auth');
    const originalSetInterval = global.setInterval;
    global.setInterval = () => ({ unref() {} });
    try {
        return createSessionAuthService(null, null, db);
    } finally {
        global.setInterval = originalSetInterval;
    }
}

function mockReq(overrides = {}) {
    return {
        ip: '127.0.0.1',
        connection: { remoteAddress: '127.0.0.1' },
        cookies: {},
        headers: {
            'user-agent': 'node-test',
            'accept-language': 'en-US',
            ...overrides.headers
        },
        ...overrides
    };
}

describe('Session auth free tier', () => {
    it('starts a new free session at 0/3 even when prior DB usage exists', async () => {
        const db = {
            query: async () => ({ rows: [{ total_uses: 3 }] })
        };
        const service = createTestService(db);

        const created = await service.createFreeSession(null, mockReq({
            cookies: { fishsmart_did: 'previously-used-cookie' }
        }));
        const session = service.getSessionInfo(created.sessionId);

        assert.equal(created.success, true);
        assert.equal(session.type, 'free');
        assert.equal(session.usageCount, 0);
    });

    it('continues incrementing and persisting usage only when work is performed', async () => {
        const persisted = [];
        const db = {
            query: async (sql, params) => {
                persisted.push({ sql, params });
                return { rows: [] };
            }
        };
        const service = createTestService(db);
        const created = await service.createFreeSession(null, mockReq());

        const usage = await service.incrementUsage(created.sessionId, 3);

        assert.equal(usage.usageCount, 1);
        assert.equal(usage.remaining, 2);
        // CVE-005: incrementUsage now does a SELECT check before incrementing,
        // followed by the persist UPSERT. So we expect 2 DB queries.
        // Find the UPSERT query (has 4 params) to verify usage count persisted.
        const upsert = persisted.find(p => p.params.length === 4 && p.params[3] !== undefined);
        assert.ok(upsert, 'UPSERT persist query should exist');
        assert.equal(upsert.params[3], 1);
    });
});