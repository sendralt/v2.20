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
        // 6 AM = dawn, should see peak within first few hours
        const result = deriveActivityForecast({
            currentHour: 6,
            pressureTrend: 'Stable',
            metabolicEfficiency: 0.7
        });
        // With absolute normalization, decent conditions produce ~6 at dawn peak
        assert.ok(result[0] >= 5, 'Dawn hour should be elevated, got: ' + result[0]);
    });

    it('low period at midday when starting from noon', function() {
        const result = deriveActivityForecast({
            currentHour: 12,
            pressureTrend: 'Stable',
            metabolicEfficiency: 0.7
        });
        // Hour 0 (12PM) should be low (midday dip)
        assert.ok(result[0] <= 5, 'Midday should be low, got: ' + result[0]);
    });

    it('falling pressure produces higher overall scores than rising', function() {
        const falling = deriveActivityForecast({
            currentHour: 6, pressureTrend: 'Falling', metabolicEfficiency: 0.7
        });
        const rising = deriveActivityForecast({
            currentHour: 6, pressureTrend: 'Rising', metabolicEfficiency: 0.7
        });
        // With absolute normalization, falling pressure genuinely produces higher values
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
            currentHour: 22, // 10 PM → should hit dawn at hour 7-8
            pressureTrend: 'Stable',
            metabolicEfficiency: 0.7
        });
        // With absolute normalization, dawn peak shows as elevated but not guaranteed 10
        assert.ok(result[8] >= 5 || result[9] >= 5, 'Should show dawn peak after midnight wrap, got: ' + result[8] + ',' + result[9]);
    });

    it('uses real bite-score formula when hourly data is available', function() {
        const hourly = [];
        for (let i = 0; i < 12; i++) {
            hourly.push({
                temp: 75,
                pressure: 1010 + i * 0.3, // slowly rising
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
        // With slowly rising pressure, scores should generally trend downward
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
        // Water temp of 56F is near-optimal for a cold-water species (opt:55)
        // but well below dormancy for a warm-water species (dorm:52).
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
                pressure: 1005, // flat going forward
                wind: { speed: 5 },
                cloudiness: 40,
                hour: (6 + i) % 24
            });
        }
        const base = {
            currentHour: 6, pressureTrend: 'Stable', metabolicEfficiency: 0.7,
            hourly: hourly, waterTemp: 70, speciesMetrics: { opt: 70, dorm: 45 }
        };
        // A sharp recent drop into the forecast's flat starting pressure should
        // boost hour 0 via the "Rapidly Falling" trend multiplier.
        const withFallingHistory = deriveActivityForecast(Object.assign({}, base, {
            pressureHistory: [{ pressure: 1010, timestamp: Date.now() - 3600000 }]
        }));
        const withoutHistory = deriveActivityForecast(Object.assign({}, base, {
            pressureHistory: []
        }));
        assert.ok(withFallingHistory[0] > withoutHistory[0],
            'Hour 0 should reflect the falling trend from pressureHistory: ' + withFallingHistory[0] + ' vs ' + withoutHistory[0]);
    });
});
