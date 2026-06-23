"use strict";
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { calculateMetabolicEfficiency } = require('../src/engine/metabolic');

/**
 * Test metrics use Largemouth Bass values.
 * T_opt = 72°F, T_dorm = 45°F, feeding_cease_temp = 87°F.
 * [Source: Carlander 1977 — LMB peak feeding 72-80°F; feeding cessation ~87°F,
 * well below UILT/CTMax of ~99°F. This is a feeding prediction model, not survival.]
 */
const BASS = { opt: 72, dorm: 45, feeding_cease_temp: 87 };

describe('Metabolic Efficiency Model — Plateau Curve', () => {
    describe('Boundary conditions', () => {
        it('returns 1 at or below dormancy temperature', () => {
            assert.equal(calculateMetabolicEfficiency(45, BASS), 1);
            assert.equal(calculateMetabolicEfficiency(30, BASS), 1);
            assert.equal(calculateMetabolicEfficiency(0, BASS), 1);
        });

        it('returns 100 at optimal temperature', () => {
            assert.equal(calculateMetabolicEfficiency(72, BASS), 100);
        });

        it('returns 1 at or above feeding cessation temperature (NOT UILT/CTMax)', () => {
            // T_cease = 87°F — species-specific feeding cessation, not lethal limit (~99°F)
            assert.equal(calculateMetabolicEfficiency(87, BASS), 1);
            assert.equal(calculateMetabolicEfficiency(99, BASS), 1);
        });
    });

    describe('Rising phase (smoothstep curve — unchanged)', () => {
        it('produces monotonically increasing values from dormancy to optimal', () => {
            let prev = 0;
            for (let t = 45; t <= 72; t++) {
                const val = calculateMetabolicEfficiency(t, BASS);
                assert.ok(val >= prev, `Non-monotonic at ${t}°F: ${val} < ${prev}`);
                prev = val;
            }
        });

        it('stays near 50% at midpoint between dormancy and optimal', () => {
            // Smoothstep x²(3-2x) at x=0.5 = 0.5, so midpoint should be ~50%
            const mid = calculateMetabolicEfficiency(58, BASS);
            assert.ok(mid >= 40 && mid <= 60, `Midpoint should be ~50%, got ${mid}`);
        });
    });

    describe('Plateau phase (T_opt to T_opt+8°F)', () => {
        it('maintains >=80% efficiency across the plateau zone (72-80°F)', () => {
            // Plateau model replaces cubic decay: efficiency holds at ~97-100%
            // from T_opt through a broad peak zone.
            // [Source: Fry 1971; Brett 1971 — thermal performance curves show
            //  broad plateau, not sharp peak]
            for (let t = 72; t <= 80; t++) {
                const val = calculateMetabolicEfficiency(t, BASS);
                assert.ok(val >= 80, `Plateau at ${t}°F should be >=80%, got ${val}%`);
            }
        });

        it('LMB at 78°F returns >80% efficiency (was 17% with cubic decay)', () => {
            // 78°F is within the peak feeding zone for LMB. The old cubic decay
            // incorrectly crashed to 17% here. The plateau model maintains ~98%.
            const val = calculateMetabolicEfficiency(78, BASS);
            assert.ok(val > 80, `LMB at 78°F (peak feeding temp) should be >80%, got ${val}%`);
        });

        it('plateau zone is monotonically non-increasing (gentle dip only)', () => {
            let prev = 101;
            for (let t = 72; t <= 80; t++) {
                const val = calculateMetabolicEfficiency(t, BASS);
                assert.ok(val <= prev, `Plateau should not increase at ${t}°F: ${val} > ${prev}`);
                prev = val;
            }
        });
    });

    describe('Decay phase (gradual decline after plateau to feeding cessation)', () => {
        it('LMB at 85°F outputs ~20-30% efficiency (gradual, not catastrophic crash)', () => {
            // With plateau model: 85°F is in the decay zone (80→87°F).
            // The old cubic decay produced ~0% here, which is unrealistic —
            // LMB still feed at reduced rates at 85°F.
            const val = calculateMetabolicEfficiency(85, BASS);
            assert.ok(val >= 15 && val <= 40, `85°F should be ~20-30%, got ${val}%`);
        });

        it('decay is monotonically decreasing from plateau end to feeding cessation', () => {
            let prev = 101;
            for (let t = 80; t <= 87; t++) {
                const val = calculateMetabolicEfficiency(t, BASS);
                assert.ok(val <= prev, `Decay should decrease at ${t}°F: ${val} > ${prev}`);
                prev = val;
            }
        });
    });

    describe('Backward compatibility (fallback feeding_cease_temp)', () => {
        it('falls back to opt + (opt-dorm)*0.5 when feeding_cease_temp is missing', () => {
            // Old-style metrics without feeding_cease_temp — backward compatible
            const oldMetrics = { opt: 72, dorm: 45 };
            // T_cease = 72 + (72-45)*0.5 = 85.5°F
            // 86°F >= 85.5 → feeding cessation
            assert.equal(calculateMetabolicEfficiency(86, oldMetrics), 1);
            // 85°F < 85.5 → still in decay zone, not yet at cessation
            const val85 = calculateMetabolicEfficiency(85, oldMetrics);
            assert.ok(val85 > 1, `85°F should be >1% with fallback T_cease=85.5, got ${val85}`);
            // At 84 should also be in decay zone
            const val84 = calculateMetabolicEfficiency(84, oldMetrics);
            assert.ok(val84 > 1, `84°F should be >1% with fallback T_cease=85.5, got ${val84}`);
        });

        it('handles completely missing metrics with defaults (opt=72, dorm=45)', () => {
            const val = calculateMetabolicEfficiency(65, {});
            assert.ok(val >= 1 && val <= 100, `Should produce valid range, got ${val}`);
        });
    });

    describe('Edge cases', () => {
        it('returns 50 when opt === dorm (zero range)', () => {
            assert.equal(calculateMetabolicEfficiency(50, { opt: 50, dorm: 50 }), 50);
        });
    });
});
