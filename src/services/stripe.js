"use strict";

const Stripe = require('stripe');

function createStripeService({ db, stripeClient = null }) {
    if (!db) {
        throw new Error("DATABASE_URL is required for Stripe billing");
    }

    const stripe = stripeClient || new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2024-06-20',
        timeout: 30000,
        maxNetworkRetries: 3,
    });

    function escapeSearchValue(value) {
        return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    async function getOrCreateCustomer(accountId) {
        // 1. Look up existing Stripe customer by accountId
        const { rows } = await db.query(
            'SELECT customer_id FROM stripe_customers WHERE account_id = $1',
            [accountId]
        );
        if (rows.length > 0) return rows[0].customer_id;

        // 2. Search Stripe by metadata (in case DB is out of sync). Customer
        //    list does not support metadata filters; use Stripe Search instead.
        if (stripe.customers.search) {
            try {
                const customers = await stripe.customers.search({
                    limit: 1,
                    query: `metadata['appAccountId']:'${escapeSearchValue(accountId)}'`,
                });
                if (customers.data.length > 0) {
                    const cid = customers.data[0].id;
                    await db.query(
                        'INSERT INTO stripe_customers (customer_id, account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                        [cid, accountId]
                    );
                    return cid;
                }
            } catch (error) {
                console.warn('Stripe customer metadata search failed:', error.message);
            }
        }

        // 3. Create new customer (idempotent on accountId so concurrent
        //    requests with the same key return the same Stripe customer)
        const customer = await stripe.customers.create(
            { metadata: { appAccountId: accountId } },
            { idempotencyKey: `customer:${accountId}` }
        );
        const insert = await db.query(
            `INSERT INTO stripe_customers (customer_id, account_id)
             VALUES ($1, $2)
             ON CONFLICT (account_id) DO NOTHING
             RETURNING customer_id`,
            [customer.id, accountId]
        );
        if (insert.rows.length > 0) return insert.rows[0].customer_id;

        // Lost race — another request inserted first; return that row
        const { rows: existing } = await db.query(
            'SELECT customer_id FROM stripe_customers WHERE account_id = $1',
            [accountId]
        );
        return existing[0].customer_id;
    }

    return { stripe, db, getOrCreateCustomer };
}

module.exports = { createStripeService };
