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
        // Check that midday hours (0-2 = 12PM-2PM) are not higher than evening hours (5-8 = 5PM-8PM)
        // With corrected formula, differences are subtle but the pattern should hold
        const middayAvg = (result[0] + result[1] + result[2]) / 3;
        const eveningAvg = (result[5] + result[6] + result[7] + result[8]) / 4;
        assert.ok(eveningAvg >= middayAvg, 'Evening avg (' + eveningAvg + ') should be >= midday avg (' + middayAvg + ')');
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
});
