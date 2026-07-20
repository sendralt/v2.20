'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { deriveActivityForecast } = require('../src/engine/activity-forecast');
const { createBiteScoreEngine, clearBiteScoreCache } = require('../src/engine/bite-score');

/**
 * Formula Parity Test
 *
 * Guards against formula drift between the hourly activity forecast engine
 * (activity-forecast.js) and the main bite-score engine (bite-score.js).
 *
 * The hourly chart's computeHourlyBiteProb MUST use the same formula components
 * as calculateScientificStrategy. If a factor is added to bite-score.js but
 * not to activity-forecast.js, the chart shape will diverge from the forecast
 * notes — exactly the bug this test prevents.
 *
 * Regression: commit 1d85caf added windChillFactor + photoperiod to
 * activity-forecast.js to fix this drift. This test ensures they stay in sync.
 */

// Mock water temp provider — avoids USGS API dependency in tests
function mockWaterTempProvider(lat, lon, airTemp, month) {
    return { waterTempF: airTemp - 3, source: 'mock', stationName: null, stationDistance: null };
}

const lureScorer = { scoreLures: () => [] };

const fishingData = {
    species_data: [
        {
            name: 'Largemouth Bass',
            scientific_metrics: { opt: 78, dorm: 50, sensitivity: 'Medium', nocturnal: false, preferred_depth: 10 },
            spawn_temp_start: 60, spawn_temp_peak: 65, spawn_temp_end: 72
        },
        {
            name: 'Walleye',
            scientific_metrics: { opt: 65, dorm: 40, sensitivity: 'High', nocturnal: true, preferred_depth: 20 },
            spawn_temp_start: 44, spawn_temp_peak: 50, spawn_temp_end: 55
        },
        {
            name: 'Rainbow Trout',
            scientific_metrics: { opt: 58, dorm: 38, sensitivity: 'High', nocturnal: false, preferred_depth: 25 },
            spawn_temp_start: 50, spawn_temp_peak: 55, spawn_temp_end: 60
        }
    ]
};

function buildHourlyWeather(currentHour, basePressure) {
    return Array.from({ length: 12 }, function(_, i) {
        return {
            hour: (currentHour + i) % 24,
            pressure: basePressure - i * 0.5,
            wind: { speed: 8, direction: 180 },
            cloudiness: 40,
            timestamp: Date.now() + i * 3600000
        };
    });
}

async function runBothEngines(speciesName, weather, options) {
    clearBiteScoreCache();
    const engine = createBiteScoreEngine(fishingData, lureScorer, { waterTempProvider: mockWaterTempProvider });
    const sciData = await engine.calculateScientificStrategy(
        { speciesName, waterColor: 'Clear', location: 'parity-test', lat: weather.lat, lon: weather.lon, manualWaterTemp: weather.temp - 3 },
        weather,
        { useLureCatalog: false, hour: options.hour, month: options.month, date: options.date }
    );
    const forecast = deriveActivityForecast({
        currentHour: options.hour,
        pressureTrend: sciData.pressureTrend,
        metabolicEfficiency: sciData.metabolicEfficiency / 100,
        hourly: weather.hourly || [],
        pressureHistory: weather.pressureHistory || [],
        waterTemp: sciData.waterTemp,
        speciesMetrics: sciData.speciesMetrics,
        clarity: 'Clear',
        speciesName,
        fishingData,
        latitude: weather.lat,
        month: options.month,
        date: options.date,
        anchorScore: sciData.biteProbability
    });
    return { sciData, forecast };
}

