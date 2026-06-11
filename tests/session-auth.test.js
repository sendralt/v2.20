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

        const usage = service.incrementUsage(created.sessionId, 3);

        assert.equal(usage.usageCount, 1);
        assert.equal(usage.remaining, 2);
        assert.equal(persisted.length, 1);
        assert.equal(persisted[0].params[3], 1);
    });
});