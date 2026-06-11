"use strict";

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createStripeService } = require('../src/services/stripe');

describe('Stripe service', () => {
    it('throws if no db provided', () => {
        assert.throws(() => createStripeService({ db: null, stripeClient: {} }), /DATABASE_URL is required/);
    });

    it('returns existing customer from local mapping', async () => {
        let searchCalled = false;
        const db = {
            query: async (sql) => {
                if (sql.includes('SELECT customer_id')) return { rows: [{ customer_id: 'cus_existing' }] };
                return { rows: [] };
            }
        };
        const stripeClient = {
            customers: {
                search: async () => { searchCalled = true; return { data: [] }; },
                create: async () => ({ id: 'cus_new' })
            }
        };
        const svc = createStripeService({ db, stripeClient });
        const customerId = await svc.getOrCreateCustomer('acc-1');
        assert.equal(customerId, 'cus_existing');
        assert.equal(searchCalled, false);
    });

    it('uses Stripe customer search for metadata lookup', async () => {
        const queries = [];
        const db = {
            query: async (sql, params) => {
                queries.push({ sql, params });
                if (sql.includes('SELECT customer_id')) return { rows: [] };
                return { rows: [] };
            }
        };
        let searchQuery = null;
        const stripeClient = {
            customers: {
                search: async (params) => {
                    searchQuery = params.query;
                    return { data: [{ id: 'cus_found' }] };
                },
                create: async () => { throw new Error('create should not be called'); }
            }
        };
        const svc = createStripeService({ db, stripeClient });
        const customerId = await svc.getOrCreateCustomer('acc-1');
        assert.equal(customerId, 'cus_found');
        assert.equal(searchQuery, "metadata['appAccountId']:'acc-1'");
        assert.ok(queries.some(q => q.sql.includes('INSERT INTO stripe_customers')));
    });

    it('creates a customer when metadata search fails', async () => {
        const db = {
            query: async (sql) => {
                if (sql.includes('SELECT customer_id')) return { rows: [] };
                if (sql.includes('RETURNING customer_id')) return { rows: [{ customer_id: 'cus_created' }] };
                return { rows: [] };
            }
        };
        const stripeClient = {
            customers: {
                search: async () => { throw new Error('search unavailable'); },
                create: async (body, options) => {
                    assert.equal(body.metadata.appAccountId, 'acc-1');
                    assert.equal(options.idempotencyKey, 'customer:acc-1');
                    return { id: 'cus_created' };
                }
            }
        };
        const svc = createStripeService({ db, stripeClient });
        const customerId = await svc.getOrCreateCustomer('acc-1');
        assert.equal(customerId, 'cus_created');
    });
});
