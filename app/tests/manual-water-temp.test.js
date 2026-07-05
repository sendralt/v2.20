"use strict";
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createBiteScoreEngine, clearBiteScoreCache } = require('../src/engine/bite-score');

/**
 * Tests for manual water temperature override.
 * Verifies that when manualWaterTemp is provided in engine input,
 * the engine uses it instead of calling the USGS/estimation provider.
 */

const mockFishingData = {
    species_data: [
        {
            name: 'Largemouth Bass',
            scientific_metrics: {
                opt: 65, dorm: 45, sensitivity: 'Medium',
                do_tolerance: 'Moderate', preferred_depth: 10,
                nocturnal: false
            },
            spawn_temp_start: 60, spawn_temp_peak: 65, spawn_temp_end: 72
        }
    ]
};

const mockLureScorer = { scoreLures: () => [] };

// Track whether provider was called
let providerCallCount = 0;
function trackingProvider(tempF) {
    return async () => {
        providerCallCount++;
        return { waterTempF: tempF, source: 'mock', stationName: null, stationDistance: null };
    };
}

function makeEngine(tempF = 68) {
    return createBiteScoreEngine(mockFishingData, mockLureScorer, {
        waterTempProvider: trackingProvider(tempF)
    });
}

const baseInput = {
    speciesName: 'Largemouth Bass',
    waterColor: 'Clear',
    location: 'Test Lake'
};

const baseWeather = {
    temp: 72,
    pressure: 1013,
    wind: { speed: 5 },
    cloudiness: 25
};

const baseOpts = { useLureCatalog: false, month: 7, hour: 12 };

describe('Manual Water Temperature Override', () => {
    beforeEach(() => {
        providerCallCount = 0;
        clearBiteScoreCache();
    });

    it('should use manual temp when provided and skip provider call', async () => {
        const engine = makeEngine(75); // provider would return 75
        const result = await engine.calculateScientificStrategy(
            { ...baseInput, manualWaterTemp: 58 },
            baseWeather,
            baseOpts
        );
        assert.equal(result.waterTemp, 58, 'waterTemp should match manual input');
        assert.equal(result.waterTempSource, 'manual', 'source should be manual');
        assert.equal(providerCallCount, 0, 'provider should NOT be called when manual temp provided');
    });

    it('should fall back to provider when manualWaterTemp is null', async () => {
        const engine = makeEngine(72);
        const result = await engine.calculateScientificStrategy(
            { ...baseInput, manualWaterTemp: null },
            baseWeather,
            baseOpts
        );
        assert.equal(result.waterTempSource, 'mock', 'source should be from provider');
        assert.ok(providerCallCount > 0, 'provider should be called when manual temp is null');
    });

    it('should fall back to provider when manualWaterTemp is undefined', async () => {
        const engine = makeEngine(70);
        const result = await engine.calculateScientificStrategy(
            { ...baseInput }, // no manualWaterTemp key at all
            baseWeather,
            baseOpts
        );
        assert.equal(result.waterTempSource, 'mock', 'source should be from provider');
        assert.ok(providerCallCount > 0, 'provider should be called when manual temp is absent');
    });

    it('should handle different manual temp values correctly', async () => {
        const engine = makeEngine(75);
        const coldResult = await engine.calculateScientificStrategy(
            { ...baseInput, manualWaterTemp: 38 },
            baseWeather,
            baseOpts
        );
        assert.equal(coldResult.waterTemp, 38);
        assert.equal(coldResult.waterTempSource, 'manual');
    });
});
