'use strict';

// Reuse existing multiplier functions from bite-score engine
const { getTimeMultiplier, getWindMultiplier, getCloudMultiplier, getClarityMultiplier, getAbsolutePressureModifier } = require('./bite-score');
const { calculateMetabolicEfficiency } = require('./metabolic');
const { getDOMultiplier } = require('./dissolved-oxygen');
const { getSpawningMultiplier } = require('./spawning');
const { getThermoclineDepth, getEffectiveTemp } = require('./thermocline');
const { getMoonPhase } = require('./lunar');
const { getCivilDawn, getCivilDusk } = require('./photoperiod');

// Constants matching bite-score.js
const BITE_DIVISOR = 1.4;
const MIN_BITE_PROB = 0.01;
const MAX_BITE_PROB = 0.85;

const TREND_MULTIPLIERS = {
    'Rapidly Falling': 1.25,
    'Falling': 1.15,
    'Stable': 1.0,
    'Rising': 0.85,
    'Rapidly Rising': 0.70,
    'Unknown': 1.0
};

function classifyTrend(deltaHpa) {
    if (deltaHpa <= -1.5) return 'Rapidly Falling';
    if (deltaHpa <= -0.5) return 'Falling';
    if (deltaHpa >= 1.5) return 'Rapidly Rising';
    if (deltaHpa >= 0.5) return 'Rising';
    return 'Stable';
}

function computeHourlyBiteProb(hour, pressureHpa, windMph, cloudPercent, waterTempF, speciesMetrics, prevPressureHpa, clarity, options) {
    const metrics = speciesMetrics || { opt: 65, dorm: 45 };
    const opts = options || {};
    const month = opts.month || (new Date().getMonth() + 1);
    const lat = opts.latitude || 45;
    const date = opts.date || new Date();
    const speciesName = opts.speciesName || null;
    const fishingData = opts.fishingData || null;

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
    // Continuous pressure-rate blending: 60% discrete category + 40% linear rate
    const sensitivity = (metrics.sensitivity === 'High') ? 1.3 : (metrics.sensitivity === 'Low') ? 0.7 : 1.0;
    const discreteMult = 1.0 + (TREND_MULT[trendLabel] - 1.0) * sensitivity;
    const continuousMult = 1.0 + Math.max(-0.4, Math.min(0.4, delta * 0.3)) * sensitivity * -1;
    const blendedTrendMult = discreteMult * 0.6 + continuousMult * 0.4;
    const pressureFactor = blendedTrendMult * absMult;

    const windMult = getWindMultiplier(windMph);
    const lightMult = getCloudMultiplier(cloudPercent);
    let timeMult = getTimeMultiplier(hour, metrics.nocturnal);
    // Photoperiod refinement — boost timeMult within ±1.5h of true civil dawn/dusk
    // [Source: NOAA solar calculator; Helfman 1986 — diel activity patterns]
    if (!metrics.nocturnal && lat != null) {
        const civilDawn = getCivilDawn(lat, date);
        const civilDusk = getCivilDusk(lat, date);
        const dawnDist = Math.min(Math.abs(hour - civilDawn), Math.abs(hour - civilDawn + 24), Math.abs(hour - civilDawn - 24));
        const duskDist = Math.min(Math.abs(hour - civilDusk), Math.abs(hour - civilDusk + 24), Math.abs(hour - civilDusk - 24));
        if (dawnDist <= 1.5 || duskDist <= 1.5) {
            timeMult = 1.20;
        }
    }
    const clarityMult = getClarityMultiplier(clarity || 'Clear');
    const doMult = getDOMultiplier(effectiveWaterTemp, month, windMph, metrics);

    const lunarPhase = getMoonPhase(date);
    const lunarMult = lunarPhase.feedingMultiplier;

    const spawningMult = getSpawningMultiplier(effectiveWaterTemp, speciesName, fishingData);

    // DO-Temperature interaction: warm water raises metabolic oxygen demand while
    // reducing O2 solubility. Amplify DO multiplier when metabolic efficiency is high.
    // [Source: Kramer 1987 — DO requirements; Fry 1971 — aerobic scope and temp]
    const doTempInteraction = metabolicEfficiency > 0.5
        ? Math.pow(doMult, 0.5 + (metabolicEfficiency - 0.5) * 0.4)
        : doMult;

    // Seasonal clarity-light interaction: cold-water fish rely more on visual cues
    // [Source: Hubert & O'Shea 1992 — seasonal foraging of piscivorous fish]
    const seasonalClarityLight = effectiveWaterTemp < 55
        ? Math.sqrt(clarityMult * lightMult)
        : clarityMult * 0.5 + lightMult * 0.5;

    // Wind-chill amplification: strong wind reduces surface feeding activity more
    // in cold water than warm water. Fish in cold water are already lethargic;
    // surface turbulence from wind further discourages feeding.
    // [Source: Shuter et al. 2012 — wind and temperature effects on fish behavior]
    const windChillFactor = effectiveWaterTemp < 50 && windMph > 15
        ? 1.0 - (windMph - 15) * 0.005
        : 1.0;

    const baseScore = (metabolicEfficiency * pressureFactor * windChillFactor) / BITE_DIVISOR * spawningMult;
    const adjustmentFactor = Math.sqrt(windMult * seasonalClarityLight * timeMult * doTempInteraction * lunarMult);

    return Math.min(MAX_BITE_PROB, Math.max(MIN_BITE_PROB, baseScore * adjustmentFactor));
}

