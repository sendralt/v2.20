"use strict";
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createBiteScoreEngine, clearBiteScoreCache } = require('../src/engine/bite-score');

/**
 * Engine Integration Tests — Phase 2 Science Modules
 *
 * Verifies that DO, spawning, thermocline, lunar, and photoperiod modules
 * are correctly wired into calculateScientificStrategy() and affect the
 * final bite probability score.
 */

// Minimal fishingData with species metrics for testing
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
        },
        {
            name: 'Walleye',
            scientific_metrics: {
                opt: 58, dorm: 38, sensitivity: 'High',
                do_tolerance: 'High', preferred_depth: 25,
                nocturnal: true
            },
            spawn_temp_start: 42, spawn_temp_peak: 48, spawn_temp_end: 52
        },
        {
            name: 'Channel Catfish',
            scientific_metrics: {
                opt: 75, dorm: 45, sensitivity: 'Low',
                do_tolerance: 'Low', preferred_depth: 15,
                nocturnal: true
            },
            spawn_temp_start: 70, spawn_temp_peak: 78, spawn_temp_end: 84
        }
    ]
};

// Mock lure scorer (no-op)
const mockLureScorer = { scoreLures: () => [] };

// Mock water temp provider — returns fixed temp
function makeWaterTempProvider(tempF) {
    return async () => ({ waterTempF: tempF, source: 'mock', stationName: null, stationDistance: null });
}

function makeEngine(tempF = 68) {
    return createBiteScoreEngine(mockFishingData, mockLureScorer, {
        waterTempProvider: makeWaterTempProvider(tempF)
    });
}

const baseWeather = {
    temp: 70,
    pressure: 1013.25,
    wind: { speed: 8 },
    cloudiness: 30
};

