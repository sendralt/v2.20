#!/usr/bin/env node
"use strict";

/**
 * Generate promo codes for FishSmart Pro
 * 
 * Usage:
 *   node scripts/generate-promo.js [options]
 * 
 * Options:
 *   --code <CODE>         Custom code (auto-generated if omitted)
 *   --type <TYPE>         'unlimited' or 'timed' (default: timed)
 *   --days <NUMBER>       Duration in days for timed codes (default: 30)
 *   --max <NUMBER>        Max redemptions (omit for unlimited)
 *   --dry-run             Show what would be inserted without executing
 * 
 * Examples:
 *   node scripts/generate-promo.js --type timed --days 30 --max 100
 *   node scripts/generate-promo.js --code SUMMER2024 --type timed --days 90
 *   node scripts/generate-promo.js --code VIP-JOHN --type unlimited --max 1
 *   node scripts/generate-promo.js --dry-run --type timed --days 7 --max 50
 */

const { Pool } = require('pg');
const crypto = require('crypto');

// Parse command-line arguments
function parseArgs() {
    const args = {
        code: null,
        type: 'timed',
        days: 30,
        max: null,
        dryRun: false
    };

    const argv = process.argv.slice(2);
    for (let i = 0; i < argv.length; i++) {
        switch (argv[i]) {
            case '--code':
                args.code = argv[++i];
                break;
            case '--type':
                args.type = argv[++i];
                break;
            case '--days':
                args.days = parseInt(argv[++i], 10);
                break;
            case '--max':
                args.max = parseInt(argv[++i], 10);
                break;
            case '--dry-run':
                args.dryRun = true;
                break;
            case '--help':
            case '-h':
                console.log(`
Generate promo codes for FishSmart Pro

Usage:
  node scripts/generate-promo.js [options]

Options:
  --code <CODE>         Custom code (auto-generated if omitted)
  --type <TYPE>         'unlimited' or 'timed' (default: timed)
  --days <NUMBER>       Duration in days for timed codes (default: 30)
  --max <NUMBER>        Max redemptions (omit for unlimited)
  --dry-run             Show what would be inserted without executing
  -h, --help            Show this help message

Examples:
  node scripts/generate-promo.js --type timed --days 30 --max 100
  node scripts/generate-promo.js --code SUMMER2024 --type timed --days 90
  node scripts/generate-promo.js --code VIP-JOHN --type unlimited --max 1
`);
                process.exit(0);
        }
    }

    return args;
}

// Generate a random promo code
function generateRandomCode() {
    const prefixes = ['FISH', 'BASS', 'CAST', 'HOOK', 'LINE', 'PRO'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 6);
    return `${prefix}-${suffix}`;
}

// Validate arguments
function validateArgs(args) {
    if (!['unlimited', 'timed'].includes(args.type)) {
        console.error(`Error: --type must be 'unlimited' or 'timed', got '${args.type}'`);
        process.exit(1);
    }
    if (args.type === 'timed' && (!args.days || args.days < 1)) {
        console.error('Error: --days must be a positive number for timed codes');
        process.exit(1);
    }
    if (args.max !== null && args.max < 1) {
        console.error('Error: --max must be a positive number');
        process.exit(1);
    }
}

async function main() {
    const args = parseArgs();
    validateArgs(args);

    const code = (args.code || generateRandomCode()).toUpperCase();
    const durationDays = args.type === 'unlimited' ? null : args.days;
    const maxRedemptions = args.max;

    console.log('\n📋 Promo Code Details:');
    console.log('─'.repeat(40));
    console.log(`  Code:            ${code}`);
    console.log(`  Type:            ${args.type}`);
    console.log(`  Duration:        ${args.type === 'unlimited' ? 'Unlimited (~10 years)' : `${args.days} days`}`);
    console.log(`  Max Redemptions: ${maxRedemptions === null ? 'Unlimited' : maxRedemptions}`);
    console.log('─'.repeat(40));

    const sql = `
INSERT INTO promo_codes (code, type, duration_days, max_redemptions)
VALUES ('${code}', '${args.type}', ${durationDays === null ? 'NULL' : durationDays}, ${maxRedemptions === null ? 'NULL' : maxRedemptions});
`;

    if (args.dryRun) {
        console.log('\n🔍 DRY RUN — SQL that would be executed:');
        console.log(sql);
        return;
    }

    // Check for DATABASE_URL
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.error('\n❌ Error: DATABASE_URL environment variable is not set.');
        console.error('   Set it to your PostgreSQL connection string, e.g.:');
        console.error('   export DATABASE_URL="postgresql://user:pass@host:5432/dbname?sslmode=require"');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: databaseUrl,
        ssl: { rejectUnauthorized: false },
        max: 1,
        idleTimeoutMillis: 5000,
        connectionTimeoutMillis: 10000,
    });

    try {
        // Check if code already exists
        const existing = await pool.query('SELECT code FROM promo_codes WHERE code = $1', [code]);
        if (existing.rows.length > 0) {
            console.error(`\n❌ Error: Promo code '${code}' already exists in the database.`);
            process.exit(1);
        }

        // Insert the promo code
        await pool.query(
            'INSERT INTO promo_codes (code, type, duration_days, max_redemptions) VALUES ($1, $2, $3, $4)',
            [code, args.type, durationDays, maxRedemptions]
        );

        console.log('\n✅ Promo code created successfully!');
        console.log(`\n📤 Share this code with users: ${code}`);
        console.log(`   Users can redeem it via POST /api/promo with { "code": "${code}" }`);
    } catch (error) {
        console.error('\n❌ Database error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
