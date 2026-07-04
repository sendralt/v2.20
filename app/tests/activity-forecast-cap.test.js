"use strict";
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { deriveActivityForecast } = require('../src/engine/activity-forecast');

/**
 * Regression tests for activity forecast cap and clarity double-counting bug.
 *
 * Bug: Activity forecast shares the same formula as bite-score.js and can
 * inflate to 10/10 under favorable July conditions due to the same 3 bugs:
 * BITE_DIVISOR=1.2, MAX_BITE_PROB=1.0, double-counted clarityMult.
 */

const speciesMetrics = {
    opt: 72, dorm: 45, sensitivity: 'Medium',
    feeding_cease_temp: 87, nocturnal: false,
    do_tolerance: 3, preferred_depth: 8
};

const mockFishingData = {
    species_data: [{
        name: 'Largemouth Bass',
        scientific_metrics: speciesMetrics,
        spawn_temp_start: 65, spawn_temp_peak: 68, spawn_temp_end: 72
    }]
};

// Build 12 hours of favorable July hourly data
function makeHourly(basePressure) {
    const hours = [];
    for (let i = 0; i < 12; i++) {
        hours.push({
            hour: (6 + i) % 24,
            pressure: basePressure - i * 0.3, // gently falling
            wind: { speed: 5 },
            cloudiness: 80
        });
    }
    return hours;
}

describe('Activity Forecast Cap — no 10/10 saturation', () => {
    it('Bass at 80°F with favorable conditions does not saturate at 10/10', () => {
        const forecast = deriveActivityForecast({
            currentHour: 6,
            pressureTrend: 'Falling',
            metabolicEfficiency: 0.97,
            hourly: makeHourly(1010),
            waterTemp: 80,
            speciesMetrics,
            clarity: 'Stained',
            speciesName: 'Largemouth Bass',
            fishingData: mockFishingData,
            latitude: 39.5,
            date: new Date('2026-07-04'),
            month: 7
        });

        // No hour should be at max 10/10
        const maxScore = Math.max(...forecast);
        assert.ok(maxScore < 10,
            `Expected max < 10, got ${maxScore} (forecast: ${forecast.join(', ')})`);
    });

    it('Catfish at 80°F with favorable conditions does not saturate at 10/10', () => {
        const catfishMetrics = {
            opt: 76, dorm: 52, sensitivity: 'Low',
            feeding_cease_temp: 90, nocturnal: true,
            do_tolerance: 2, preferred_depth: 16
        };
        const catfishData = {
            species_data: [{
                name: 'Channel Catfish',
                scientific_metrics: catfishMetrics,
                spawn_temp_start: 70, spawn_temp_peak: 75, spawn_temp_end: 80
            }]
        };

        const forecast = deriveActivityForecast({
            currentHour: 19,
            pressureTrend: 'Falling',
            metabolicEfficiency: 0.99,
            hourly: makeHourly(1010),
            waterTemp: 80,
            speciesMetrics: catfishMetrics,
            clarity: 'Stained',
            speciesName: 'Channel Catfish',
            fishingData: catfishData,
            latitude: 39.5,
            date: new Date('2026-07-04'),
            month: 7
        });

        const maxScore = Math.max(...forecast);
        assert.ok(maxScore < 10,
            `Expected max < 10, got ${maxScore} (forecast: ${forecast.join(', ')})`);
    });
});
