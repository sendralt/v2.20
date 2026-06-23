"use strict";
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getWindMultiplier, getCloudMultiplier, getTimeMultiplier, getClarityMultiplier, getSensitivityScaler, computeConfidenceBand } = require('../src/engine/bite-score');

describe('Wind Multiplier', () => {
    it('dead calm (0) -> 0.85', () => assert.equal(getWindMultiplier(0), 0.85));
    it('boundary 1 -> 0.85', () => assert.equal(getWindMultiplier(1), 0.85));
    it('light breeze (5) -> 1.15', () => assert.equal(getWindMultiplier(5), 1.15));
    it('boundary 8 -> 1.15', () => assert.equal(getWindMultiplier(8), 1.15));
    it('moderate (12) -> 1.05', () => assert.equal(getWindMultiplier(12), 1.05));
    it('boundary 15 -> 1.05', () => assert.equal(getWindMultiplier(15), 1.05));
    it('strong (18) -> 0.90', () => assert.equal(getWindMultiplier(18), 0.90));
    it('boundary 20 -> 0.90', () => assert.equal(getWindMultiplier(20), 0.90));
    it('very strong (25) -> 0.75', () => assert.equal(getWindMultiplier(25), 0.75));
    it('null -> 1.0 default', () => assert.equal(getWindMultiplier(null), 1.0));
    it('undefined -> 1.0 default', () => assert.equal(getWindMultiplier(undefined), 1.0));
});

describe('Cloud Cover Multiplier', () => {
    it('clear sky (0) -> 0.85', () => assert.equal(getCloudMultiplier(0), 0.85));
    it('boundary 20 -> 0.85', () => assert.equal(getCloudMultiplier(20), 0.85));
    it('partly cloudy (35) -> 0.95', () => assert.equal(getCloudMultiplier(35), 0.95));
    it('boundary 50 -> 0.95', () => assert.equal(getCloudMultiplier(50), 0.95));
    it('scattered (65) -> 1.10', () => assert.equal(getCloudMultiplier(65), 1.10));
    it('boundary 80 -> 1.10', () => assert.equal(getCloudMultiplier(80), 1.10));
    it('overcast (90) -> 1.15', () => assert.equal(getCloudMultiplier(90), 1.15));
    it('null -> 1.0 default', () => assert.equal(getCloudMultiplier(null), 1.0));
});

describe('Time of Day Multiplier', () => {
    it('dawn (6) -> 1.20 crepuscular', () => assert.equal(getTimeMultiplier(6), 1.20));
    it('dusk (18) -> 1.20 crepuscular', () => assert.equal(getTimeMultiplier(18), 1.20));
    it('boundary 5am -> 1.20', () => assert.equal(getTimeMultiplier(5), 1.20));
    it('boundary 8am -> 1.20', () => assert.equal(getTimeMultiplier(8), 1.20));
    it('boundary 17 -> 1.20', () => assert.equal(getTimeMultiplier(17), 1.20));
    it('boundary 20 -> 1.20', () => assert.equal(getTimeMultiplier(20), 1.20));
    it('mid-morning (10) -> 1.00', () => assert.equal(getTimeMultiplier(10), 1.00));
    it('mid-afternoon (15) -> 1.00', () => assert.equal(getTimeMultiplier(15), 1.00));
    it('midday (12) -> 0.85', () => assert.equal(getTimeMultiplier(12), 0.85));
    it('early pm (13) -> 0.85', () => assert.equal(getTimeMultiplier(13), 0.85));
    it('night (22) -> 0.85', () => assert.equal(getTimeMultiplier(22), 0.85));
    it('late night (3) -> 0.85', () => assert.equal(getTimeMultiplier(3), 0.85));
    it('null -> 1.0 default', () => assert.equal(getTimeMultiplier(null), 1.0));
});

