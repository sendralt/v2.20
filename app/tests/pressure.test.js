"use strict";
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createBiteScoreEngine, clearBiteScoreCache } = require('../src/engine/bite-score');
const { clearPressureCache, recordPressure } = require('../src/engine/pressure-trend');

const mockFishingData = {
    species_data: [{ name: 'Largemouth Bass', scientific_metrics: { opt: 72, dorm: 45 } }]
};

async function mockWaterTempProvider(_lat, _lon, airTempF) {
    return {
        waterTempF: airTempF,
        waterTempC: (airTempF - 32) * 5 / 9,
        source: 'test-fixture',
        stationName: null,
        stationDistance: null
    };
}

function makeEngine() {
    return createBiteScoreEngine(
        mockFishingData,
        { scoreLures: () => [] },
        { waterTempProvider: mockWaterTempProvider }
    );
}

const FIXED_OPTS = { month: 4, hour: 10 };

describe('Pressure Trend-Based Logic', () => {
    let engine;
    beforeEach(() => { clearPressureCache(); clearBiteScoreCache(); engine = makeEngine(); });

    it('rapidly falling trend shows aggressive feed label and boosted bite', async () => {
        const now = Date.now();
        recordPressure('t-fall', 1025, now - 3600000);
        recordPressure('t-fall', 1010, now);
        const result = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear', location: 't-fall' },
            { temp: 72, pressure: 1010 }, FIXED_OPTS
        );
        assert.ok(result.pressureTrend.includes('Rapidly Falling'),
            'Expected Rapidly Falling, got: ' + result.pressureTrend);
        assert.ok(result.pressureTrend.includes('aggressive'),
            'Expected aggressive feed label, got: ' + result.pressureTrend);
        assert.ok(result.biteProbability >= 95,
            'Expected boosted bite >= 95%, got: ' + result.biteProbability);
    });

    it('rapidly rising trend shows post-frontal label and suppressed bite', async () => {
        const now = Date.now();
        recordPressure('t-rise', 1010, now - 3600000);
        recordPressure('t-rise', 1025, now);
        const result = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear', location: 't-rise' },
            { temp: 72, pressure: 1025 }, FIXED_OPTS
        );
        assert.ok(result.pressureTrend.includes('Rapidly Rising'),
            'Expected Rapidly Rising, got: ' + result.pressureTrend);
        assert.ok(result.pressureTrend.includes('tough'),
            'Expected tough conditions label, got: ' + result.pressureTrend);
        assert.ok(result.biteProbability < 60,
            'Expected suppressed bite < 60%, got: ' + result.biteProbability);
    });

    it('single reading shows Unknown trend with reasonable bite', async () => {
        const result = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear' },
            { temp: 72, pressure: 1015 }, FIXED_OPTS
        );
        assert.ok(result.pressureTrend.includes('Unknown'),
            'Expected Unknown with single reading, got: ' + result.pressureTrend);
    });
});

describe('Directional Pressure Ordering', () => {
    let engine;
    beforeEach(() => { clearPressureCache(); clearBiteScoreCache(); engine = makeEngine(); });

    it('low pressure produces HIGHER bite score than normal pressure', async () => {
        const low = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear' },
            { temp: 72, pressure: 1005 }, FIXED_OPTS
        );
        const normal = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear' },
            { temp: 72, pressure: 1015 }, FIXED_OPTS
        );
        assert.ok(low.biteProbability > normal.biteProbability,
            'Low pressure (' + low.biteProbability + '%) should beat normal (' + normal.biteProbability + '%)');
    });

    it('high pressure produces LOWER bite score than normal pressure', async () => {
        const high = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear' },
            { temp: 72, pressure: 1025 }, FIXED_OPTS
        );
        const normal = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear' },
            { temp: 72, pressure: 1015 }, FIXED_OPTS
        );
        assert.ok(high.biteProbability < normal.biteProbability,
            'High pressure (' + high.biteProbability + '%) should be lower than normal (' + normal.biteProbability + '%)');
    });

    it('falling trend bite > stable > rising trend bite', async () => {
        const now = Date.now();
        recordPressure('dir-fall', 1020, now - 3600000);
        recordPressure('dir-fall', 1010, now);
        recordPressure('dir-stable', 1015, now - 3600000);
        recordPressure('dir-stable', 1015, now);
        recordPressure('dir-rise', 1010, now - 3600000);
        recordPressure('dir-rise', 1020, now);

        const falling = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear', location: 'dir-fall' },
            { temp: 72, pressure: 1010 }, FIXED_OPTS
        );
        const stable = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear', location: 'dir-stable' },
            { temp: 72, pressure: 1015 }, FIXED_OPTS
        );
        const rising = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear', location: 'dir-rise' },
            { temp: 72, pressure: 1020 }, FIXED_OPTS
        );
        assert.ok(falling.biteProbability > stable.biteProbability,
            'Falling (' + falling.biteProbability + ') should > stable (' + stable.biteProbability + ')');
        assert.ok(stable.biteProbability > rising.biteProbability,
            'Stable (' + stable.biteProbability + ') should > rising (' + rising.biteProbability + ')');
    });
});

