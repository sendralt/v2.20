'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createBillingLinkService } = require('../src/services/billing-link-service');

// In-memory fake of billing_sessions, billing_device_links, accounts.
function fakeDb() {
    const state = {
        billingSessions: new Map(),
        deviceLinks: new Map(),
        accounts: new Set()
    };
    const queries = [];
    const db = {
        state,
        queries,
        query: async (sql, params = []) => {
            const s = String(sql).replace(/\s+/g, ' ').trim();
            queries.push({ sql: s, params });

            if (s.includes('FROM billing_sessions WHERE session_token_hash')) {
                const hit = state.billingSessions.get(params[0]);
                return { rows: hit ? [{ account_id: hit }] : [] };
            }
            if (s.includes('FROM billing_device_links WHERE cookie_id')) {
                const hit = state.deviceLinks.get(params[0]);
                return { rows: hit ? [{ account_id: hit }] : [] };
            }
            if (s.startsWith('INSERT INTO accounts')) {
                state.accounts.add(params[0]);
                return { rows: [] };
            }
            if (s.includes('INSERT INTO billing_sessions')) {
                state.billingSessions.set(params[0], params[1]);
                return { rows: [] };
            }
            if (s.includes('INSERT INTO billing_device_links') && s.includes('DO UPDATE')) {
                state.deviceLinks.set(params[0], params[1]);
                return { rows: [] };
            }
            if (s.includes('INSERT INTO billing_device_links')) {
                if (!state.deviceLinks.has(params[0])) state.deviceLinks.set(params[0], params[1]);
                return { rows: [] };
            }
            return { rows: [] };
        }
    };
    return db;
}

describe('Billing link service', () => {

    it('throws if no db provided', () => {
        assert.throws(() => createBillingLinkService({ db: null }), /db is required/);
    });

    it('resolves an account by session token hash', async () => {
        const db = fakeDb();
        db.state.billingSessions.set('tok-hash-1', 'acc-1');
        const svc = createBillingLinkService({ db });
        assert.equal(await svc.resolveAccount('tok-hash-1', null), 'acc-1');
    });

    it('REGRESSION: keeps resolving the account after token rotation via device cookie', async () => {
        const db = fakeDb();
        db.state.billingSessions.set('old-token-hash', 'acc-sub');
        db.state.deviceLinks.set('device-cookie-1', 'acc-sub');

        const svc = createBillingLinkService({ db });
        const account = await svc.resolveAccount('new-unknown-token-hash', 'device-cookie-1');

        assert.equal(account, 'acc-sub');
        // Self-heal: rotated token is now linked for future lookups.
        assert.equal(db.state.billingSessions.get('new-unknown-token-hash'), 'acc-sub');
    });

    it('records a device link when resolving via a known token', async () => {
        const db = fakeDb();
        db.state.billingSessions.set('tok-hash-2', 'acc-2');
        const svc = createBillingLinkService({ db });

        await svc.resolveAccount('tok-hash-2', 'fresh-cookie');
        assert.equal(db.state.deviceLinks.get('fresh-cookie'), 'acc-2');
    });

    it('does not hijack an existing device link to another account when resolving by token', async () => {
        const db = fakeDb();
        db.state.billingSessions.set('tok-hash-a', 'acc-a');
        db.state.deviceLinks.set('shared-cookie', 'acc-b');
        const svc = createBillingLinkService({ db });

        await svc.resolveAccount('tok-hash-a', 'shared-cookie');
        assert.equal(db.state.deviceLinks.get('shared-cookie'), 'acc-b');
    });

    it('returns null when neither token nor cookie is known', async () => {
        const db = fakeDb();
        const svc = createBillingLinkService({ db });
        assert.equal(await svc.resolveAccount('unknown', 'unknown-cookie'), null);
    });

    it('REGRESSION: reuses the device-linked account instead of minting an empty one', async () => {
        const db = fakeDb();
        db.state.deviceLinks.set('device-cookie-2', 'acc-real');
        const svc = createBillingLinkService({ db });

        const account = await svc.getOrCreateAccountForSession('rotated-hash', 'device-cookie-2');

        assert.equal(account, 'acc-real');
        assert.equal(db.state.accounts.size, 0);
        assert.equal(db.state.billingSessions.get('rotated-hash'), 'acc-real');
    });

    it('mints and fully links a new account when nothing is known', async () => {
        const db = fakeDb();
        const svc = createBillingLinkService({ db });

        const account = await svc.getOrCreateAccountForSession('tok-hash-3', 'cookie-3');
        assert.ok(account);
        assert.equal(db.state.accounts.size, 1);
        assert.equal(db.state.billingSessions.get('tok-hash-3'), account);
        assert.equal(db.state.deviceLinks.get('cookie-3'), account);
    });

    it('linkDevice upserts an existing mapping to a new account', async () => {
        const db = fakeDb();
        db.state.deviceLinks.set('cookie-4', 'acc-old');
        const svc = createBillingLinkService({ db });

        await svc.linkDevice('cookie-4', 'acc-new');
        assert.equal(db.state.deviceLinks.get('cookie-4'), 'acc-new');
    });

    it('degrades gracefully when billing_device_links table is missing', async () => {
        const db = fakeDb();
        db.state.billingSessions.set('tok-hash-4', 'acc-4');
        const realQuery = db.query;
        db.query = async (sql, params = []) => {
            if (String(sql).includes('billing_device_links')) {
                const err = new Error('relation billing_device_links does not exist');
                err.code = '42P01';
                throw err;
            }
            return realQuery(sql, params);
        };

        const svc = createBillingLinkService({ db });
        assert.equal(await svc.resolveAccount('tok-hash-4', 'cookie-5'), 'acc-4');
        assert.equal(await svc.resolveAccount('tok-unknown', 'cookie-5'), null);
    });
});