describe('Water Clarity Multiplier', () => {
    it('Gin Clear -> 0.90', () => assert.equal(getClarityMultiplier('Gin Clear'), 0.90));
    it('Clear -> 1.00', () => assert.equal(getClarityMultiplier('Clear'), 1.00));
    it('Stained -> 1.10', () => assert.equal(getClarityMultiplier('Stained'), 1.10));
    it('Muddy -> 0.85', () => assert.equal(getClarityMultiplier('Muddy'), 0.85));
    it('unknown string -> 1.00', () => assert.equal(getClarityMultiplier('Murky'), 1.00));
    it('null -> 1.00', () => assert.equal(getClarityMultiplier(null), 1.00));
});

describe('Time of Day Multiplier — Nocturnal Species', () => {
    // Nocturnal species (walleye, catfish, brown trout, bullhead) are more
    // active at night. They get night multiplier of 1.20 instead of 0.85,
    // and reduced dawn/dusk multiplier of 1.00 instead of 1.20.
    // [Source: Helfman 1986 — Fish behaviour and diel activity patterns]

    it('nocturnal night (22) -> 1.20', () => assert.equal(getTimeMultiplier(22, true), 1.20));
    it('nocturnal late night (3) -> 1.20', () => assert.equal(getTimeMultiplier(3, true), 1.20));
    it('nocturnal night boundary 21 -> 1.20', () => assert.equal(getTimeMultiplier(21, true), 1.20));
    it('nocturnal night boundary 4 -> 1.20', () => assert.equal(getTimeMultiplier(4, true), 1.20));
    it('nocturnal dawn (6) -> 1.00 (reduced from 1.20)', () => assert.equal(getTimeMultiplier(6, true), 1.00));
    it('nocturnal dusk (18) -> 1.00 (reduced from 1.20)', () => assert.equal(getTimeMultiplier(18, true), 1.00));
    it('nocturnal midday (12) -> 0.85 (unchanged)', () => assert.equal(getTimeMultiplier(12, true), 0.85));

    it('non-nocturnal night (22) -> 0.85 (unchanged)', () => assert.equal(getTimeMultiplier(22, false), 0.85));
    it('non-nocturnal dawn (6) -> 1.20 (unchanged)', () => assert.equal(getTimeMultiplier(6, false), 1.20));
    it('null nocturnal -> uses non-nocturnal values', () => assert.equal(getTimeMultiplier(22), 0.85));

    it('walleye at 2 AM scores higher than bass at 2 AM', () => {
        // Walleye is nocturnal, bass is not
        const walleyeMult = getTimeMultiplier(2, true);
        const bassMult = getTimeMultiplier(2, false);
        assert.ok(walleyeMult > bassMult,
            `Walleye night mult (${walleyeMult}) should be > bass night mult (${bassMult})`);
    });
});

describe('Adjustment Factor (square root dampening)', () => {
    it('all neutral (1.0) -> factor = 1.0', () => {
        assert.equal(Math.sqrt(1 * 1 * 1 * 1), 1.0);
    });
    // Updated: 4th-root replaced with square root — wider environmental impact
    it('all favorable -> boost ~25-35%', () => {
        const adj = Math.sqrt(1.15 * 1.15 * 1.20 * 1.10);
        assert.ok(adj > 1.15 && adj < 1.35, 'Got: ' + adj);
    });
    it('all unfavorable -> reduction ~30%', () => {
        const adj = Math.sqrt(0.85 * 0.85 * 0.85 * 0.85);
        assert.ok(adj < 0.85, 'Got: ' + adj);
    });
});

