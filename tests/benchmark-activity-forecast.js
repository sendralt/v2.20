#!/usr/bin/env node
'use strict';

/**
 * Benchmark: measures variance between hourly activity forecast scores
 * and the main bite-score formula under identical conditions.
 *
 * Output: a single number (lower = better alignment).
 * The number is the mean absolute error (MAE) between:
 *   - Hourly scores scaled to 0-100
 *   - What bite-score.js would produce for the same conditions
 */

const { deriveActivityForecast } = require('../src/engine/activity-forecast');
const { getTimeMultiplier, getWindMultiplier, getCloudMultiplier, getClarityMultiplier, getAbsolutePressureModifier } = require('../src/engine/bite-score');
const { calculateMetabolicEfficiency } = require('../src/engine/metabolic');

// Test scenarios covering diverse conditions
const SCENARIOS = [
    { name: 'Rising pressure, high metabolic', pressure: [1015, 1016, 1017, 1018, 1019, 1020, 1020, 1021, 1021, 1022, 1022, 1023], wind: [5, 5, 6, 7, 5, 4, 5, 6, 7, 5, 4, 5], clouds: [30, 40, 50, 30, 20, 30, 40, 50, 60, 30, 20, 30], waterTemp: 72, clarity: 'Stained', species: { opt: 65, dorm: 45 }, currentHour: 6 },
    { name: 'Falling pressure, moderate metabolic', pressure: [1018, 1017, 1016, 1015, 1014, 1013, 1012, 1012, 1011, 1010, 1010, 1009], wind: [10, 12, 8, 10, 14, 11, 9, 10, 12, 8, 10, 11], clouds: [70, 80, 90, 70, 60, 70, 80, 90, 100, 70, 60, 70], waterTemp: 62, clarity: 'Clear', species: { opt: 65, dorm: 45 }, currentHour: 14 },
    { name: 'Stable pressure, low metabolic', pressure: [1013, 1013, 1013, 1013, 1013, 1014, 1013, 1013, 1013, 1013, 1013, 1014], wind: [2, 3, 2, 1, 2, 3, 2, 1, 2, 3, 2, 1], clouds: [10, 20, 10, 5, 10, 20, 10, 5, 10, 20, 10, 5], waterTemp: 48, clarity: 'Gin Clear', species: { opt: 65, dorm: 45 }, currentHour: 10 },
    { name: 'Rapidly falling, high metabolic, dusk', pressure: [1015, 1013, 1011, 1009, 1008, 1007, 1006, 1006, 1005, 1005, 1004, 1004], wind: [6, 8, 10, 12, 8, 6, 5, 7, 9, 11, 8, 6], clouds: [60, 70, 80, 60, 50, 60, 70, 80, 90, 60, 50, 60], waterTemp: 75, clarity: 'Muddy', species: { opt: 70, dorm: 50 }, currentHour: 17 },
    { name: 'Rapidly rising, low metabolic', pressure: [1005, 1007, 1009, 1011, 1013, 1015, 1017, 1018, 1019, 1020, 1021, 1022], wind: [15, 18, 20, 22, 18, 15, 12, 10, 8, 6, 5, 4], clouds: [40, 50, 30, 40, 50, 30, 40, 50, 30, 40, 50, 30], waterTemp: 50, clarity: 'Stained', species: { opt: 68, dorm: 42 }, currentHour: 8 },
    { name: 'Mixed conditions, dawn', pressure: [1012, 1013, 1013, 1014, 1014, 1013, 1013, 1012, 1012, 1013, 1013, 1014], wind: [3, 5, 7, 4, 6, 8, 5, 3, 5, 7, 4, 6], clouds: [50, 60, 40, 50, 60, 40, 50, 60, 40, 50, 60, 40], waterTemp: 68, clarity: 'Clear', species: { opt: 65, dorm: 45 }, currentHour: 5 },
    { name: 'Very high pressure, cold water', pressure: [1025, 1025, 1026, 1026, 1027, 1027, 1027, 1028, 1028, 1028, 1029, 1029], wind: [2, 2, 3, 2, 2, 3, 2, 2, 3, 2, 2, 3], clouds: [10, 5, 10, 5, 10, 5, 10, 5, 10, 5, 10, 5], waterTemp: 42, clarity: 'Gin Clear', species: { opt: 65, dorm: 45 }, currentHour: 12 },
    { name: 'Low pressure, warm water, night', pressure: [1002, 1001, 1000, 1000, 999, 999, 998, 998, 997, 997, 996, 996], wind: [4, 5, 3, 4, 5, 3, 4, 5, 3, 4, 5, 3], clouds: [90, 95, 100, 90, 95, 100, 90, 95, 100, 90, 95, 100], waterTemp: 78, clarity: 'Muddy', species: { opt: 75, dorm: 55 }, currentHour: 21 }
];

