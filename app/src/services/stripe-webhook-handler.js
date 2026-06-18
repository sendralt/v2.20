"use strict";

function createWebhookHandler({ stripe, db, computeAndSaveEntitlement }) {
    if (!db) {
        throw new Error("DATABASE_URL is required for webhook handler");
    }

    async function upsertSubscription(subscription) {
        const accountId = subscription.metadata && subscription.metadata.appAccountId;
        if (!accountId) {
            console.error('Subscription missing appAccountId metadata', { subId: subscription.id });
            return;
        }

        await db.query(
            `INSERT INTO billing_subscriptions
              (account_id, provider, provider_customer_id, provider_subscription_id,
               status, current_period_end, cancel_at_period_end, raw)
             VALUES ($1, 'stripe', $2, $3, $4, $5, $6, $7)
             ON CONFLICT (provider_subscription_id) DO UPDATE SET
               status = EXCLUDED.status,
               current_period_end = EXCLUDED.current_period_end,
               cancel_at_period_end = EXCLUDED.cancel_at_period_end,
               raw = EXCLUDED.raw,
               updated_at = now()`,
            [
                accountId,
                subscription.customer,
                subscription.id,
                subscription.status,
                subscription.current_period_end,
                subscription.cancel_at_period_end,
                subscription,
            ]
        );

        await computeAndSaveEntitlement(accountId);
    }

    async function processStripeEvent(event) {
        const sub = event.data.object;

        switch (event.type) {
            case 'checkout.session.completed': {
                if (sub.mode === 'subscription') {
                    let subscription = sub.subscription;
                    if (typeof subscription === 'string') {
                        subscription = await stripe.subscriptions.retrieve(subscription);
                    }
                    await upsertSubscription(subscription);
                }
                break;
            }
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
                await upsertSubscription(sub);
                break;
            case 'invoice.paid': {
                if (sub.subscription) {
                    const subscription = typeof sub.subscription === 'string'
                        ? await stripe.subscriptions.retrieve(sub.subscription)
                        : sub.subscription;
                    await upsertSubscription(subscription);
                }
                break;
            }
            case 'invoice.payment_failed': {
                if (sub.subscription) {
                    const subscription = typeof sub.subscription === 'string'
                        ? await stripe.subscriptions.retrieve(sub.subscription)
                        : sub.subscription;
                    await upsertSubscription(subscription);
                }
                break;
            }
            default:
                console.info('Unhandled webhook event', { type: event.type, id: event.id });
        }
    }

    return { processStripeEvent, upsertSubscription };
}

module.exports = { createWebhookHandler };