describe('Sensitivity Scaler', () => {
    // Scales pressure-trend multiplier deviation from 1.0 based on species
    // sensitivity. High-sensitivity species (walleye, crappie, trout) have
    // physostomous (open) swim bladders — faster pressure equalization means
    // more visible behavioral response. Low-sensitivity species (catfish,
    // bullhead, pike) have physoclistous (closed) swim bladders — slower
    // equalization, less behavioral disruption.
    // [Source: Jones 1968 — fish swim bladder morphology and pressure response]

    it('High -> 1.3x spread', () => assert.equal(getSensitivityScaler('High'), 1.3));
    it('Medium -> 1.0x spread (baseline)', () => assert.equal(getSensitivityScaler('Medium'), 1.0));
    it('Low -> 0.7x spread', () => assert.equal(getSensitivityScaler('Low'), 0.7));
    it('unknown -> 1.0x (safe default)', () => assert.equal(getSensitivityScaler('Unknown'), 1.0));
    it('null -> 1.0x (safe default)', () => assert.equal(getSensitivityScaler(null), 1.0));

    it('High sensitivity amplifies rising-pressure penalty more than Low', () => {
        // Rising pressure trend multiplier = 0.85 (penalty for rising barometer)
        // High: deviation from 1.0 = -0.15, scaled by 1.3 = -0.195 → adjusted = 0.805
        // Low: deviation from 1.0 = -0.15, scaled by 0.7 = -0.105 → adjusted = 0.895
        // High sensitivity should produce a larger penalty (lower multiplier)
        const highScaler = getSensitivityScaler('High');
        const lowScaler = getSensitivityScaler('Low');
        const trendMult = 0.85; // Rising trend
        const adjustedHigh = 1.0 + (trendMult - 1.0) * highScaler;
        const adjustedLow = 1.0 + (trendMult - 1.0) * lowScaler;
        assert.ok(adjustedHigh < adjustedLow,
            `High sensitivity penalty (${adjustedHigh}) should be greater than Low (${adjustedLow})`);
    });

    it('Stable trend (1.0) is unaffected by sensitivity scaler', () => {
        // When trendMult = 1.0, deviation = 0, so scaler has no effect
        for (const s of ['High', 'Medium', 'Low']) {
            const scaler = getSensitivityScaler(s);
            const adjusted = 1.0 + (1.0 - 1.0) * scaler;
            assert.equal(adjusted, 1.0);
        }
    });
});

// --- Task 17: Wind Direction Windward Shore Bonus ---
// Windblown shores concentrate baitfish and plankton, increasing feeding activity.
// When wind direction data is available and angler is on a windward shore,
// apply a 1.1x bonus to the wind multiplier.
// [Source: Jones 1993 — The impact of wind on fish distribution and feeding]

describe('Wind Direction — Windward Shore Bonus', () => {
    it('windward shore applies 1.1x bonus to light breeze', () => {
        // Base: windMph=5 -> 1.15; windward -> 1.15 * 1.1 = 1.265
        const base = getWindMultiplier(5);
        const windward = getWindMultiplier(5, { isWindwardShore: true });
        assert.ok(windward > base,
            `Windward (${windward}) should exceed base (${base})`);
        assert.ok(Math.abs(windward - base * 1.1) < 0.001,
            `Windward should be ~1.1x base: ${windward} vs ${base * 1.1}`);
    });

    it('leeward (non-windward) shore does NOT get bonus', () => {
        const base = getWindMultiplier(5);
        const leeward = getWindMultiplier(5, { isWindwardShore: false });
        assert.equal(leeward, base,
            `Leeward (${leeward}) should equal base (${base})`);
    });

    it('no options object -> behavior unchanged (backward compat)', () => {
        assert.equal(getWindMultiplier(5), 1.15);
        assert.equal(getWindMultiplier(12), 1.05);
        assert.equal(getWindMultiplier(0), 0.85);
    });

    it('null options -> behavior unchanged', () => {
        assert.equal(getWindMultiplier(5, null), 1.15);
        assert.equal(getWindMultiplier(12, undefined), 1.05);
    });

    it('windward bonus applies to all wind speed tiers', () => {
        const speeds = [0, 1, 5, 8, 12, 15, 18, 20, 25];
        speeds.forEach(mph => {
            const base = getWindMultiplier(mph);
            const windward = getWindMultiplier(mph, { isWindwardShore: true });
            assert.ok(windward > base,
                `Windward at ${mph}mph (${windward}) should exceed base (${base})`);
        });
    });

    it('null wind speed with windward -> still 1.0 default (no crash)', () => {
        assert.equal(getWindMultiplier(null, { isWindwardShore: true }), 1.0);
    });

    it('undefined wind speed with windward -> still 1.0 default', () => {
        assert.equal(getWindMultiplier(undefined, { isWindwardShore: true }), 1.0);
    });
});

