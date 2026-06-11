"use strict";
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createWebhookHandler } = require('../src/services/stripe-webhook-handler');

function makeEvent(type, objectOverrides = {}) {
    return {
        id: 'evt_123',
        type,
        data: { object: { id: 'sub_abc', metadata: { appAccountId: 'acc-1' }, ...objectOverrides } }
    };
}

describe('Stripe Webhook Handler', () => {

    it('throws if no db provided', () => {
        assert.throws(() => createWebhookHandler({ db: null }), /DATABASE_URL is required/);
    });

    async function setup() {
        const upserted = [];
        const db = { query: async () => ({ rows: [] }) };
        const computeAndSaveEntitlement = async (accountId) => {
            upserted.push(accountId);
            return { isPremium: true, source: 'stripe', expiresAt: null };
        };
        const stripe = { subscriptions: { retrieve: async (id) => ({ id, metadata: { appAccountId: 'acc-1' }, customer: 'cus_1', status: 'active', current_period_end: new Date(Date.now() + 86400000).toISOString(), cancel_at_period_end: false }) } };
        const handler = createWebhookHandler({ stripe, db, computeAndSaveEntitlement });
        return { handler, upserted };
    }

    it('processes checkout.session.completed with subscription string', async () => {
        const { handler, upserted } = await setup();
        const event = makeEvent('checkout.session.completed', { mode: 'subscription', subscription: 'sub_expand_me' });
        await handler.processStripeEvent(event);
        assert.equal(upserted.length, 1);
        assert.equal(upserted[0], 'acc-1');
    });

    it('processes checkout.session.completed with expanded subscription object', async () => {
        const { handler, upserted } = await setup();
        const subObj = { id: 'sub_obj', metadata: { appAccountId: 'acc-1' }, customer: 'cus_1', status: 'active', current_period_end: new Date().toISOString(), cancel_at_period_end: false };
        const event = makeEvent('checkout.session.completed', { mode: 'subscription', subscription: subObj });
        await handler.processStripeEvent(event);
        assert.equal(upserted.length, 1);
    });

    it('ignores checkout.session.completed with non-subscription mode', async () => {
        const { handler, upserted } = await setup();
        const event = makeEvent('checkout.session.completed', { mode: 'payment' });
        await handler.processStripeEvent(event);
        assert.equal(upserted.length, 0);
    });

    it('processes customer.subscription.updated', async () => {
        const { handler, upserted } = await setup();
        const event = makeEvent('customer.subscription.updated');
        await handler.processStripeEvent(event);
        assert.equal(upserted.length, 1);
    });

    it('processes customer.subscription.deleted', async () => {
        const { handler, upserted } = await setup();
        const event = makeEvent('customer.subscription.deleted');
        await handler.processStripeEvent(event);
        assert.equal(upserted.length, 1);
    });

    it('processes customer.subscription.created', async () => {
        const { handler, upserted } = await setup();
        const event = makeEvent('customer.subscription.created');
        await handler.processStripeEvent(event);
        assert.equal(upserted.length, 1);
    });

    it('processes invoice.paid with subscription string', async () => {
        const { handler, upserted } = await setup();
        const event = makeEvent('invoice.paid', { subscription: 'sub_inv' });
        await handler.processStripeEvent(event);
        assert.equal(upserted.length, 1);
    });

    it('processes invoice.payment_failed', async () => {
        const { handler, upserted } = await setup();
        const event = makeEvent('invoice.payment_failed', { subscription: 'sub_fail' });
        await handler.processStripeEvent(event);
        assert.equal(upserted.length, 1);
    });

    it('logs unhandled event types without error', async () => {
        const { handler, upserted } = await setup();
        const event = makeEvent('payment_intent.succeeded');
        await handler.processStripeEvent(event);
        assert.equal(upserted.length, 0);
    });

    it('skips upsert when subscription missing appAccountId', async () => {
        const { handler, upserted } = await setup();
        const event = makeEvent('customer.subscription.updated');
        delete event.data.object.metadata;
        await handler.processStripeEvent(event);
        assert.equal(upserted.length, 0);
    });

});
