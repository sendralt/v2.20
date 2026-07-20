"use strict";
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getDayLength, getCivilDawn, getCivilDusk } = require('../src/engine/photoperiod');

/**
 * Photoperiod Model Tests
 *
 * Tests verify solar declination formula for day length, civil dawn, and
 * civil dusk calculations at various latitudes and seasons.
 *
 * [Source: NOAA Solar Calculator — solar declination and hour angle formulas;
 *         Meeus 1998 — Astronomical Algorithms, Ch. 25]
 */
describe('Photoperiod Model', () => {

    describe('Day length at 45°N latitude', () => {
        it('June solstice (Jun 21) → ~15.4 hours', () => {
            const dayLength = getDayLength(45, new Date('2025-06-21T12:00:00Z'));
            assert.ok(dayLength > 15.0 && dayLength < 15.8,
                `June solstice at 45N should be ~15.4h, got ${dayLength.toFixed(2)}h`);
        });

        it('December solstice (Dec 21) → ~8.9 hours', () => {
            const dayLength = getDayLength(45, new Date('2025-12-21T12:00:00Z'));
            assert.ok(dayLength > 8.5 && dayLength < 9.3,
                `December solstice at 45N should be ~8.9h, got ${dayLength.toFixed(2)}h`);
        });

        it('March equinox (Mar 20) → ~12.0 hours', () => {
            const dayLength = getDayLength(45, new Date('2025-03-20T12:00:00Z'));
            assert.ok(dayLength > 11.7 && dayLength < 12.3,
                `Equinox at 45N should be ~12.0h, got ${dayLength.toFixed(2)}h`);
        });

        it('September equinox (Sep 22) → ~12.0 hours', () => {
            const dayLength = getDayLength(45, new Date('2025-09-22T12:00:00Z'));
            assert.ok(dayLength > 11.7 && dayLength < 12.3,
                `Equinox at 45N should be ~12.0h, got ${dayLength.toFixed(2)}h`);
        });
    });

    describe('Day length at different latitudes', () => {
        it('equator (0°) always ~12 hours', () => {
            const june = getDayLength(0, new Date('2025-06-21T12:00:00Z'));
            const december = getDayLength(0, new Date('2025-12-21T12:00:00Z'));
            assert.ok(Math.abs(june - 12.0) < 0.2,
                `Equator in June should be ~12h, got ${june.toFixed(2)}`);
            assert.ok(Math.abs(december - 12.0) < 0.2,
                `Equator in December should be ~12h, got ${december.toFixed(2)}`);
        });

        it('higher latitude has longer summer days', () => {
            const lat30 = getDayLength(30, new Date('2025-06-21T12:00:00Z'));
            const lat50 = getDayLength(50, new Date('2025-06-21T12:00:00Z'));
            assert.ok(lat50 > lat30,
                `50N (${lat50.toFixed(2)}) should have longer summer days than 30N (${lat30.toFixed(2)})`);
        });

        it('higher latitude has shorter winter days', () => {
            const lat30 = getDayLength(30, new Date('2025-12-21T12:00:00Z'));
            const lat50 = getDayLength(50, new Date('2025-12-21T12:00:00Z'));
            assert.ok(lat50 < lat30,
                `50N (${lat50.toFixed(2)}) should have shorter winter days than 30N (${lat30.toFixed(2)})`);
        });

        it('southern hemisphere is inverted (summer in December)', () => {
            const june = getDayLength(-45, new Date('2025-06-21T12:00:00Z'));
            const december = getDayLength(-45, new Date('2025-12-21T12:00:00Z'));
            assert.ok(december > june,
                `Southern hemisphere should have longer days in December (${december.toFixed(2)}) than June (${june.toFixed(2)})`);
        });
    });

    describe('Civil dawn and dusk', () => {
        it('civil dawn is before solar noon (12:00) at 45N', () => {
            const dawn = getCivilDawn(45, new Date('2025-06-21T12:00:00Z'));
            assert.ok(dawn < 12.0,
                `Civil dawn (${dawn.toFixed(2)}) should be before noon`);
            assert.ok(dawn > 0 && dawn < 12,
                `Civil dawn should be 0-12h, got ${dawn.toFixed(2)}`);
        });

        it('civil dusk is after solar noon (12:00) at 45N', () => {
            const dusk = getCivilDusk(45, new Date('2025-06-21T12:00:00Z'));
            assert.ok(dusk > 12.0,
                `Civil dusk (${dusk.toFixed(2)}) should be after noon`);
            assert.ok(dusk > 12 && dusk < 24,
                `Civil dusk should be 12-24h, got ${dusk.toFixed(2)}`);
        });

        it('summer dawn is earlier than winter dawn', () => {
            const summerDawn = getCivilDawn(45, new Date('2025-06-21T12:00:00Z'));
            const winterDawn = getCivilDawn(45, new Date('2025-12-21T12:00:00Z'));
            assert.ok(summerDawn < winterDawn,
                `Summer dawn (${summerDawn.toFixed(2)}) should be earlier than winter dawn (${winterDawn.toFixed(2)})`);
        });

        it('summer dusk is later than winter dusk', () => {
            const summerDusk = getCivilDusk(45, new Date('2025-06-21T12:00:00Z'));
            const winterDusk = getCivilDusk(45, new Date('2025-12-21T12:00:00Z'));
            assert.ok(summerDusk > winterDusk,
                `Summer dusk (${summerDusk.toFixed(2)}) should be later than winter dusk (${winterDusk.toFixed(2)})`);
        });

        it('dawn + dusk bracket daylight hours symmetrically around solar noon', () => {
            const dawn = getCivilDawn(45, new Date('2025-03-20T12:00:00Z'));
            const dusk = getCivilDusk(45, new Date('2025-03-20T12:00:00Z'));
            const midpoint = (dawn + dusk) / 2;
            assert.ok(Math.abs(midpoint - 12.0) < 0.5,
                `Dawn/dusk midpoint (${midpoint.toFixed(2)}) should be ~12.0 (solar noon)`);
        });
    });

    describe('Edge cases', () => {
        it('handles null date (uses current date)', () => {
            const dayLength = getDayLength(45, null);
            assert.ok(dayLength > 0 && dayLength < 24);
        });

        it('day length is always positive', () => {
            // Test extreme latitudes (not polar)
            const dayLength = getDayLength(60, new Date('2025-03-20T12:00:00Z'));
            assert.ok(dayLength > 0, `Day length should always be positive, got ${dayLength}`);
        });

        it('day length never exceeds 24 hours for non-polar latitudes', () => {
            const dayLength = getDayLength(65, new Date('2025-06-21T12:00:00Z'));
            assert.ok(dayLength <= 24, `Day length should not exceed 24h, got ${dayLength}`);
        });
    });
});
