"use strict";
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getThermoclineDepth, getEffectiveTemp } = require('../src/engine/thermocline');

/**
 * Thermocline Depth Estimation Tests
 *
 * Thermocline forms in stratified lakes during summer/fall when surface
 * temperatures exceed ~68°F. The thermocline depth depends on latitude,
 * wind-driven mixing, and surface temperature.
 *
 * [Source: Wetzel 2001 — Limnology: Lake and River Ecosystems;
 *         Hutchinson 1957 — A Treatise on Limnology]
 */
describe('Thermocline Depth Model', () => {

    describe('Seasonal stratification', () => {
        it('returns null in winter (January, cold water)', () => {
            const depth = getThermoclineDepth(45, 1, 35, 5);
            assert.equal(depth, null);
        });

        it('returns null in spring (April, cool water)', () => {
            const depth = getThermoclineDepth(45, 4, 55, 5);
            assert.equal(depth, null);
        });

        it('returns depth in summer (July, warm water)', () => {
            const depth = getThermoclineDepth(45, 7, 80, 5);
            assert.ok(depth !== null, 'Should return a depth in summer with warm water');
            assert.ok(depth >= 12 && depth <= 30,
                `Summer thermocline should be 12-30 ft, got ${depth}`);
        });

        it('returns depth in early fall (September, warm water)', () => {
            const depth = getThermoclineDepth(45, 9, 72, 5);
            assert.ok(depth !== null, 'Should return a depth in early fall');
        });

        it('returns null when surface temp below 68F in summer', () => {
            // No stratification if water never warms enough
            const depth = getThermoclineDepth(45, 7, 60, 5);
            assert.equal(depth, null);
        });

        it('returns null in late fall (November) as turnover begins', () => {
            const depth = getThermoclineDepth(45, 11, 48, 5);
            assert.equal(depth, null);
        });
    });

    describe('Latitude effects', () => {
        it('higher latitude → shallower thermocline', () => {
            // Northern lakes (higher lat) have shallower thermoclines due to
            // shorter warming season and less solar input
            const northern = getThermoclineDepth(50, 7, 80, 5);
            const southern = getThermoclineDepth(30, 7, 80, 5);
            assert.ok(northern < southern,
                `Northern (${northern}) should be < southern (${southern})`);
        });

        it('moderate latitude produces moderate depth (~18ft)', () => {
            const depth = getThermoclineDepth(42, 7, 78, 5);
            assert.ok(depth >= 14 && depth <= 24,
                `Mid-latitude thermocline should be 14-24 ft, got ${depth}`);
        });
    });

    describe('Wind mixing effects', () => {
        it('sustained wind >15 mph deepens the thermocline', () => {
            const calm = getThermoclineDepth(45, 7, 80, 5);
            const windy = getThermoclineDepth(45, 7, 80, 18);
            assert.ok(windy > calm,
                `Windy thermocline (${windy}) should be deeper than calm (${calm})`);
        });

        it('calm conditions produce shallower thermocline', () => {
            const depth = getThermoclineDepth(45, 7, 80, 2);
            assert.ok(depth >= 12 && depth <= 20,
                `Calm thermocline should be 12-20 ft, got ${depth}`);
        });
    });

    describe('getEffectiveTemp', () => {
        it('returns surface temp when thermocline is null (no stratification)', () => {
            const effective = getEffectiveTemp(80, null, 25);
            assert.equal(effective, 80);
        });

        it('returns surface temp when species depth is in epilimnion (above thermocline)', () => {
            // Thermocline at 18ft, species at 10ft → in warm surface layer
            const effective = getEffectiveTemp(82, 18, 10);
            assert.ok(effective >= 80,
                `Shallow species in epilimnion should get ~surface temp, got ${effective}`);
        });

        it('returns cooler temp when species depth is below thermocline (hypolimnion)', () => {
            // Thermocline at 18ft, species at 30ft → in cold bottom layer
            const effective = getEffectiveTemp(82, 18, 30);
            assert.ok(effective < 72,
                `Deep species in hypolimnion should get cooler temp, got ${effective}`);
            assert.ok(effective >= 50,
                `Hypolimnion temp should not be absurdly cold, got ${effective}`);
        });

        it('blends temperature at thermocline boundary', () => {
            // Species exactly at thermocline depth
            const effective = getEffectiveTemp(80, 18, 18);
            assert.ok(effective > 60 && effective < 80,
                `At-thermocline should blend, got ${effective}`);
        });

        it('deeper thermocline means warmer hypolimnion (more gradual gradient)', () => {
            const shallowTC = getEffectiveTemp(82, 14, 30);
            const deepTC = getEffectiveTemp(82, 24, 30);
            assert.ok(deepTC >= shallowTC,
                `Deeper thermocline should produce warmer hypolimnion (${deepTC} >= ${shallowTC})`);
        });

        it('handles null windMph gracefully', () => {
            const depth = getThermoclineDepth(45, 7, 80, null);
            assert.ok(depth !== null && depth >= 12 && depth <= 30,
                `Null wind should still produce valid depth, got ${depth}`);
        });
    });
});