describe('Absolute Pressure Modifier Verification', () => {
    let engine;
    beforeEach(() => { clearPressureCache(); clearBiteScoreCache(); engine = makeEngine(); });

    it('29.70 inHg (1006.21 hPa) -> low pressure boost -> 88%', async () => {
        const result = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear' },
            { temp: 72, pressure: 1006.21 }, FIXED_OPTS
        );
        assert.equal(result.biteProbability, 88, 'Expected 88%, got: ' + result.biteProbability);
    });

    it('29.80 inHg (1009.15 hPa) -> neutral zone -> 83%', async () => {
        const result = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear' },
            { temp: 72, pressure: 1009.15 }, FIXED_OPTS
        );
        assert.equal(result.biteProbability, 83, 'Expected 83%, got: ' + result.biteProbability);
    });

    it('30.00 inHg (1015.91 hPa) -> neutral zone -> 83%', async () => {
        const result = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear' },
            { temp: 72, pressure: 1015.91 }, FIXED_OPTS
        );
        assert.equal(result.biteProbability, 83, 'Expected 83%, got: ' + result.biteProbability);
    });

    it('30.20 inHg (1022.68 hPa) -> neutral zone -> 83%', async () => {
        const result = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear' },
            { temp: 72, pressure: 1022.68 }, FIXED_OPTS
        );
        assert.equal(result.biteProbability, 83, 'Expected 83%, got: ' + result.biteProbability);
    });

    it('30.30 inHg (1026.06 hPa) -> slightly penalized -> 79%', async () => {
        const result = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear' },
            { temp: 72, pressure: 1026.06 }, FIXED_OPTS
        );
        assert.equal(result.biteProbability, 79, 'Expected 79%, got: ' + result.biteProbability);
    });

    it('small API noise causes no cliff-edge jump', async () => {
        const a = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear' },
            { temp: 72, pressure: 1015 }, FIXED_OPTS
        );
        const b = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear' },
            { temp: 72, pressure: 1015.68 }, FIXED_OPTS
        );
        const delta = Math.abs(a.biteProbability - b.biteProbability);
        assert.ok(delta <= 5, '0.02 inHg noise caused ' + delta + '% jump - should be <=5%');
    });
});

describe('Strategy Selection Thresholds', () => {
    let engine;
    beforeEach(() => { clearPressureCache(); clearBiteScoreCache(); engine = makeEngine(); });

    it('selects Reaction strategy when bite > 75%', async () => {
        const result = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear' },
            { temp: 72, pressure: 1005 }, FIXED_OPTS
        );
        assert.equal(result.strategyType, 'Reaction',
            'Expected Reaction, got: ' + result.strategyType + ' (' + result.biteProbability + '%)');
    });

    it('selects Finesse strategy when bite < 35%', async () => {
        const result = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear' },
            { temp: 85, pressure: 1025 }, FIXED_OPTS
        );
        assert.equal(result.strategyType, 'Finesse',
            'Expected Finesse, got: ' + result.strategyType + ' (' + result.biteProbability + '%)');
    });

    it('selects Balanced strategy for moderate bite scores', async () => {
        const result = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear' },
            { temp: 60, pressure: 1015 }, FIXED_OPTS
        );
        assert.equal(result.strategyType, 'Balanced',
            'Expected Balanced, got: ' + result.strategyType + ' (' + result.biteProbability + '%)');
    });
});

