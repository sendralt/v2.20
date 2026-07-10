'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { deriveActivityForecast } = require('../src/engine/activity-forecast');

describe('Activity Forecast Engine', function() {

    it('returns 12 numbers between 1 and 10', function() {
        const result = deriveActivityForecast({
            currentHour: 6,
            pressureTrend: 'Falling',
            metabolicEfficiency: 0.72
        });
        assert.equal(result.length, 12);
        result.forEach(function(v) {
            assert.ok(typeof v === 'number' && !isNaN(v), 'must be number: ' + v);
            assert.ok(v >= 1 && v <= 10, 'must be 1-10: ' + v);
        });
    });

    it('shows crepuscular peaks (dawn/dusk hours higher)', function() {
        const result = deriveActivityForecast({
            currentHour: 6,
            pressureTrend: 'Stable',
            metabolicEfficiency: 0.7
        });
        assert.ok(result[0] >= 5, 'Dawn hour should be elevated, got: ' + result[0]);
    });

    it('low period at midday when starting from noon', function() {
        const result = deriveActivityForecast({
            currentHour: 12,
            pressureTrend: 'Stable',
            metabolicEfficiency: 0.7
        });
        assert.ok(result[0] <= 5, 'Midday should be low, got: ' + result[0]);
    });

    it('falling pressure produces higher overall scores than rising', function() {
        const falling = deriveActivityForecast({
            currentHour: 6, pressureTrend: 'Falling', metabolicEfficiency: 0.7
        });
        const rising = deriveActivityForecast({
            currentHour: 6, pressureTrend: 'Rising', metabolicEfficiency: 0.7
        });
        const fallingSum = falling.reduce(function(a, b) { return a + b; }, 0);
        const risingSum = rising.reduce(function(a, b) { return a + b; }, 0);
        assert.ok(fallingSum > risingSum, 'Falling (' + fallingSum + ') should exceed rising (' + risingSum + ')');
    });

    it('handles unknown pressure trend gracefully', function() {
        const result = deriveActivityForecast({
            currentHour: 6,
            pressureTrend: 'Unknown',
            metabolicEfficiency: 0.5
        });
        assert.equal(result.length, 12);
        result.forEach(function(v) {
            assert.ok(v >= 1 && v <= 10);
        });
    });

    it('handles missing metabolic efficiency (defaults to 0.5)', function() {
        const result = deriveActivityForecast({
            currentHour: 6,
            pressureTrend: 'Stable'
        });
        assert.equal(result.length, 12);
    });

    it('wraps around midnight correctly', function() {
        const result = deriveActivityForecast({
            currentHour: 22,
            pressureTrend: 'Stable',
            metabolicEfficiency: 0.7
        });
        assert.ok(result[8] >= 5 || result[9] >= 5, 'Should show dawn peak after midnight wrap, got: ' + result[8] + ',' + result[9]);
    });

    it('uses real bite-score formula when hourly data is available', function() {
        const hourly = [];
        for (let i = 0; i < 12; i++) {
            hourly.push({
                temp: 75,
                pressure: 1010 + i * 0.3,
                wind: { speed: 5 },
                cloudiness: 40,
                hour: (6 + i) % 24
            });
        }
        const result = deriveActivityForecast({
            currentHour: 6,
            pressureTrend: 'Rising',
            metabolicEfficiency: 0.7,
            hourly: hourly,
            waterTemp: 72,
            speciesMetrics: { opt: 72, dorm: 45 }
        });
        assert.equal(result.length, 12);
        result.forEach(function(v) {
            assert.ok(typeof v === 'number' && !isNaN(v), 'must be number: ' + v);
            assert.ok(v >= 1 && v <= 10, 'must be 1-10: ' + v);
        });
        const firstHalf = result.slice(0, 6).reduce(function(a, b) { return a + b; }, 0);
        const secondHalf = result.slice(6).reduce(function(a, b) { return a + b; }, 0);
        assert.ok(secondHalf < firstHalf, 'Rising pressure should push scores down: ' + firstHalf + ' vs ' + secondHalf);
    });

    it('uses species-specific metabolic curve when speciesMetrics is provided', function() {
        const hourly = [];
        for (let i = 0; i < 12; i++) {
            hourly.push({
                temp: 75,
                pressure: 1013,
                wind: { speed: 5 },
                cloudiness: 40,
                hour: (6 + i) % 24
            });
        }
        const coldWaterSpecies = deriveActivityForecast({
            currentHour: 6, pressureTrend: 'Stable', metabolicEfficiency: 0.5,
            hourly: hourly, waterTemp: 56, speciesMetrics: { opt: 55, dorm: 35 }
        });
        const warmWaterSpecies = deriveActivityForecast({
            currentHour: 6, pressureTrend: 'Stable', metabolicEfficiency: 0.5,
            hourly: hourly, waterTemp: 56, speciesMetrics: { opt: 76, dorm: 52 }
        });
        const coldSum = coldWaterSpecies.reduce(function(a, b) { return a + b; }, 0);
        const warmSum = warmWaterSpecies.reduce(function(a, b) { return a + b; }, 0);
        assert.ok(coldSum > warmSum, 'Cold-water species near its optimum should score higher: ' + coldSum + ' vs ' + warmSum);
    });

    it('seeds hour-0 pressure trend from pressureHistory instead of forcing Stable', function() {
        const hourly = [];
        for (let i = 0; i < 12; i++) {
            hourly.push({
                temp: 75,
                pressure: 1005,
                wind: { speed: 5 },
                cloudiness: 40,
                hour: (12 + i) % 24
            });
        }
        const base = {
            currentHour: 12, pressureTrend: 'Stable', metabolicEfficiency: 0.7,
            hourly: hourly, waterTemp: 58, speciesMetrics: { opt: 70, dorm: 45 }
        };
        const withFallingHistory = deriveActivityForecast(Object.assign({}, base, {
            pressureHistory: [{ pressure: 1010, timestamp: Date.now() - 3600000 }]
        }));
        const withoutHistory = deriveActivityForecast(Object.assign({}, base, {
            pressureHistory: []
        }));
        assert.ok(withFallingHistory[0] > withoutHistory[0],
            'Hour 0 should reflect the falling trend from pressureHistory: ' + withFallingHistory[0] + ' vs ' + withoutHistory[0]);
    });

    it('anchors fallback path to biteScore when hourly data is missing', function() {
        // Regression: when hourly weather is unavailable, the simplified fallback
        // path must still re-pin hour 0 to anchorScore so the chart bar 1
        // matches the Bite Score shown to the user.
        var anchorScore = 67;
        var result = deriveActivityForecast({
            currentHour: 12,
            pressureTrend: 'Stable',
            metabolicEfficiency: 0.6,
            anchorScore: anchorScore
            // NOTE: no hourly, no waterTemp -> forces fallback path
        });
        assert.equal(result.length, 12, 'must return 12 values');
        var chartValue = Math.round(result[0] * 10);
        assert.ok(Math.abs(chartValue - anchorScore) <= 1,
            'Fallback hour 0 chart value (' + chartValue + ') must match anchorScore (' + anchorScore + ') within +/-1');
    });

    it('fallback anchoring produces progressively shaped chart, not flat', function() {
        // Ensure the anchored fallback still shows time-of-day variation
        var result = deriveActivityForecast({
            currentHour: 6,
            pressureTrend: 'Falling',
            metabolicEfficiency: 0.7,
            anchorScore: 55
        });
        var max = Math.max.apply(null, result);
        var min = Math.min.apply(null, result);
        assert.ok(max - min >= 0.5, 'Chart should show time-of-day variation, not be completely flat (range=' + (max - min) + ')');
    });
});
