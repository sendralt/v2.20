"use strict";
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getMoonPhase } = require('../src/engine/lunar');

/**
 * Deterministic Lunar Phase Model Tests
 *
 * Tests verify astronomical accuracy against known moon phase dates.
 * Cross-checked with US Naval Observatory and moonphase.is.
 *
 * [Source: Jean Meeus — Astronomical Algorithms, 2nd ed. (1998), Ch. 49]
 */
describe('Deterministic Lunar Phase Model', () => {

    describe('Known moon phase dates (2025)', () => {
        // Verified dates from US Naval Observatory

        it('2025-01-29 is New Moon', () => {
            const result = getMoonPhase(new Date('2025-01-29T12:00:00Z'));
            assert.equal(result.label, 'New Moon');
            assert.ok(result.illumination < 0.05,
                `New Moon illumination should be ~0, got ${result.illumination}`);
        });

        it('2025-02-12 is Full Moon', () => {
            const result = getMoonPhase(new Date('2025-02-12T13:00:00Z'));
            assert.equal(result.label, 'Full Moon');
            assert.ok(result.illumination > 0.95,
                `Full Moon illumination should be ~1, got ${result.illumination}`);
        });

        it('2025-02-05 is First Quarter', () => {
            const result = getMoonPhase(new Date('2025-02-05T07:00:00Z'));
            assert.equal(result.label, 'First Quarter');
            assert.ok(result.illumination > 0.45 && result.illumination < 0.55,
                `First Quarter illumination should be ~0.5, got ${result.illumination}`);
        });

        it('2025-02-20 is Last Quarter', () => {
            const result = getMoonPhase(new Date('2025-02-20T17:00:00Z'));
            assert.equal(result.label, 'Last Quarter');
            assert.ok(result.illumination > 0.45 && result.illumination < 0.55,
                `Last Quarter illumination should be ~0.5, got ${result.illumination}`);
        });
    });

    describe('Phase cycle progression', () => {
        it('waxing crescent appears between New Moon and First Quarter', () => {
            // ~Feb 1, 2025 — between New Moon (Jan 29) and First Quarter (Feb 5)
            const result = getMoonPhase(new Date('2025-02-01T12:00:00Z'));
            assert.equal(result.label, 'Waxing Crescent');
            assert.ok(result.illumination > 0.05 && result.illumination < 0.45,
                `Waxing Crescent illumination 0.05-0.45, got ${result.illumination}`);
        });

        it('waxing gibbous appears between First Quarter and Full Moon', () => {
            // ~Feb 8, 2025 — between First Quarter (Feb 5) and Full Moon (Feb 12)
            const result = getMoonPhase(new Date('2025-02-08T12:00:00Z'));
            assert.equal(result.label, 'Waxing Gibbous');
            assert.ok(result.illumination > 0.55 && result.illumination < 0.95,
                `Waxing Gibbous illumination 0.55-0.95, got ${result.illumination}`);
        });

        it('waning gibbous appears between Full Moon and Last Quarter', () => {
            // ~Feb 16, 2025 — between Full Moon (Feb 12) and Last Quarter (Feb 20)
            const result = getMoonPhase(new Date('2025-02-16T12:00:00Z'));
            assert.equal(result.label, 'Waning Gibbous');
            assert.ok(result.illumination > 0.55 && result.illumination < 0.95,
                `Waning Gibbous illumination 0.55-0.95, got ${result.illumination}`);
        });

        it('waning crescent appears between Last Quarter and New Moon', () => {
            // ~Feb 24, 2025 — between Last Quarter (Feb 20) and next New Moon (Feb 28)
            const result = getMoonPhase(new Date('2025-02-24T12:00:00Z'));
            assert.equal(result.label, 'Waning Crescent');
            assert.ok(result.illumination > 0.05 && result.illumination < 0.45,
                `Waning Crescent illumination 0.05-0.45, got ${result.illumination}`);
        });
    });

    describe('Feeding multiplier (solunar theory)', () => {
        // New Moon and Full Moon are solunar peaks — 1.1x feeding
        // Quarters are minor peaks — 1.0x
        // Intermediate phases — 1.0x
        // [Source: Knight 1936 — solunar theory; Quinn & Brannon 1982]

        it('New Moon feeding multiplier = 1.1', () => {
            const result = getMoonPhase(new Date('2025-01-29T12:00:00Z'));
            assert.equal(result.feedingMultiplier, 1.1);
        });

        it('Full Moon feeding multiplier = 1.1', () => {
            const result = getMoonPhase(new Date('2025-02-12T13:00:00Z'));
            assert.equal(result.feedingMultiplier, 1.1);
        });

        it('First Quarter feeding multiplier = 1.0', () => {
            const result = getMoonPhase(new Date('2025-02-05T07:00:00Z'));
            assert.equal(result.feedingMultiplier, 1.0);
        });

        it('Last Quarter feeding multiplier = 1.0', () => {
            const result = getMoonPhase(new Date('2025-02-20T17:00:00Z'));
            assert.equal(result.feedingMultiplier, 1.0);
        });

        it('crescent/gibbous phases have multiplier 1.0', () => {
            const crescent = getMoonPhase(new Date('2025-02-01T12:00:00Z'));
            const gibbous = getMoonPhase(new Date('2025-02-08T12:00:00Z'));
            assert.equal(crescent.feedingMultiplier, 1.0);
            assert.equal(gibbous.feedingMultiplier, 1.0);
        });
    });

    describe('Return structure', () => {
        it('returns { phase, illumination, feedingMultiplier, label }', () => {
            const result = getMoonPhase(new Date('2025-06-15T12:00:00Z'));
            assert.ok(typeof result.phase === 'number', 'phase should be number (0-7)');
            assert.ok(typeof result.illumination === 'number', 'illumination should be number');
            assert.ok(typeof result.feedingMultiplier === 'number', 'feedingMultiplier should be number');
            assert.ok(typeof result.label === 'string', 'label should be string');
        });

        it('phase is integer 0-7', () => {
            const result = getMoonPhase(new Date('2025-06-15T12:00:00Z'));
            assert.ok(Number.isInteger(result.phase), `phase should be integer, got ${result.phase}`);
            assert.ok(result.phase >= 0 && result.phase <= 7,
                `phase should be 0-7, got ${result.phase}`);
        });

        it('illumination is between 0 and 1', () => {
            const result = getMoonPhase(new Date('2025-06-15T12:00:00Z'));
            assert.ok(result.illumination >= 0 && result.illumination <= 1,
                `illumination should be 0-1, got ${result.illumination}`);
        });

        it('accepts null date (uses current date)', () => {
            const result = getMoonPhase(null);
            assert.ok(typeof result.label === 'string');
            assert.ok(typeof result.illumination === 'number');
        });
    });
});