function applyTemporalSmoothing(scores) {
    return scores.map(function(score, i) {
        if (i === 0) return (scores[0] * 0.6 + scores[1] * 0.4);
        if (i === scores.length - 1) return (scores[i] * 0.6 + scores[i - 1] * 0.4);
        return scores[i - 1] * 0.2 + scores[i] * 0.6 + scores[i + 1] * 0.2;
    });
}

function deriveActivityForecast(params) {
    const { currentHour, pressureTrend, metabolicEfficiency, hourly, pressureHistory, waterTemp, speciesMetrics, clarity,
            speciesName, fishingData, latitude, date, month, anchorScore } = params;

    if (hourly && hourly.length >= 2 && waterTemp != null) {
        const rawProbs = [];
        const scores = [];
        for (let i = 0; i < Math.min(12, hourly.length); i++) {
            const h = hourly[i];
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
            rawProbs.push(prob);
            scores.push(Math.max(0, Math.min(10, prob * 10)));
        }
        while (scores.length < 12) {
            rawProbs.push(rawProbs[rawProbs.length - 1] || 0.5);
            scores.push(scores[scores.length - 1] || 5);
        }

        // Anchor hour 0 to main engine's bite probability (resolves EMA and data-source mismatch)
        if (anchorScore != null && rawProbs.length > 0 && rawProbs[0] > 0) {
            const anchorProb = anchorScore / 100;
            const offset = anchorProb - rawProbs[0];
            for (let i = 0; i < scores.length; i++) {
                scores[i] = Math.max(0, Math.min(10, (rawProbs[i] + offset) * 10));
            }
        }

        const smoothed = applyTemporalSmoothing(scores);

        // Re-pin hour 0 to exact anchor value after smoothing prevents drift
        if (anchorScore != null) {
            smoothed[0] = Math.max(0, Math.min(10, anchorScore / 10));
        }

        return smoothed.map(function(v) { return Math.max(1, Math.min(10, Math.round(v * 10) / 10)); });
    }

    const trendMult = TREND_MULTIPLIERS[pressureTrend] || 1.0;
    const absMult = 1.0;
    const pressureFactor = trendMult * absMult;
    const meta = metabolicEfficiency || 0.5;

    const spawningMult = (speciesName && fishingData)
        ? getSpawningMultiplier(waterTemp || 65, speciesName, fishingData)
        : 1.0;

    const scores = [];
    for (let i = 0; i < 12; i++) {
        const hour = (currentHour + i) % 24;
        const timeMult = getTimeMultiplier(hour, speciesMetrics?.nocturnal);
        const baseScore = (meta * pressureFactor) / BITE_DIVISOR * spawningMult;
        const adjustmentFactor = Math.sqrt(timeMult);
        const prob = Math.min(MAX_BITE_PROB, Math.max(MIN_BITE_PROB, baseScore * adjustmentFactor));
        scores.push(prob * 10);
    }

    // Anchor scores to bite score so chart bar 1 matches Bite Score even in fallback mode
    if (anchorScore != null && scores.length > 0) {
        const anchorValue = anchorScore / 10;
        const offset = anchorValue - scores[0];
        for (let i = 0; i < scores.length; i++) {
            scores[i] = Math.max(0, Math.min(10, scores[i] + offset));
        }
    }

    const smoothed = applyTemporalSmoothing(scores);

    // Re-pin hour 0 to exact anchor value after smoothing prevents drift
    if (anchorScore != null) {
        smoothed[0] = Math.max(0, Math.min(10, anchorScore / 10));
    }

    return smoothed.map(function(v) { return Math.max(1, Math.min(10, Math.round(v * 10) / 10)); });
}

module.exports = { deriveActivityForecast };
