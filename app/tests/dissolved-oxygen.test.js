"use strict";
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getDOMultiplier } = require('../src/engine/dissolved-oxygen');

/**
 * Dissolved Oxygen Model Tests
 *
 * DO model estimates oxygen availability using:
 * - Temperature-dependent oxygen solubility (warm water holds less O2)
 * - Wind-driven re-aeration (surface turbulence replenishes O2)
 * - Seasonal biological oxygen demand (summer decomposition consumes O2)
 * - Species-specific DO tolerance thresholds
 *
 * [Source: Weiss 1970 — O2 solubility in water;
 *         EPA 1986 — DO criteria for fish feeding (4 mg/L cutoff, 2 mg/L lethal)]
 */
describe('Dissolved Oxygen Model', () => {

    describe('Wind-driven mixing matrix', () => {
        it('warm summer water + low wind = DO stress (~0.6)', () => {
            // July, 82F, calm (2 mph wind) -> warm water, minimal re-aeration
            const mult = getDOMultiplier(82, 7, 2, { do_tolerance: 4.0 });
            assert.ok(mult >= 0.5 && mult <= 0.7,
                `Warm + still expected 0.5-0.7, got ${mult}`);
        });

        it('cold winter water + windy = full DO (~1.0)', () => {
            // January, 40F, windy (12 mph) -> cold water, excellent mixing
            const mult = getDOMultiplier(40, 1, 12, { do_tolerance: 4.0 });
            assert.equal(mult, 1.0);
        });

        it('wind reduces DO stress in warm water', () => {
            // Same warm water but with good wind -- should be significantly higher
            const calm = getDOMultiplier(82, 7, 2, { do_tolerance: 4.0 });
            const windy = getDOMultiplier(82, 7, 15, { do_tolerance: 4.0 });
            assert.ok(windy > calm + 0.2,
                `Windy DO (${windy}) should be >0.2 higher than calm (${calm})`);
        });

        it('dead calm hot water approaches critical DO', () => {
            // July, 88F, dead calm -> near-critical DO
            const mult = getDOMultiplier(88, 7, 0, { do_tolerance: 4.0 });
            assert.ok(mult <= 0.6,
                `Hot + dead calm expected <= 0.6, got ${mult}`);
        });
    });

    describe('Species-specific DO tolerance', () => {
        it('trout (intolerant) get lower multiplier than default in warm water', () => {
            // Trout need higher DO (~5.5 mg/L) -- more stressed by warm, still water
            const trout = getDOMultiplier(82, 7, 2, { do_tolerance: 5.5 });
            const bass = getDOMultiplier(82, 7, 2, { do_tolerance: 4.0 });
            assert.ok(trout < bass,
                `Trout (${trout}) should be < bass (${bass}) in warm/still water`);
        });

        it('catfish (tolerant) get higher multiplier than default in warm water', () => {
            // Catfish tolerate lower DO (~2.5 mg/L) -- less stressed
            const catfish = getDOMultiplier(82, 7, 2, { do_tolerance: 2.5 });
            const bass = getDOMultiplier(82, 7, 2, { do_tolerance: 4.0 });
            assert.ok(catfish > bass,
                `Catfish (${catfish}) should be > bass (${bass}) in warm/still water`);
        });

        it('missing do_tolerance uses safe default (4.0 mg/L)', () => {
            const withTolerance = getDOMultiplier(82, 7, 2, { do_tolerance: 4.0 });
            const noTolerance = getDOMultiplier(82, 7, 2, {});
            assert.equal(withTolerance, noTolerance);
        });

        it('null speciesMetrics does not crash', () => {
            const mult = getDOMultiplier(70, 6, 8, null);
            assert.ok(typeof mult === 'number' && mult > 0 && mult <= 1.0);
        });
    });

    describe('Optimal and critical DO conditions', () => {
        it('cool water + moderate wind = optimal DO (1.0)', () => {
            // Spring, 55F, 10 mph -> plenty of DO
            const mult = getDOMultiplier(55, 5, 10, { do_tolerance: 4.0 });
            assert.equal(mult, 1.0);
        });

        it('DO multiplier never goes below 0.5', () => {
            // Extreme conditions
            const mult = getDOMultiplier(95, 7, 0, { do_tolerance: 6.0 });
            assert.ok(mult >= 0.5, `Multiplier should not go below 0.5, got ${mult}`);
        });

        it('DO multiplier never exceeds 1.0', () => {
            const mult = getDOMultiplier(35, 1, 25, { do_tolerance: 2.0 });
            assert.ok(mult <= 1.0, `Multiplier should not exceed 1.0, got ${mult}`);
        });
    });

    describe('Seasonal BOD variation', () => {
        it('summer month amplifies DO stress vs same temp in fall', () => {
            // Same temp (80F), same wind (2 mph), but July vs October
            const summer = getDOMultiplier(80, 7, 2, { do_tolerance: 4.0 });
            const fall = getDOMultiplier(80, 10, 2, { do_tolerance: 4.0 });
            assert.ok(summer <= fall,
                `Summer (${summer}) should be <= fall (${fall}) for same temp`);
        });
    });
});
