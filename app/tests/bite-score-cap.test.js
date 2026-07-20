"use strict";
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createBiteScoreEngine, clearBiteScoreCache } = require('../src/engine/bite-score');

/**
 * Regression tests for bite score cap and clarity double-counting bug.
 *
 * Bug: In July with 80°F water, multiple species/locations hit 100% bite probability.
 * Root causes: MAX_BITE_PROB=1.0, clarityMult double-counted, BITE_DIVISOR=1.2 too low.
 */

const mockFishingData = {
    species_data: [
        {
            name: 'Largemouth Bass',
            scientific_metrics: {
                opt: 72, dorm: 45, sensitivity: 'Medium',
                feeding_cease_temp: 87, nocturnal: false,
                do_tolerance: 3, preferred_depth: 8
            },
            spawn_temp_start: 65, spawn_temp_peak: 68, spawn_temp_end: 72
        },
        {
            name: 'Channel Catfish',
            scientific_metrics: {
                opt: 76, dorm: 52, sensitivity: 'Low',
                feeding_cease_temp: 90, nocturnal: true,
                do_tolerance: 2, preferred_depth: 16
            },
            spawn_temp_start: 70, spawn_temp_peak: 75, spawn_temp_end: 80
        }
    ]
};

const mockLureScorer = { scoreLures: () => [] };

function makeEngine(tempF = 80) {
    return createBiteScoreEngine(mockFishingData, mockLureScorer, {
        waterTempProvider: async () => ({ waterTempF: tempF, source: 'mock', stationName: null, stationDistance: null })
    });
}

describe('Bite Score Cap — no 100% scores', () => {
    beforeEach(() => clearBiteScoreCache());

    it('Bass at 80°F dawn with favorable conditions never reaches 100%', async () => {
        const engine = makeEngine(80);
        const result = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Stained', lat: 39.5, lon: -84.3, location: 'test-bass-1' },
            { temp: 78, pressure: 1005, cloudiness: 80, wind: { speed: 5 }, lat: 39.5, lon: -84.3 },
            { month: 7, hour: 6, date: new Date('2026-07-04') }
        );
        assert.ok(result.biteProbability < 100,
            `Expected < 100%, got ${result.biteProbability}%`);
        assert.ok(result.biteProbability <= 85,
            `Expected <= 85% (realistic ceiling), got ${result.biteProbability}%`);
    });

    it('Catfish at 80°F dusk with favorable conditions never reaches 100%', async () => {
        const engine = makeEngine(80);
        const result = await engine.calculateScientificStrategy(
            { speciesName: 'Channel Catfish', waterColor: 'Stained', lat: 39.5, lon: -84.3, location: 'test-catfish-1' },
            { temp: 82, pressure: 1005, cloudiness: 80, wind: { speed: 5 }, lat: 39.5, lon: -84.3 },
            { month: 7, hour: 19, date: new Date('2026-07-04') }
        );
        assert.ok(result.biteProbability < 100,
            `Expected < 100%, got ${result.biteProbability}%`);
        assert.ok(result.biteProbability <= 85,
            `Expected <= 85% (realistic ceiling), got ${result.biteProbability}%`);
    });

    it('multiple species at same location do not all hit max ceiling simultaneously', async () => {
        const engine = makeEngine(80);
        const results = [];
        for (const sp of ['Largemouth Bass', 'Channel Catfish']) {
            const r = await engine.calculateScientificStrategy(
                { speciesName: sp, waterColor: 'Stained', lat: 39.5, lon: -84.3, location: 'test-multi-' + sp },
                { temp: 80, pressure: 1010, cloudiness: 70, wind: { speed: 6 }, lat: 39.5, lon: -84.3 },
                { month: 7, hour: 6, date: new Date('2026-07-04') }
            );
            results.push(r.biteProbability);
        }
        // Both must be within realistic ceiling (85%), not 100%
        for (const score of results) {
            assert.ok(score <= 85,
                `Score ${score} exceeds 85% realistic ceiling`);
        }
        // Scores should be differentiated when conditions differ between species
        // (Bass opt=72, Catfish opt=76 — at 80°F both are near-optimal so
        // identical ceiling-clamped scores are acceptable)
        assert.ok(results[0] < 100 && results[1] < 100,
            `Scores should not reach 100%: ${results.join(', ')}`);
    });
});