describe('Engine Integration — Phase 2 Science Modules', () => {
    beforeEach(() => clearBiteScoreCache());

    describe('DO multiplier affects score', () => {
        it('warm water + low wind (DO stress) reduces score vs moderate wind', async () => {
            // Use catfish at 78F (near optimal, not heat-stressed) to isolate DO effect.
            // Wind multiplier is held in the adjustment factor but DO penalty applies independently.
            const engine = makeEngine(78);

            // Low wind → DO stress (stagnation deficit = 4.0 mg/L)
            const lowWindResult = await engine.calculateScientificStrategy(
                { speciesName: 'Channel Catfish', waterColor: 'Clear', lat: 45, lon: -90 },
                { ...baseWeather, wind: { speed: 1 } },
                { month: 7, hour: 6 }
            );

            // Moderate wind → no DO stress (stagnation deficit = 0.5 mg/L)
            const modWindResult = await engine.calculateScientificStrategy(
                { speciesName: 'Channel Catfish', waterColor: 'Clear', lat: 45, lon: -90 },
                { ...baseWeather, wind: { speed: 12 } },
                { month: 7, hour: 6 }
            );

            assert.ok(lowWindResult.biteProbability < modWindResult.biteProbability,
                `DO stress (${lowWindResult.biteProbability}) should be lower than no stress (${modWindResult.biteProbability})`);
        });

        it('DO stress more severe for high-tolerance species (walleye vs catfish)', async () => {
            // Use spring month (April) with cool water to avoid thermocline confounding.
            // Both species at same depth (no thermocline in April).
            const engine = makeEngine(72);

            const walleyeResult = await engine.calculateScientificStrategy(
                { speciesName: 'Walleye', waterColor: 'Clear', lat: 45, lon: -90 },
                { ...baseWeather, wind: { speed: 1 } },
                { month: 4, hour: 6 }
            );

            const catfishResult = await engine.calculateScientificStrategy(
                { speciesName: 'Channel Catfish', waterColor: 'Clear', lat: 45, lon: -90 },
                { ...baseWeather, wind: { speed: 1 } },
                { month: 4, hour: 6 }
            );

            // Walleye (High DO tolerance = 5 mg/L) should be penalized more than catfish (Low = 3 mg/L)
            assert.ok(walleyeResult.biteProbability <= catfishResult.biteProbability,
                `Walleye DO stress (${walleyeResult.biteProbability}) should be <= catfish (${catfishResult.biteProbability})`);
        });
    });

    describe('Spawning multiplier affects score', () => {
        it('active spawn (0.4x) suppresses score vs pre-spawn (1.2x) at similar temps', async () => {
            // Both temps near bass metabolic optimum (65F) to isolate spawning effect.
            // 60F = pre-spawn (1.2x boost); 65F = active spawn (0.4x penalty).
            // Pre-spawn should score higher despite 5F cooler water.
            const preSpawnEngine = makeEngine(60);
            const activeSpawnEngine = makeEngine(65);

            const preSpawnResult = await preSpawnEngine.calculateScientificStrategy(
                { speciesName: 'Largemouth Bass', waterColor: 'Clear', lat: 45, lon: -90 },
                baseWeather,
                { month: 4, hour: 6 }
            );

            const activeSpawnResult = await activeSpawnEngine.calculateScientificStrategy(
                { speciesName: 'Largemouth Bass', waterColor: 'Clear', lat: 45, lon: -90 },
                baseWeather,
                { month: 5, hour: 6 }
            );

            assert.ok(preSpawnResult.biteProbability > activeSpawnResult.biteProbability,
                `Pre-spawn 60F/1.2x (${preSpawnResult.biteProbability}) should beat active spawn 65F/0.4x (${activeSpawnResult.biteProbability})`);
        });

        it('pre-spawn boosts score for bass', async () => {
            const preSpawnEngine = makeEngine(60); // Bass pre-spawn start
            const postSpawnEngine = makeEngine(80); // Well past spawn

            const preSpawnResult = await preSpawnEngine.calculateScientificStrategy(
                { speciesName: 'Largemouth Bass', waterColor: 'Clear', lat: 45, lon: -90 },
                baseWeather,
                { month: 4, hour: 6 }
            );

            const postSpawnResult = await postSpawnEngine.calculateScientificStrategy(
                { speciesName: 'Largemouth Bass', waterColor: 'Clear', lat: 45, lon: -90 },
                baseWeather,
                { month: 7, hour: 6 }
            );

            assert.ok(preSpawnResult.biteProbability > postSpawnResult.biteProbability * 0.8,
                `Pre-spawn boost should keep score competitive despite cooler water`);
        });
    });

    describe('Thermocline adjusts deep species temperature', () => {
        it('walleye in summer gets cooler effective temp (thermocline)', async () => {
            const engine = makeEngine(80); // Warm summer surface

            const result = await engine.calculateScientificStrategy(
                { speciesName: 'Walleye', waterColor: 'Clear', lat: 45, lon: -90 },
                { ...baseWeather, wind: { speed: 8 } },
                { month: 7, hour: 6 }
            );

            // Walleye preferred depth is 25ft — thermocline should cool effective temp.
            // With surface 80F, thermocline ~18ft, walleye at 25ft → effective ~55-65F
            // Score should be reasonable (not heat-stressed) despite 80F surface.
            assert.ok(result.biteProbability > 30,
                `Walleye with thermocline cooling should score >30, got ${result.biteProbability}`);
        });

        it('shallow bass unaffected by thermocline in summer', async () => {
            const engine = makeEngine(80);

            const result = await engine.calculateScientificStrategy(
                { speciesName: 'Largemouth Bass', waterColor: 'Clear', lat: 45, lon: -90 },
                { ...baseWeather, wind: { speed: 8 } },
                { month: 7, hour: 6 }
            );

            // Bass at 10ft is above thermocline — uses surface temp
            assert.ok(result.waterTemp === 80,
                `Bass (shallow) should use surface temp 80F, got ${result.waterTemp}`);
        });
    });

    describe('Lunar feeding multiplier affects score', () => {
        it('full moon date boosts score vs quarter moon date', async () => {
            const engine = makeEngine(70);

            // 2025-02-12 = Full Moon (1.1x feeding multiplier)
            const fullMoonResult = await engine.calculateScientificStrategy(
                { speciesName: 'Largemouth Bass', waterColor: 'Clear', lat: 45, lon: -90 },
                baseWeather,
                { month: 2, hour: 6, date: new Date('2025-02-12T12:00:00Z') }
            );

            // 2025-02-16 = Waning Gibbous (1.0x feeding multiplier)
            const quarterResult = await engine.calculateScientificStrategy(
                { speciesName: 'Largemouth Bass', waterColor: 'Clear', lat: 45, lon: -90 },
                baseWeather,
                { month: 2, hour: 6, date: new Date('2025-02-16T12:00:00Z') }
            );

            assert.ok(fullMoonResult.biteProbability >= quarterResult.biteProbability,
                `Full Moon (${fullMoonResult.biteProbability}) should be >= quarter (${quarterResult.biteProbability})`);
        });
    });

    describe('Photoperiod refines time multiplier', () => {
        it('June dawn (5am) gets crepuscular boost at 45N', async () => {
            const engine = makeEngine(68);

            const result = await engine.calculateScientificStrategy(
                { speciesName: 'Largemouth Bass', waterColor: 'Clear', lat: 45, lon: -90 },
                baseWeather,
                { month: 6, hour: 5 }
            );

            // June civil dawn ~4:30 at 45N — 5am is within crepuscular window
            assert.ok(result.biteProbability > 20,
                `June 5am should get crepuscular boost, got ${result.biteProbability}`);
        });

        it('December dawn (7am) still gets boost since true dawn is later', async () => {
            const engine = makeEngine(55);

            const result = await engine.calculateScientificStrategy(
                { speciesName: 'Largemouth Bass', waterColor: 'Clear', lat: 45, lon: -90 },
                baseWeather,
                { month: 12, hour: 7 }
            );

            // December civil dawn ~7:15 at 45N — 7am should still be crepuscular.
            // At 55F water bass is near-dormant but photoperiod boost keeps score >0.
            assert.ok(result.biteProbability > 5,
                `December 7am should get crepuscular boost, got ${result.biteProbability}`);
        });
    });

    describe('Engine still returns complete result structure', () => {
        it('result includes all expected fields', async () => {
            const engine = makeEngine(68);

            const result = await engine.calculateScientificStrategy(
                { speciesName: 'Largemouth Bass', waterColor: 'Clear', lat: 45, lon: -90 },
                baseWeather,
                { month: 6, hour: 6 }
            );

            assert.ok(typeof result.biteProbability === 'number');
            assert.ok(typeof result.biteRank === 'string');
            assert.ok(typeof result.strategyType === 'string');
            assert.ok(typeof result.waterTemp === 'number');
            assert.ok(typeof result.metabolicEfficiency === 'number');
            assert.ok(typeof result.pressureTrend === 'string');
        });
    });
});
