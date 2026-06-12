'use strict';

// Reuse existing multiplier functions from bite-score engine
const { getTimeMultiplier, getWindMultiplier, getCloudMultiplier, getClarityMultiplier, getAbsolutePressureModifier } = require('./bite-score');
const { calculateMetabolicEfficiency } = require('./metabolic');

// Constants matching bite-score.js
const BITE_DIVISOR = 1.2;
const MIN_BITE_PROB = 0.01;
const MAX_BITE_PROB = 1.0;

const TREND_MULTIPLIERS = {
    'Rapidly Falling': 1.25,
    'Falling': 1.15,
    'Stable': 1.0,
    'Rising': 0.85,
    'Rapidly Rising': 0.70,
    'Unknown': 1.0
};

/**
 * Classify pressure trend from hourly delta (hPa per hour).
 */
function classifyTrend(deltaHpa) {
    if (deltaHpa <= -1.5) return 'Rapidly Falling';
    if (deltaHpa <= -0.5) return 'Falling';
    if (deltaHpa >= 1.5) return 'Rapidly Rising';
    if (deltaHpa >= 0.5) return 'Rising';
    return 'Stable';
}

/**
 * Compute a single hour's bite probability using the real bite-score formula.
 * Mirrors bite-score.js:154-158 without EMA smoothing or async water temp lookup.
 */
function computeHourlyBiteProb(hour, pressureHpa, windMph, cloudPercent, waterTempF, speciesMetrics, prevPressureHpa, clarity) {
    const metrics = speciesMetrics || { opt: 65, dorm: 45 };
    const metabolicEfficiency = calculateMetabolicEfficiency(waterTempF, metrics) / 100;

    const delta = prevPressureHpa != null ? pressureHpa - prevPressureHpa : 0;
    let trendLabel;
    if (delta <= -1.5) trendLabel = 'Rapidly Falling';
    else if (delta <= -0.5) trendLabel = 'Falling';
    else if (delta >= 1.5) trendLabel = 'Rapidly Rising';
    else if (delta >= 0.5) trendLabel = 'Rising';
    else trendLabel = 'Stable';

    const TREND_MULT = { 'Rapidly Falling': 1.25, 'Falling': 1.15, 'Stable': 1.0, 'Rising': 0.85, 'Rapidly Rising': 0.70 };
    const absMult = getAbsolutePressureModifier(pressureHpa);
    const pressureFactor = TREND_MULT[trendLabel] * absMult;

    // Multi-factor adjustment
    const windMult = getWindMultiplier(windMph);
    const lightMult = getCloudMultiplier(cloudPercent);
    const timeMult = getTimeMultiplier(hour);
    const clarityMult = getClarityMultiplier(clarity || 'Clear');

    const baseScore = (metabolicEfficiency * pressureFactor) / BITE_DIVISOR;
    // Match bite-score.js: use 4th root (x^0.25) to dampen environmental factors
    const adjustmentFactor = Math.sqrt(Math.sqrt(windMult * lightMult * timeMult * clarityMult));

    return Math.min(MAX_BITE_PROB, Math.max(MIN_BITE_PROB, baseScore * adjustmentFactor));
}

/**
 * Derive 12-hour activity forecast.
 *
 * If `params.hourly` is provided (from Open-Meteo), runs the real bite-score
 * formula per hour using forecasted temp, pressure, wind, and clouds.
 * Otherwise falls back to the simplified time×trend×metabolic composite.
 *
 * @param {Object} params
 * @param {number} params.currentHour - Current hour (0-23)
 * @param {string} params.pressureTrend - Trend label (fallback path only)
 * @param {number} params.metabolicEfficiency - 0-1 (fallback path only)
 * @param {Array}  [params.hourly] - Hourly weather objects from Open-Meteo
 * @param {number} [params.waterTemp] - Water temp °F (real-formula path)
 * @param {Object} [params.speciesMetrics] - {opt, dorm} (real-formula path)
 * @returns {number[]} Array of 12 integers (1-10) for next 12 hours
 */
function deriveActivityForecast(params) {
    const { currentHour, pressureTrend, metabolicEfficiency, hourly, waterTemp, speciesMetrics, clarity } = params;

    // Real-formula path: use forecasted hourly weather data
    if (hourly && hourly.length >= 2 && waterTemp != null) {
        const scores = [];
        for (let i = 0; i < Math.min(12, hourly.length); i++) {
            const h = hourly[i];
            const prevPressure = i > 0 ? hourly[i - 1].pressure : null;
            const prob = computeHourlyBiteProb(
                h.hour != null ? h.hour : (currentHour + i) % 24,
                h.pressure,
                h.wind?.speed,
                h.cloudiness,
                waterTemp,
                speciesMetrics,
                prevPressure,
                clarity
            );
            scores.push(Math.max(0, Math.min(10, prob * 10)));
        }
        // Pad with last score if fewer than 12 hours available
        while (scores.length < 12) scores.push(scores[scores.length - 1] || 5);

        // Apply temporal smoothing (mirrors EMA concept from bite-score.js)
        // Fish behavior doesn't change instantly — blend each hour with its neighbors
        const smoothed = scores.map(function(score, i) {
            if (i === 0) return (scores[0] * 0.6 + scores[1] * 0.4);
            if (i === scores.length - 1) return (scores[i] * 0.6 + scores[i - 1] * 0.4);
            return scores[i - 1] * 0.2 + scores[i] * 0.6 + scores[i + 1] * 0.2;
        });

        return smoothed.map(function(v) { return Math.round(v * 10) / 10; });
    }

    // Fallback path: use same baseScore × adjustment structure as main engine
    const trendMult = TREND_MULTIPLIERS[pressureTrend] || 1.0;
    const absMult = 1.0; // No absolute pressure data in fallback
    const pressureFactor = trendMult * absMult;
    const meta = metabolicEfficiency || 0.5;

    const scores = [];
    for (let i = 0; i < 12; i++) {
        const hour = (currentHour + i) % 24;
        const timeMult = getTimeMultiplier(hour);
        // Match main engine formula: baseScore × adjustmentFactor
        const baseScore = (meta * pressureFactor) / BITE_DIVISOR;
        const adjustmentFactor = Math.sqrt(Math.sqrt(timeMult)); // Only time factor available
        const prob = Math.min(MAX_BITE_PROB, Math.max(MIN_BITE_PROB, baseScore * adjustmentFactor));
        scores.push(prob * 10);
    }

    // Apply temporal smoothing
    const smoothed = scores.map(function(score, i) {
        if (i === 0) return (scores[0] * 0.6 + scores[1] * 0.4);
        if (i === scores.length - 1) return (scores[i] * 0.6 + scores[i - 1] * 0.4);
        return scores[i - 1] * 0.2 + scores[i] * 0.6 + scores[i + 1] * 0.2;
    });

    return smoothed.map(function(v) { return Math.max(1, Math.min(10, Math.round(v))); });
}

module.exports = { deriveActivityForecast };