describe('Error Fallback (Problem 4)', () => {
    let engine;
    beforeEach(() => { clearPressureCache(); clearBiteScoreCache(); engine = makeEngine(); });

    it('returns explicit error instead of fake 50% on engine failure', async () => {
        const brokenEngine = createBiteScoreEngine(
            mockFishingData,
            { scoreLures: () => { throw new Error('lure catalog failure'); } },
            { waterTempProvider: mockWaterTempProvider }
        );
        const result = await brokenEngine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear' },
            { temp: 72, pressure: 1015 },
            { ...FIXED_OPTS, useLureCatalog: true }
        );
        assert.equal(result.biteProbability, 0, 'Expected 0%, got: ' + result.biteProbability);
        assert.equal(result.biteRank, 'Unavailable');
        assert.equal(result.strategyType, 'Unknown');
        assert.equal(result.engineError, true);
        assert.ok(result.biteReasoning.includes('Scientific engine error'),
            'Expected error message, got: ' + result.biteReasoning);
    });
});

describe('API-Provided Pressure History', () => {
    let engine;
    beforeEach(() => { clearPressureCache(); clearBiteScoreCache(); engine = makeEngine(); });

    it('falling pressure history boosts bite vs no history', async () => {
        const now = Date.now();
        const pressureHistory = [
            { pressure: 1018, timestamp: now - 10800000 },
            { pressure: 1015, timestamp: now - 7200000 },
            { pressure: 1012, timestamp: now - 3600000 }
        ];
        const withHistory = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear', location: 'api-test' },
            { temp: 72, pressure: 1012, pressureHistory }, FIXED_OPTS
        );
        const noHistory = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear', location: 'api-test-nohist' },
            { temp: 72, pressure: 1012 }, FIXED_OPTS
        );
        assert.ok(withHistory.biteProbability > noHistory.biteProbability,
            'With API history (' + withHistory.biteProbability + '%) should beat no history (' + noHistory.biteProbability + '%)');
        assert.ok(withHistory.pressureTrend.includes('Falling'),
            'Expected Falling from API history, got: ' + withHistory.pressureTrend);
    });

    it('rapidly rising pressure history suppresses bite', async () => {
        const now = Date.now();
        const pressureHistory = [
            { pressure: 1010, timestamp: now - 10800000 },
            { pressure: 1015, timestamp: now - 7200000 },
            { pressure: 1020, timestamp: now - 3600000 }
        ];
        const result = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear', location: 'api-rise' },
            { temp: 72, pressure: 1020, pressureHistory }, FIXED_OPTS
        );
        assert.ok(result.pressureTrend.includes('Rapidly Rising'),
            'Expected Rapidly Rising, got: ' + result.pressureTrend);
        assert.ok(result.biteProbability < 60,
            'Expected suppressed bite < 60%, got: ' + result.biteProbability);
    });

    it('seeds in-memory cache when API history is used', async () => {
        const now = Date.now();
        const pressureHistory = [
            { pressure: 1014, timestamp: now - 3600000 },
            { pressure: 1013.5, timestamp: now }
        ];
        await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear', location: 'cache-seed' },
            { temp: 72, pressure: 1013.5, pressureHistory }, FIXED_OPTS
        );
        const { getPressureTrend } = require('../src/engine/pressure-trend');
        const cached = getPressureTrend('cache-seed');
        assert.equal(cached.classification, 'Falling',
            'Cache should be seeded with API history, got: ' + cached.classification);
    });

    it('falls back to in-memory cache when no API history', async () => {
        const now = Date.now();
        recordPressure('fallback-loc', 1018, now - 3600000);
        recordPressure('fallback-loc', 1012, now);
        const result = await engine.calculateScientificStrategy(
            { speciesName: 'Largemouth Bass', waterColor: 'Clear', location: 'fallback-loc' },
            { temp: 72, pressure: 1012 }, FIXED_OPTS
        );
        assert.ok(result.pressureTrend.includes('Falling'),
            'Expected Falling from cache fallback, got: ' + result.pressureTrend);
    });
});
