"use strict";
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createEntitlementService } = require('../src/services/entitlement-service');

function mockDb(queries) {
    const q = queries || [];
    return {
        query: async (sql) => {
            const match = q.find(e => sql.includes(e.sql));
            if (!match) return { rows: [] };
            return { rows: match.rows };
        }
    };
}

const futureDate = new Date(Date.now() + 30 * 86400000).toISOString();
const pastGraceDate = new Date(Date.now() - 10 * 86400000).toISOString();
const recentPastDueDate = new Date(Date.now() - 2 * 86400000).toISOString();

describe('Entitlement Service', () => {

    it('throws if no db provided', () => {
        assert.throws(() => createEntitlementService({ db: null }), /DATABASE_URL is required/);
    });

    it('returns not premium when no active subscriptions', async () => {
        const db = mockDb([
            { sql: `SELECT * FROM billing_subscriptions`, rows: [] },
            { sql: `SELECT is_premium FROM entitlements`, rows: [] },
        ]);
        const svc = createEntitlementService({ db });
        const result = await svc.computeAndSaveEntitlement('acc-1');
        assert.equal(result.isPremium, false);
        assert.equal(result.source, 'none');
        assert.equal(result.expiresAt, null);
    });

    it('returns premium for active Stripe subscription', async () => {
        const db = mockDb([
            { sql: `SELECT * FROM billing_subscriptions`, rows: [{ provider: 'stripe', status: 'active', current_period_end: futureDate }] },
            { sql: `SELECT is_premium FROM entitlements`, rows: [] },
        ]);
        const svc = createEntitlementService({ db });
        const result = await svc.computeAndSaveEntitlement('acc-1');
        assert.equal(result.isPremium, true);
        assert.equal(result.source, 'stripe');
        assert.ok(result.expiresAt);
    });

    it('returns premium for trialing Stripe subscription', async () => {
        const db = mockDb([
            { sql: `SELECT * FROM billing_subscriptions`, rows: [{ provider: 'stripe', status: 'trialing', current_period_end: futureDate }] },
            { sql: `SELECT is_premium FROM entitlements`, rows: [] },
        ]);
        const svc = createEntitlementService({ db });
        const result = await svc.computeAndSaveEntitlement('acc-1');
        assert.equal(result.isPremium, true);
        assert.equal(result.source, 'stripe');
    });

    it('returns premium for past_due within 7-day grace period', async () => {
        const db = mockDb([
            { sql: `SELECT * FROM billing_subscriptions`, rows: [{ provider: 'stripe', status: 'past_due', current_period_end: recentPastDueDate }] },
            { sql: `SELECT is_premium FROM entitlements`, rows: [] },
        ]);
        const svc = createEntitlementService({ db });
        const result = await svc.computeAndSaveEntitlement('acc-1');
        assert.equal(result.isPremium, true);
        assert.equal(result.source, 'stripe:grace');
    });

    it('returns not premium for past_due outside 7-day grace period', async () => {
        const db = mockDb([
            { sql: `SELECT * FROM billing_subscriptions`, rows: [{ provider: 'stripe', status: 'past_due', current_period_end: pastGraceDate }] },
            { sql: `SELECT is_premium FROM entitlements`, rows: [] },
        ]);
        const svc = createEntitlementService({ db });
        const result = await svc.computeAndSaveEntitlement('acc-1');
        assert.equal(result.isPremium, false);
        assert.equal(result.source, 'none');
    });

    it('prefers Stripe over Google Play when both active', async () => {
        const db = mockDb([
            { sql: `SELECT * FROM billing_subscriptions`, rows: [
                { provider: 'google_play', status: 'active', current_period_end: futureDate },
                { provider: 'stripe', status: 'active', current_period_end: futureDate },
            ]},
            { sql: `SELECT is_premium FROM entitlements`, rows: [] },
        ]);
        const svc = createEntitlementService({ db });
        const result = await svc.computeAndSaveEntitlement('acc-1');
        assert.equal(result.source, 'stripe');
    });

    it('falls back to Google Play when no Stripe sub', async () => {
        const db = mockDb([
            { sql: `SELECT * FROM billing_subscriptions`, rows: [{ provider: 'google_play', status: 'active', current_period_end: futureDate }] },
            { sql: `SELECT is_premium FROM entitlements`, rows: [] },
        ]);
        const svc = createEntitlementService({ db });
        const result = await svc.computeAndSaveEntitlement('acc-1');
        assert.equal(result.isPremium, true);
        assert.equal(result.source, 'google_play');
    });

});
