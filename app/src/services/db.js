"use strict";

const { Pool } = require('pg');

function createDbPool() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.log('\u26a0 DATABASE_URL not set \u2014 Stripe billing disabled');
        return null;
    }

    const pool = new Pool({
        connectionString: databaseUrl,
        ssl: { rejectUnauthorized: true }, // Use proper CA certs; if Render connection fails, ensure DATABASE_URL includes ?sslmode=require with valid CA
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 15000,
    });
    console.log('\u2713 PostgreSQL pool initialized');
    return pool;
}

module.exports = { createDbPool };