describe('Formula Parity: activity-forecast vs bite-score engine', function() {

    it('hour 0 matches bite probability for Largemouth Bass (warm water, calm conditions)', async function() {
        const weather = {
            temp: 75, pressure: 1013, wind: { speed: 5, direction: 180 },
            cloudiness: 30, lat: 45, lon: -93,
            hourly: buildHourlyWeather(14, 1013)
        };
        const { sciData, forecast } = await runBothEngines('Largemouth Bass', weather, { hour: 14, month: 7, date: new Date('2025-07-15') });
        const hour0Scaled = Math.round(forecast[0] * 10);
        assert.ok(
            Math.abs(sciData.biteProbability - hour0Scaled) <= 1,
            'Hour 0 (' + hour0Scaled + ') should match bite probability (' + sciData.biteProbability + ') within ±1'
        );
    });

    it('hour 0 matches bite probability for Walleye (cold water, nocturnal)', async function() {
        const weather = {
            temp: 52, pressure: 1008, wind: { speed: 12, direction: 270 },
            cloudiness: 70, lat: 46, lon: -94,
            hourly: buildHourlyWeather(5, 1008)
        };
        const { sciData, forecast } = await runBothEngines('Walleye', weather, { hour: 5, month: 5, date: new Date('2025-05-15') });
        const hour0Scaled = Math.round(forecast[0] * 10);
        assert.ok(
            Math.abs(sciData.biteProbability - hour0Scaled) <= 1,
            'Hour 0 (' + hour0Scaled + ') should match bite probability (' + sciData.biteProbability + ') within ±1'
        );
    });

    it('hour 0 matches bite probability for Rainbow Trout (cold water species)', async function() {
        const weather = {
            temp: 58, pressure: 1015, wind: { speed: 6, direction: 90 },
            cloudiness: 50, lat: 44, lon: -92,
            hourly: buildHourlyWeather(7, 1015)
        };
        const { sciData, forecast } = await runBothEngines('Rainbow Trout', weather, { hour: 7, month: 6, date: new Date('2025-06-15') });
        const hour0Scaled = Math.round(forecast[0] * 10);
        assert.ok(
            Math.abs(sciData.biteProbability - hour0Scaled) <= 1,
            'Hour 0 (' + hour0Scaled + ') should match bite probability (' + sciData.biteProbability + ') within ±1'
        );
    });

    it('hour 0 matches bite probability with falling pressure trend', async function() {
        const weather = {
            temp: 72, pressure: 1005, wind: { speed: 10, direction: 200 },
            cloudiness: 80, lat: 45, lon: -93,
            hourly: buildHourlyWeather(10, 1005),
            pressureHistory: [
                { pressure: 1015, timestamp: Date.now() - 7200000 },
                { pressure: 1010, timestamp: Date.now() - 3600000 },
                { pressure: 1005, timestamp: Date.now() }
            ]
        };
        const { sciData, forecast } = await runBothEngines('Largemouth Bass', weather, { hour: 10, month: 8, date: new Date('2025-08-10') });
        const hour0Scaled = Math.round(forecast[0] * 10);
        assert.ok(
            Math.abs(sciData.biteProbability - hour0Scaled) <= 1,
            'Hour 0 (' + hour0Scaled + ') should match bite probability (' + sciData.biteProbability + ') within ±1'
        );
    });

    it('hour 0 matches bite probability with strong wind + cold water (windChillFactor active)', async function() {
        const weather = {
            temp: 48, pressure: 1013, wind: { speed: 22, direction: 315 },
            cloudiness: 60, lat: 47, lon: -95,
            hourly: buildHourlyWeather(8, 1013)
        };
        const { sciData, forecast } = await runBothEngines('Rainbow Trout', weather, { hour: 8, month: 4, date: new Date('2025-04-10') });
        const hour0Scaled = Math.round(forecast[0] * 10);
        // Wind chill factor should reduce both engines equally — if it's missing from
        // the hourly engine, the chart hour 0 would be HIGHER than the bite score.
        assert.ok(
            Math.abs(sciData.biteProbability - hour0Scaled) <= 1,
            'Hour 0 (' + hour0Scaled + ') should match bite probability (' + sciData.biteProbability + ') within ±1 — windChillFactor must be present in both engines'
        );
    });

    it('hour 0 matches bite probability at dawn (photoperiod refinement active)', async function() {
        // 6 AM in July at lat 45 — should be within ±1.5h of civil dawn
        const weather = {
            temp: 70, pressure: 1013, wind: { speed: 4, direction: 180 },
            cloudiness: 25, lat: 45, lon: -93,
            hourly: buildHourlyWeather(6, 1013)
        };
        const { sciData, forecast } = await runBothEngines('Largemouth Bass', weather, { hour: 6, month: 7, date: new Date('2025-07-15') });
        const hour0Scaled = Math.round(forecast[0] * 10);
        assert.ok(
            Math.abs(sciData.biteProbability - hour0Scaled) <= 1,
            'Hour 0 (' + hour0Scaled + ') should match bite probability (' + sciData.biteProbability + ') within ±1 — photoperiod refinement must be present in both engines'
        );
    });

    it('forecast produces 12 values between 1 and 10', async function() {
        const weather = {
            temp: 72, pressure: 1013, wind: { speed: 8, direction: 180 },
            cloudiness: 40, lat: 45, lon: -93,
            hourly: buildHourlyWeather(12, 1013)
        };
        const { forecast } = await runBothEngines('Largemouth Bass', weather, { hour: 12, month: 7, date: new Date('2025-07-15') });
        assert.equal(forecast.length, 12);
        forecast.forEach(function(v) {
            assert.ok(typeof v === 'number' && !isNaN(v), 'must be number: ' + v);
            assert.ok(v >= 1 && v <= 10, 'must be 1-10: ' + v);
        });
    });

    it('curve shape is not flat — shows variation across hours', async function() {
        const weather = {
            temp: 72, pressure: 1013, wind: { speed: 6, direction: 180 },
            cloudiness: 40, lat: 45, lon: -93,
            hourly: buildHourlyWeather(6, 1013)
        };
        const { forecast } = await runBothEngines('Largemouth Bass', weather, { hour: 6, month: 7, date: new Date('2025-07-15') });
        const max = Math.max.apply(null, forecast);
        const min = Math.min.apply(null, forecast);
        assert.ok(max - min >= 1, 'Forecast should show variation (max=' + max + ', min=' + min + ') — flat curve suggests missing formula factors');
    });
});
