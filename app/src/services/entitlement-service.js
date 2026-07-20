"use strict";

function createEntitlementService({ db }) {
    if (!db) {
        throw new Error("DATABASE_URL is required for entitlement service");
    }

    async function computeAndSaveEntitlement(accountId) {
        // Get all active subscriptions for this account
        const { rows: subs } = await db.query(
            `SELECT * FROM billing_subscriptions
             WHERE account_id = $1
             AND status IN ('active', 'trialing', 'past_due')`,
            [accountId]
        );

        let isPremium = false;
        let source = 'none';
        let expiresAt = null;

        for (const sub of subs) {
            if (sub.provider === 'stripe') {
                if (sub.status === 'active' || sub.status === 'trialing') {
                    isPremium = true;
                    source = 'stripe';
                    expiresAt = sub.current_period_end;
                    break; // Stripe takes priority
                }
                if (sub.status === 'past_due') {
                    // 7-day grace period from current_period_end
                    const graceEnd = new Date(sub.current_period_end);
                    graceEnd.setDate(graceEnd.getDate() + 7);
                    if (new Date() < graceEnd) {
                        isPremium = true;
                        source = 'stripe:grace';
                        expiresAt = graceEnd;
                        break;
                    }
                }
            }
            if (sub.provider === 'google_play') {
                if (!isPremium) {
                    isPremium = true;
                    source = 'google_play';
                    expiresAt = sub.current_period_end;
                }
            }
            if (sub.provider === 'manual') {
                const { rows: ent } = await db.query(
                    'SELECT expires_at FROM entitlements WHERE account_id = $1',
                    [accountId]
                );
                if (ent.length > 0 && ent[0].expires_at && new Date() < new Date(ent[0].expires_at)) {
                    if (!isPremium) {
                        isPremium = true;
                        source = 'manual';
                        expiresAt = ent[0].expires_at;
                    }
                }
            }
        }

        // Get previous entitlement for change logging
        const { rows: prev } = await db.query(
            'SELECT is_premium FROM entitlements WHERE account_id = $1', [accountId]
        );
        const oldPremium = prev.length > 0 ? prev[0].is_premium : false;

        // Upsert entitlement
        await db.query(
            `INSERT INTO entitlements (account_id, is_premium, source, expires_at, updated_at)
             VALUES ($1, $2, $3, $4, now())
             ON CONFLICT (account_id) DO UPDATE SET
               is_premium = EXCLUDED.is_premium,
               source = EXCLUDED.source,
               expires_at = EXCLUDED.expires_at,
               updated_at = now()`,
            [accountId, isPremium, source, expiresAt]
        );

        if (oldPremium !== isPremium) {
            console.warn('entitlement changed', {
                accountId, oldPremium, newPremium: isPremium, source
            });
        }

        return { isPremium, source, expiresAt };
    }

    return { computeAndSaveEntitlement };
}

module.exports = { createEntitlementService };