const BITE_DIVISOR = 1.2;

/**
 * Compute what the main bite-score formula would produce for a given hour.
 * Mirrors bite-score.js lines 154-158 exactly (without EMA smoothing).
 */
function computeBiteScoreReference(hour, pressureHpa, windMph, cloudPercent, waterTempF, clarity, speciesMetrics, prevPressureHpa) {
    const metrics = speciesMetrics || { opt: 65, dorm: 45 };
    const metabolicEfficiency = calculateMetabolicEfficiency(waterTempF, metrics) / 100;

    // Pressure trend using the same classifyTrend buckets as bite-score.js
    const delta = prevPressureHpa != null ? pressureHpa - prevPressureHpa : 0;
    let trendLabel;
    if (delta <= -1.5) trendLabel = 'Rapidly Falling';
    else if (delta <= -0.5) trendLabel = 'Falling';
    else if (delta >= 1.5) trendLabel = 'Rapidly Rising';
    else if (delta >= 0.5) trendLabel = 'Rising';
    else trendLabel = 'Stable';

    const TREND_MULTIPLIERS = {
        'Rapidly Falling': 1.25,
        'Falling': 1.15,
        'Stable': 1.0,
        'Rising': 0.85,
        'Rapidly Rising': 0.70,
        'Unknown': 1.0
    };

    const trendMult = TREND_MULTIPLIERS[trendLabel];
    const absMult = getAbsolutePressureModifier(pressureHpa);
    const pressureFactor = trendMult * absMult;

    const windMult = getWindMultiplier(windMph);
    const lightMult = getCloudMultiplier(cloudPercent);
    const timeMult = getTimeMultiplier(hour);
    const clarityMult = getClarityMultiplier(clarity);

    const baseScore = (metabolicEfficiency * pressureFactor) / BITE_DIVISOR;
    const adjustmentFactor = Math.sqrt(windMult * lightMult * timeMult * clarityMult);

    return Math.min(1.0, Math.max(0.01, baseScore * adjustmentFactor)) * 100;
}

// Run benchmark
let totalVariance = 0;
let totalHours = 0;

for (const scenario of SCENARIOS) {
    // Build hourly data for deriveActivityForecast
    const hourly = [];
    for (let i = 0; i < 12; i++) {
        hourly.push({
            hour: (scenario.currentHour + i) % 24,
            pressure: scenario.pressure[i],
            wind: { speed: scenario.wind[i] },
            cloudiness: scenario.clouds[i]
        });
    }

    // Get hourly scores from activity-forecast.js
    const scores = deriveActivityForecast({
        currentHour: scenario.currentHour,
        hourly,
        waterTemp: scenario.waterTemp,
        speciesMetrics: scenario.species,
        clarity: scenario.clarity
    });

    // Compare each hour to what bite-score.js would produce
    for (let i = 0; i < 12; i++) {
        const hourVal = (scenario.currentHour + i) % 24;
        const prevP = i > 0 ? scenario.pressure[i - 1] : null;

        const refScore = computeBiteScoreReference(
            hourVal,
            scenario.pressure[i],
            scenario.wind[i],
            scenario.clouds[i],
            scenario.waterTemp,
            scenario.clarity,
            scenario.species,
            prevP
        );

        const hourlyScaled = scores[i] * 10; // Convert 1-10 to 0-100
        const diff = Math.abs(hourlyScaled - refScore);
        totalVariance += diff;
        totalHours++;
    }
}

const mae = totalVariance / totalHours;
console.log(mae.toFixed(4));
