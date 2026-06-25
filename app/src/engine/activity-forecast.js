'use strict';

// Reuse existing multiplier functions from bite-score engine
const { getTimeMultiplier, getWindMultiplier, getCloudMultiplier, getClarityMultiplier, getAbsolutePressureModifier } = require('./bite-score');
const { calculateMetabolicEfficiency } = require('./metabolic');
const { getDOMultiplier } = require('./dissolved-oxygen');
const { getSpawningMultiplier } = require('./spawning');
const { getThermoclineDepth, getEffectiveTemp } = require('./thermocline');
const { getMoonPhase } = require('./lunar');

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
 * Now fully aligned with bite-score.js: same Math.sqrt() dampening and
 * includes all environmental factors (DO, lunar, spawning).
 */
function computeHourlyBiteProb(hour, pressureHpa, windMph, cloudPercent, waterTempF, speciesMetrics, prevPressureHpa, clarity, options) {
    const metrics = speciesMetrics || { opt: 65, dorm: 45 };
    const opts = options || {};
    const month = opts.month || (new Date().getMonth() + 1);
    const lat = opts.latitude || 45;
    const date = opts.date || new Date();
    const speciesName = opts.speciesName || null;
    const fishingData = opts.fishingData || null;

    // Thermocline-adjusted effective water temp (matches main engine)
    const speciesDepth = metrics.preferred_depth || 10;
    const thermoclineDepth = getThermoclineDepth(lat, month, waterTempF, windMph);
    const effectiveWaterTemp = getEffectiveTemp(waterTempF, thermoclineDepth, speciesDepth);

    const metabolicEfficiency = calculateMetabolicEfficiency(effectiveWaterTemp, metrics) / 100;

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

    // Multi-factor adjustment — now matches main engine exactly
    const windMult = getWindMultiplier(windMph);
    const lightMult = getCloudMultiplier(cloudPercent);
    const timeMult = getTimeMultiplier(hour, metrics.nocturnal);
    const clarityMult = getClarityMultiplier(clarity || 'Clear');
    const doMult = getDOMultiplier(effectiveWaterTemp, month, windMph, metrics);

    // Lunar feeding multiplier
    const lunarPhase = getMoonPhase(date);
    const lunarMult = lunarPhase.feedingMultiplier;

    // Spawning multiplier (applied to base score, not adjustment)
    const spawningMult = getSpawningMultiplier(effectiveWaterTemp, speciesName, fishingData);

    const baseScore = (metabolicEfficiency * pressureFactor) / BITE_DIVISOR * spawningMult;

    // FIX: Use Math.sqrt() (square root) to match main engine — was Math.sqrt(Math.sqrt()) (4th root)
    // Now includes DO and lunar multipliers in the product
    const adjustmentFactor = Math.sqrt(windMult * lightMult * timeMult * clarityMult * doMult * lunarMult);

    return Math.min(MAX_BITE_PROB, Math.max(MIN_BITE_PROB, baseScore * adjustmentFactor));
}

/**
 * Apply temporal smoothing (mirrors EMA concept from bite-score.js).
 * Fish behavior doesn't change instantly — blend each hour with its neighbors.
 */
function applyTemporalSmoothing(scores) {
    return scores.map(function(score, i) {
        if (i === 0) return (scores[0] * 0.6 + scores[1] * 0.4);
        if (i === scores.length - 1) return (scores[i] * 0.6 + scores[i - 1] * 0.4);
        return scores[i - 1] * 0.2 + scores[i] * 0.6 + scores[i + 1] * 0.2;
    });
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
 * @param {Array}  [params.pressureHistory] - Past {pressure, timestamp} readings, ascending by time
 * @param {number} [params.waterTemp] - Water temp °F (real-formula path)
 * @param {Object} [params.speciesMetrics] - {opt, dorm} (real-formula path)
 * @param {string} [params.speciesName] - Species name for spawning multiplier
 * @param {Object} [params.fishingData] - Fishing data for spawning lookup
 * @param {number} [params.latitude] - Latitude for thermocline
 * @param {Date}   [params.date] - Date for lunar phase
 * @param {number} [params.month] - Month (1-12)
 * @returns {number[]} Array of 12 numbers on a 1-10 scale for next 12 hours
 */
function deriveActivityForecast(params) {
    const { currentHour, pressureTrend, metabolicEfficiency, hourly, pressureHistory, waterTemp, speciesMetrics, clarity,
            speciesName, fishingData, latitude, date, month } = params;

    // Real-formula path: use forecasted hourly weather data
    if (hourly && hourly.length >= 2 && waterTemp != null) {
        const scores = [];
        for (let i = 0; i < Math.min(12, hourly.length); i++) {
            const h = hourly[i];
            // Seed hour 0's trend from the most recent past reading instead of
            // forcing "Stable", so the "now" bar reflects the real pressure trend.
            const prevPressure = i > 0
                ? hourly[i - 1].pressure
                : (pressureHistory && pressureHistory.length > 0 ? pressureHistory[pressureHistory.length - 1].pressure : null);
            const prob = computeHourlyBiteProb(
                h.hour != null ? h.hour : (currentHour + i) % 24,
                h.pressure,
                h.wind?.speed,
                h.cloudiness,
                waterTemp,
                speciesMetrics,
                prevPressure,
                clarity,
                { speciesName, fishingData, latitude, date, month }
            );
            scores.push(Math.max(0, Math.min(10, prob * 10)));
        }
        // Pad with last score if fewer than 12 hours available
        while (scores.length < 12) scores.push(scores[scores.length - 1] || 5);

        const smoothed = applyTemporalSmoothing(scores);

        return smoothed.map(function(v) { return Math.max(1, Math.min(10, Math.round(v * 10) / 10)); });
    }

    // Fallback path: use same baseScore × adjustment structure as main engine
    // FIX: use Math.sqrt() to match main engine, include spawning via spawningMult
    const trendMult = TREND_MULTIPLIERS[pressureTrend] || 1.0;
    const absMult = 1.0; // No absolute pressure data in fallback
    const pressureFactor = trendMult * absMult;
    const meta = metabolicEfficiency || 0.5;

    // Compute spawning multiplier for fallback path too
    const spawningMult = (speciesName && fishingData)
        ? getSpawningMultiplier(waterTemp || 65, speciesName, fishingData)
        : 1.0;

    const scores = [];
    for (let i = 0; i < 12; i++) {
        const hour = (currentHour + i) % 24;
        const timeMult = getTimeMultiplier(hour, speciesMetrics?.nocturnal);
        // Match main engine formula: baseScore × adjustmentFactor
        const baseScore = (meta * pressureFactor) / BITE_DIVISOR * spawningMult;
        // FIX: Use Math.sqrt() to match main engine — was Math.sqrt(timeMult) only
        const adjustmentFactor = Math.sqrt(timeMult); // Only time factor available in fallback
        const prob = Math.min(MAX_BITE_PROB, Math.max(MIN_BITE_PROB, baseScore * adjustmentFactor));
        scores.push(prob * 10);
    }

    const smoothed = applyTemporalSmoothing(scores);

    return smoothed.map(function(v) { return Math.max(1, Math.min(10, Math.round(v))); });
}

module.exports = { deriveActivityForecast };
