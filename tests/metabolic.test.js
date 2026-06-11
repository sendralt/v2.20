"use strict";
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { calculateMetabolicEfficiency } = require('../src/engine/metabolic');

const BASS = { opt: 72, dorm: 45 }; // T_max = 72 + 13.5 = 85.5

describe('Metabolic Efficiency Model', () => {
    describe('Boundary conditions', () => {
        it('returns 1 at or below dormancy temperature', () => {
            assert.equal(calculateMetabolicEfficiency(45, BASS), 1);
            assert.equal(calculateMetabolicEfficiency(30, BASS), 1);
            assert.equal(calculateMetabolicEfficiency(0, BASS), 1);
        });

        it('returns 100 at optimal temperature', () => {
            assert.equal(calculateMetabolicEfficiency(72, BASS), 100);
        });

        it('returns 1 at or above lethal limit (T_max)', () => {
            // T_max = 72 + (72-45)*0.5 = 85.5
            assert.equal(calculateMetabolicEfficiency(86, BASS), 1);
            assert.equal(calculateMetabolicEfficiency(100, BASS), 1);
        });
    });

    describe('Rising phase (smoothstep curve)', () => {
        it('produces monotonically increasing values from dormancy to optimal', () => {
            let prev = 0;
            for (let t = 45; t <= 72; t++) {
                const val = calculateMetabolicEfficiency(t, BASS);
                assert.ok(val >= prev, `Non-monotonic at ${t}°F: ${val} < ${prev}`);
                prev = val;
            }
        });

        it('stays below 50% at midpoint between dormancy and optimal', () => {
            // Smoothstep x²(3-2x) at x=0.5 = 0.5, so midpoint should be ~50%
            const mid = calculateMetabolicEfficiency(58, BASS); // ~halfway
            assert.ok(mid >= 40 && mid <= 60, `Midpoint should be ~50%, got ${mid}`);
        });
    });

    describe('Crash phase (cubic decay)', () => {
        it('drops rapidly after optimal temperature', () => {
            const atOpt = calculateMetabolicEfficiency(72, BASS);
            const at80 = calculateMetabolicEfficiency(80, BASS);
            const at84 = calculateMetabolicEfficiency(84, BASS);
            assert.ok(atOpt > at80, 'Should decrease after optimal');
            assert.ok(at80 > at84, 'Should continue decreasing');
            assert.ok(at84 < 20, `Should be near-zero before lethal limit, got ${at84}`);
        });
    });

    describe('Edge cases', () => {
        it('returns 50 when opt === dorm (zero range)', () => {
            assert.equal(calculateMetabolicEfficiency(50, { opt: 50, dorm: 50 }), 50);
        });

        it('handles missing metrics with defaults', () => {
            const val = calculateMetabolicEfficiency(65, {});
            assert.ok(val >= 1 && val <= 100, `Should produce valid range, got ${val}`);
        });
    });
});