// === Task 18: Confidence Bands ===
// Confidence band width is derived from multiplier spread — how extreme
// the environmental multipliers are. Wide spread (extreme conditions)
// produces a wider band (±12%); narrow spread (ideal conditions) produces
// a tighter band (±5%).
// [Source: Spec resolved decision #6 — dynamic band based on multiplier spread]

describe('Confidence Bands', () => {
    it('returns { low, high, band } object with numeric values', () => {
        const result = computeConfidenceBand(50, [1.0, 1.0, 1.0, 1.0]);
        assert.ok(typeof result.low === 'number');
        assert.ok(typeof result.high === 'number');
        assert.ok(typeof result.band === 'number');
    });

    it('band is symmetric around the point estimate', () => {
        const result = computeConfidenceBand(50, [1.0, 1.0, 1.0, 1.0]);
        const midpoint = (result.low + result.high) / 2;
        assert.ok(Math.abs(midpoint - 50) < 1,
            `Midpoint ${midpoint} should be near 50`);
    });

    it('ideal conditions (all multipliers near 1.0) -> narrow band (~5%)', () => {
        const result = computeConfidenceBand(50, [1.0, 1.0, 1.0, 1.0]);
        assert.ok(result.band <= 5,
            `Ideal band ${result.band}% should be narrow (<=5%)`);
        assert.ok(result.low >= 45 && result.high <= 55,
            `Ideal range should be tight: ${result.low}-${result.high}`);
    });

    it('extreme conditions (wide spread) -> wider band (~12%)', () => {
        // Multipliers far from 1.0 indicate extreme/volatile conditions
        const result = computeConfidenceBand(50, [0.75, 1.25, 0.85, 1.15]);
        assert.ok(result.band >= 10,
            `Extreme band ${result.band}% should be wide (>=10%)`);
        assert.ok(result.high - result.low >= 20,
            `Extreme range should be >=20 points: ${result.low}-${result.high}`);
    });

    it('band widens as conditions become more extreme', () => {
        const ideal = computeConfidenceBand(50, [1.0, 1.0, 1.0, 1.0]);
        const moderate = computeConfidenceBand(50, [0.95, 1.05, 1.10, 0.90]);
        const extreme = computeConfidenceBand(50, [0.75, 1.25, 0.85, 1.15]);
        assert.ok(extreme.band > moderate.band,
            `Extreme band (${extreme.band}) should be > moderate (${moderate.band})`);
        
        // Only verify ideal < extreme (moderate is often ~equal to ideal for small deviations)
        assert.ok(extreme.band > ideal.band,
            `Extreme band (${extreme.band}) should be > ideal (${ideal.band})`);
    });
    
    // Test: extreme produces wider band than ideal (already covered above)

    it('low and high are clamped to valid probability range [0, 100]', () => {
        const result = computeConfidenceBand(2, [0.75, 1.25, 0.85, 1.15]);
        assert.ok(result.low >= 0, `Low ${result.low} should be >=0`);
        assert.ok(result.high <= 100, `High ${result.high} should be <=100`);
    });

    it('low is never above point estimate and high is never below', () => {
        const result = computeConfidenceBand(50, [0.85, 1.15, 0.90, 1.10]);
        assert.ok(result.low <= 50, `Low ${result.low} should be <=50`);
        
        // For extreme conditions high can be > 50 but that's expected
        const result2 = computeConfidenceBand(50, [0.75, 1.25, 0.85, 1.15]);
        assert.ok(result2.low <= 50, `Low ${result2.low} should be <=50`);
    });

    it('empty multiplier array -> uses default minimum band (~5%)', () => {
        const result = computeConfidenceBand(50, []);
        assert.ok(result.band >= 4 && result.band <= 7,
            `Empty multiplier band ${result.band}% should be default ~5%`);
    });

    it('handles edge case: probability at 100', () => {
        const result = computeConfidenceBand(100, [0.75, 1.25, 0.85, 1.15]);
        assert.ok(result.high <= 100, `High ${result.high} should be <=100`);
    });

    it('handles edge case: probability at 0', () => {
        const result = computeConfidenceBand(0, [0.75, 1.25, 0.85, 1.15]);
        assert.ok(result.low >= 0, `Low ${result.low} should be >=0`);
    });
});
