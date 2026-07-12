"use strict";

const { Pool } = require('pg');

function createDbPool() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.log('\u26a0 DATABASE_URL not set \u2014 Stripe billing disabled');
        return null;
    }

    // Determine SSL configuration based on the connection string.
    // Render's external Postgres endpoints require SSL, but the internal
    // network may not. Using rejectUnauthorized: true requires a trusted
    // CA chain that Node may not have. Use the connection string's
    // sslmode parameter when present, otherwise default to no SSL for
    // internal connections.
    const sslmode = (() => {
        try {
            const url = new URL(databaseUrl);
            return url.searchParams.get('sslmode');
        } catch {
            return null;
        }
    })();

    const poolConfig = {
        connectionString: databaseUrl,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 15000,
    };

    if (sslmode === 'require' || sslmode === 'prefer' || sslmode === 'verify-full') {
        // External connections need SSL. Use rejectUnauthorized: false for
        // managed databases (Render, Supabase, Neon) whose certs may not
        // chain to a CA in Node's trust store but are still encrypted.
        poolConfig.ssl = { rejectUnauthorized: false };
    } else if (sslmode === 'no-verify') {
        poolConfig.ssl = { rejectUnauthorized: false };
    }
    // sslmode=disable or null → no SSL config (internal/local connections)

    const pool = new Pool(poolConfig);
    console.log('\u2713 PostgreSQL pool initialized (sslmode:', sslmode || 'none', ')');
    return pool;
}

module.exports = { createDbPool };
