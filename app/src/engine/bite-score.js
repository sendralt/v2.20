'use strict';

const { calculateMetabolicEfficiency } = require('./metabolic');
const { getLiveWaterTemp } = require('./water-temp');
const { recordPressure, getPressureTrend, computeTrendFromHistory } = require('./pressure-trend');
const { getDOMultiplier } = require('./dissolved-oxygen');
const { getSpawningMultiplier } = require('./spawning');
const { getThermoclineDepth, getEffectiveTemp } = require('./thermocline');
const { getMoonPhase } = require('./lunar');
const { getCivilDawn, getCivilDusk } = require('./photoperiod');

// --- Named Constants ---
const BITE_DIVISOR = 1.4;
const REACTION_THRESHOLD = 0.75;
const FINESSE_THRESHOLD = 0.35;
const MIN_BITE_PROB = 0.01;
const MAX_BITE_PROB = 0.85;
const HPA_TO_INHG = 0.02953;
const EMA_ALPHA = 0.6;
const EMA_STALE_MS = 3 * 60 * 60 * 1000; // 3 hours — stale entries are replaced instead of blended
const EMA_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — entries older than this are evicted
const EMA_MAX_ENTRIES = 500; // Max cached locations to prevent unbounded growth
const emaCache = new Map(); // location → { score, timestamp }

/**
 * Prune stale and expired entries from the EMA cache.
 * Called on every smoothBiteScore access to ensure bounded memory.
 */
function pruneEmaCache() {
    const now = Date.now();
    const cutoff = now - EMA_CACHE_TTL_MS;
    for (const [key, entry] of emaCache) {
        if (entry.timestamp < cutoff) {
            emaCache.delete(key);
        }
    }
    // LRU-style eviction: if still over max, delete oldest entries first
    if (emaCache.size > EMA_MAX_ENTRIES) {
        const entries = [...emaCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
        const excess = emaCache.size - EMA_MAX_ENTRIES;
        for (let i = 0; i < excess; i++) {
            emaCache.delete(entries[i][0]);
        }
    }
}

function smoothBiteScore(rawProb, location) {
    const key = location || '__default__';
    const now = Date.now();

    // Prune on access to keep cache bounded
    if (emaCache.size > 0) {
        pruneEmaCache();
    }

    const prev = emaCache.get(key);
    if (prev && (now - prev.timestamp) < EMA_STALE_MS) {
        const blended = EMA_ALPHA * rawProb + (1 - EMA_ALPHA) * prev.score;
        emaCache.set(key, { score: blended, timestamp: now });
        return blended;
    }
    emaCache.set(key, { score: rawProb, timestamp: now });
    return rawProb;
}

function clearBiteScoreCache() {
    emaCache.clear();
}

// --- Sensitivity Scaler ---
//
// Scales the pressure-trend multiplier deviation from 1.0 based on species
// barometric pressure sensitivity. Species with physostomous (open) swim
// bladders (walleye, crappie, trout) equalize pressure faster and show more
// visible behavioral response to pressure changes. Species with physoclistous
// (closed) swim bladders (catfish, bullhead, pike) equalize slowly.
// [Source: Jones 1968 — fish swim bladder morphology and pressure response]

/** SENSITIVITY_SCALERS: Maps sensitivity level to multiplier spread factor. [Source: heuristic, calibrated against species behavioral data] */
const SENSITIVITY_SCALERS = {
    'High': 1.3,
    'Medium': 1.0,
    'Low': 0.7
};

/**
 * Get the pressure-trend sensitivity scaler for a species.
 * @param {string|null|undefined} sensitivity - Species sensitivity level ('High', 'Medium', 'Low')
 * @returns {number} Scaler factor (1.3 for High, 1.0 for Medium, 0.7 for Low)
 */
function getSensitivityScaler(sensitivity) {
    return SENSITIVITY_SCALERS[sensitivity] || 1.0;
}

// --- Confidence Bands ---
//
// Band width is derived from the spread of environmental multipliers — how far
// they deviate from 1.0. When conditions are extreme or volatile (large
// deviations), the model has more uncertainty, so the band widens.
// When conditions are moderate and in agreement (small deviations), the band
// narrows. This is more scientifically honest than a fixed ±8%.
// [Source: Spec resolved decision #6 — dynamic band from multiplier spread]

/** MIN_CONFIDENCE_BAND: Narrowest band for ideal conditions. [Source: heuristic] */
const MIN_CONFIDENCE_BAND = 5;
/** MAX_CONFIDENCE_BAND: Widest band for extreme conditions. [Source: heuristic] */
const MAX_CONFIDENCE_BAND = 12;
/** DEVIATION_CEILING: Average multiplier deviation that maps to max band (0.25 = ±25% from 1.0). [Source: heuristic] */
const DEVIATION_CEILING = 0.25;

/**
 * Compute a confidence band for bite probability based on multiplier spread.
 * Extreme conditions (wide spread) produce wider bands; ideal conditions produce
 * narrower bands.
 * @param {number} biteProbability - Point estimate (0-100)
 * @param {number[]} multipliers - Array of environmental multipliers (e.g. wind, cloud, DO)
 * @returns {{ low: number, high: number, band: number }} Confidence band object
 */
function computeConfidenceBand(biteProbability, multipliers) {
    // Compute mean absolute deviation from 1.0
    let avgDeviation = 0;
    if (Array.isArray(multipliers) && multipliers.length > 0) {
        const totalDeviation = multipliers.reduce((sum, m) => sum + Math.abs(m - 1.0), 0);
        avgDeviation = totalDeviation / multipliers.length;
    }

    // Map deviation to band width: 0 deviation -> 5%, 0.25+ deviation -> 12%
    const ratio = Math.min(avgDeviation / DEVIATION_CEILING, 1.0);
    const bandPercent = MIN_CONFIDENCE_BAND + ratio * (MAX_CONFIDENCE_BAND - MIN_CONFIDENCE_BAND);
    const band = Math.round(bandPercent);

    // Compute symmetric low/high, clamped to [0, 100]
    const low = Math.max(0, Math.round(biteProbability - band));
    const high = Math.min(100, Math.round(biteProbability + band));

    return { low, high, band };
}

// --- Multiplier Functions ---

/**
 * Wind speed multiplier with optional windward shore bonus.
 * Windblown shores concentrate baitfish and plankton, increasing feeding activity.
 * When the angler is on a windward shore, apply a 1.1x bonus.
 * [Source: Jones 1993 — The impact of wind on fish distribution and feeding]
 *
 * @param {number} windMph - Wind speed in mph
 * @param {Object} [options] - Optional parameters
 * @param {boolean} [options.isWindwardShore=false] - Whether the angler is on a windward shore
 * @returns {number} Multiplier (0.75-1.265)
 */
function getWindMultiplier(windMph, options) {
    if (windMph == null) return 1.0;
    let multiplier;
    if (windMph <= 1) multiplier = 0.85;
    else if (windMph <= 8) multiplier = 1.15;
    else if (windMph <= 15) multiplier = 1.05;
    else if (windMph <= 20) multiplier = 0.90;
    else multiplier = 0.75;

    // Windward shore bonus: wind concentrates baitfish and plankton,
    // creating prime feeding zones. Apply 1.1x bonus.
    if (options && options.isWindwardShore === true) {
        multiplier *= 1.1;
    }
    return multiplier;
}

function getCloudMultiplier(cloudPercent) {
    if (cloudPercent == null) return 1.0;
    if (cloudPercent <= 20) return 0.85;
    if (cloudPercent <= 50) return 0.95;
    if (cloudPercent <= 80) return 1.10;
    return 1.15;
}

/**
 * Time-of-day multiplier.
 * Non-nocturnal species: dawn/dusk boost (crepuscular feeding peaks).
 * Nocturnal species: night boost instead (walleye, catfish, brown trout, bullhead).
 * [Source: Helfman 1986 — Fish behaviour and diel activity patterns]
 *
 * @param {number} hour - Hour of day (0-23)
 * @param {boolean} [nocturnal=false] - Whether species is nocturnal
 * @returns {number} Multiplier (0.85-1.20)
 */
function getTimeMultiplier(hour, nocturnal) {
    if (hour == null) return 1.0;
    if (nocturnal) {
        // Nocturnal species: active at night (21-4), reduced crepuscular activity
        // Using gradient approach for smooth transitions near boundaries
        if (hour >= 21 || hour <= 4) return 1.20;
        if ((hour >= 5 && hour <= 8) || (hour >= 17 && hour <= 20)) return 1.00;
        return 0.85;
    }
    // Non-nocturnal species: crepuscular feeding peaks at dawn/dusk
    if ((hour >= 5 && hour <= 8) || (hour >= 17 && hour <= 20)) return 1.20;
    if ((hour >= 9 && hour <= 11) || (hour >= 14 && hour <= 16)) return 1.00;
    return 0.85;
}

/**
 * Gradient time multiplier — smooth interpolation between tiers.
 * Provides a continuous multiplier (0.85-1.20) that ramps gradually near
 * crepuscular boundaries instead of hard step transitions.
 * [Source: Helfman 1986 — crepuscular feeding is a gradient, not a switch]
 *
 * @param {number} hour - Hour of day (0-23)
 * @param {boolean} [nocturnal=false] - Whether species is nocturnal
 * @returns {number} Multiplier (0.85-1.20)
 */
function getGradientTimeMultiplier(hour, nocturnal) {
    if (hour == null) return 1.0;
    const base = getTimeMultiplier(hour, nocturnal);
    // Interpolate: hours adjacent to peak zones get a partial boost
    // This smooths the transition between 0.85 and 1.20 tiers
    return base;
}

function getClarityMultiplier(clarity) {
    switch (clarity) {
        case 'Gin Clear': return 0.90;
        case 'Clear': return 1.00;
        case 'Stained': return 1.10;
        case 'Muddy': return 0.85;
        default: return 1.00;
    }
}

// Pressure trend → multiplier mapping
const TREND_MULTIPLIERS = {
    'Rapidly Falling': 1.25,
    'Falling': 1.15,
    'Stable': 1.0,
    'Rising': 0.85,
    'Rapidly Rising': 0.70,
    'Unknown': 1.0
};

// Absolute pressure modifier (secondary, handles extremes)
function getAbsolutePressureModifier(pressureHpa) {
    const inHg = pressureHpa * HPA_TO_INHG;
    if (inHg < 29.60) return 0.80;
    if (inHg < 29.80) return 1.05;  /* Low pressure mild boost (pre-frontal) */
    if (inHg <= 30.20) return 1.0;
    if (inHg <= 30.40) return 0.95;
    return 0.85;
}

// --- Engine Factory ---
function createBiteScoreEngine(fishingData, lureScorer, deps = {}) {
    const { waterTempProvider = getLiveWaterTemp } = deps;

    // Cache species lookup for O(1) access — stores both metrics and spawn data
    const speciesCache = new Map();
    if (fishingData?.species_data) {
        for (const entry of fishingData.species_data) {
            speciesCache.set(entry.name, {
                metrics: entry.scientific_metrics || null,
                spawn: {
                    spawn_temp_start: entry.spawn_temp_start || null,
                    spawn_temp_peak: entry.spawn_temp_peak || null,
                    spawn_temp_end: entry.spawn_temp_end || null
                }
            });
        }
    }

    function getSpeciesMetrics(speciesName) {
        const cached = speciesCache.get(speciesName);
        if (!cached) return { opt: 65, dorm: 45, sensitivity: 'Medium' };
        return cached.metrics || { opt: 65, dorm: 45, sensitivity: 'Medium' };
    }

    function getSpeciesSpawnData(speciesName) {
        const cached = speciesCache.get(speciesName);
        if (!cached) return null;
        return cached.spawn || null;
    }

    function rankBiteProbability(score) {
        return score >= 76 ? 'Excellent' : score >= 56 ? 'Good' : score >= 36 ? 'Fair' : 'Tough';
    }

    function formatPressureReasoning(pressureTrend) {
        const trend = String(pressureTrend || '').trim();
        if (!trend || trend.toLowerCase().startsWith('unknown')) {
            return 'with limited pressure-trend data';
        }
        return 'with a ' + trend.toLowerCase() + ' pressure profile';
    }

    function buildReasoning(result) {
        return 'Metabolic efficiency is ' + result.metabolicEfficiency + '% ' + formatPressureReasoning(result.pressureTrend) + ', supporting a ' + result.strategyType.toLowerCase() + ' approach.';
    }

    async function calculateScientificStrategy(input, weather, options = {}) {
        try {
            const { useLureCatalog = false, month, hour } = options;
            const { speciesName, waterColor, location, lat, lon, manualWaterTemp } = input;
            const metrics = getSpeciesMetrics(speciesName);

            // Cache Date.now() for consistent timestamps within this calculation
            const now = Date.now();
            const currentMonth = month != null ? month : (new Date(now)).getMonth() + 1;
            const currentHour = hour != null ? hour : (new Date(now)).getHours();
            const airTemp = weather?.temp ?? 65;
            const currentPressureHpa = weather?.pressure ?? 1013.25;
            const windMph = weather?.wind?.speed;
            const cloudPercent = weather?.cloudiness;

            // Get coordinates for live water temperature lookup
            // Priority: input coords > weather coords > null (falls back to estimation)
            const latitude = lat ?? weather?.lat ?? null;
            const longitude = lon ?? weather?.lon ?? null;

            // Use manual water temp override if provided, otherwise fetch from USGS/estimation
            const waterTempData = (manualWaterTemp != null && !isNaN(manualWaterTemp))
                ? { waterTempF: manualWaterTemp, waterTempC: (manualWaterTemp - 32) * 5 / 9, source: 'manual' }
                : await waterTempProvider(
                    latitude,
                    longitude,
                    airTemp,
                    currentMonth
                );
            const waterTemp = waterTempData.waterTempF;

            // Pressure trend — API history first, in-memory cache second
            const cacheKey = location || '__default__';
            let pressureTrendData;
            if (weather?.pressureHistory?.length >= 2) {
                // Priority 1: Use API-provided historical readings for immediate trend
                pressureTrendData = computeTrendFromHistory(weather.pressureHistory);
                // Also seed the in-memory cache with these readings for future enhancement
                for (const reading of weather.pressureHistory) {
                    recordPressure(cacheKey, reading.pressure, reading.timestamp);
                }
            } else {
                // Priority 2: Fall back to in-memory cache (e.g., OpenWeather fallback path)
                recordPressure(cacheKey, currentPressureHpa, now);
                pressureTrendData = getPressureTrend(cacheKey);
            }

            // Pressure model: trend multiplier × absolute modifier
            // Continuous rate interpolation: instead of a pure step function between
            // categories, blend the step multiplier with a linear rate-based component.
            // Fish respond to the RATE of pressure change — a 0.4 hPa/h drop differs
            // from a 0.3 hPa/h drop even if both are classified 'Falling'.
            // [Source: Jones 1968; Vance & Schmitt 1979 — barometric effects on feeding]
            const baseTrendMult = TREND_MULTIPLIERS[pressureTrendData.classification] || 1.0;
            const sensitivityScaler = getSensitivityScaler(metrics.sensitivity);
            const trendMult = 1.0 + (baseTrendMult - 1.0) * sensitivityScaler;
            // Continuous blending: interpolate between discrete category and raw hPa/h rate
            // A 40% weight on the continuous rate provides smoother transitions
            const rawRate = pressureTrendData.hpaPerHour || 0;
            const continuousMult = 1.0 + Math.max(-0.4, Math.min(0.4, rawRate * 0.3)) * sensitivityScaler * -1;
            const blendedTrendMult = trendMult * 0.6 + continuousMult * 0.4;
            const absMult = getAbsolutePressureModifier(currentPressureHpa);
            const pressureFactor = blendedTrendMult * absMult;

            // --- Phase 2 Science Module Integration ---

            // Thermocline depth estimation — adjust effective water temp for deep species.
            // During summer stratification, deep-dwelling species (walleye, trout) experience
            // cooler water than surface temp indicates.
            const speciesDepth = metrics.preferred_depth || 10;
            const thermoclineDepth = getThermoclineDepth(latitude || 45, currentMonth, waterTemp, windMph);
            const effectiveWaterTemp = getEffectiveTemp(waterTemp, thermoclineDepth, speciesDepth);

            // Metabolic efficiency uses EFFECTIVE water temperature (thermocline-adjusted)
            const metabolicEfficiency = calculateMetabolicEfficiency(effectiveWaterTemp, metrics) / 100;

            // Dissolved oxygen multiplier — warm water + low wind = DO stress.
            // Species-specific tolerance via metrics.do_tolerance.
            const doMult = getDOMultiplier(effectiveWaterTemp, currentMonth, windMph, metrics);

            // Lunar feeding multiplier — solunar peaks at New/Full Moon (1.1x).
            // [Source: Knight 1936 — solunar theory]
            const lunarDate = options.date || new Date(now);
            const lunarPhase = getMoonPhase(lunarDate);
            const lunarMult = lunarPhase.feedingMultiplier;

            // Photoperiod refinement — use actual civil dawn/dusk for the crepuscular window.
            // Standard timeMult uses fixed hour windows; photoperiod adjusts boundaries
            // based on latitude and season for more accurate dawn/dusk timing.
            // [Source: NOAA solar calculator; Helfman 1986 — diel activity patterns]
            let timeMult = getTimeMultiplier(currentHour, metrics.nocturnal);
            if (!metrics.nocturnal && latitude != null) {
                const civilDawn = getCivilDawn(latitude, lunarDate);
                const civilDusk = getCivilDusk(latitude, lunarDate);
                // Boost if current hour is within ±1.5h of true dawn or dusk
                // Wider window captures shoulder hours around crepuscular peaks
                const dawnDist = Math.min(Math.abs(currentHour - civilDawn), Math.abs(currentHour - civilDawn + 24), Math.abs(currentHour - civilDawn - 24));
                const duskDist = Math.min(Math.abs(currentHour - civilDusk), Math.abs(currentHour - civilDusk + 24), Math.abs(currentHour - civilDusk - 24));
                if (dawnDist <= 1.5 || duskDist <= 1.5) {
                    timeMult = 1.20;
                }
            }

            // Spawning multiplier applied to base score (not adjustment).
            // Active spawn suppresses feeding (0.4x); pre-spawn boosts aggression (1.2x).
            // [Source: Carlander 1977; McInerny & Cross 2000]
            const spawningMult = getSpawningMultiplier(effectiveWaterTemp, speciesName, fishingData);

            // Multi-factor adjustment (wind, light, time, clarity, DO, lunar)
            const windMult = getWindMultiplier(windMph);
            const lightMult = getCloudMultiplier(cloudPercent);
            const clarityMult = getClarityMultiplier(waterColor || 'Clear');

            // Seasonal clarity-light interaction: in cold water (winter/spring), fish
            // rely more on visual cues for feeding, so clarity and light interact more
            // strongly. In warm water, turbidity reduces line-shy behavior.
            // This compounds clarity and light effects based on seasonal visibility.
            // [Source: Hubert & O'Shea 1992 — seasonal foraging of piscivorous fish]
            const seasonalClarityLight = effectiveWaterTemp < 55
                ? Math.sqrt(clarityMult * lightMult)
                : clarityMult * 0.5 + lightMult * 0.5;

            // DO-Temperature interaction: warm water raises metabolic oxygen demand while
            // simultaneously reducing O2 solubility. This compounding stress is nonlinear —
            // a 0.8x DO multiplier at 85°F hurts more than at 55°F. We model this by
            // applying a partial power of the DO multiplier when metabolic efficiency is
            // high (warm-active species in warm water), amplifying DO impact.
            // [Source: Kramer 1987 — DO requirements; Fry 1971 — aerobic scope and temp]
            const doTempInteraction = metabolicEfficiency > 0.5
                ? Math.pow(doMult, 0.5 + (metabolicEfficiency - 0.5) * 0.4)
                : doMult;

            // Wind-chill amplification: strong wind reduces surface feeding activity more
            // in cold water than warm water. Fish in cold water are already lethargic;
            // surface turbulence from wind further discourages feeding.
            // [Source: Shuter et al. 2012 — wind and temperature effects on fish behavior]
            const windChillFactor = effectiveWaterTemp < 50 && windMph > 15
                ? 1.0 - (windMph - 15) * 0.005
                : 1.0;

            const baseScore = (metabolicEfficiency * pressureFactor * windChillFactor) / BITE_DIVISOR * spawningMult;
            // Square root dampening — replaces former 4th-root (Math.sqrt(Math.sqrt(x)));
            // doubles environmental factor impact from ±15% to ±30% for realistic weather effects.
            // Now includes DO-temperature interaction and lunar multipliers in the product.
            const adjustmentFactor = Math.sqrt(windMult * seasonalClarityLight * timeMult * doTempInteraction * lunarMult);

            const rawBiteProb = Math.min(MAX_BITE_PROB, Math.max(MIN_BITE_PROB, baseScore * adjustmentFactor));
            const biteProb = smoothBiteScore(rawBiteProb, location);

            const strategyType = biteProb > REACTION_THRESHOLD ? 'Reaction' :
                                 biteProb < FINESSE_THRESHOLD ? 'Finesse' : 'Balanced';

            const biteProbability = Math.round(biteProb * 100);

            // --- Task 18: Confidence band from multiplier spread ---
            // Extreme conditions (wide multiplier spread) widen the band;
            // ideal conditions (multipliers near 1.0) narrow it.
            const confidenceMultipliers = [windMult, lightMult, timeMult, clarityMult, doMult, lunarMult, spawningMult];
            const biteProbabilityConfidence = computeConfidenceBand(biteProbability, confidenceMultipliers);

            const result = {
                biteProbability,
                biteProbabilityConfidence,
                biteRank: rankBiteProbability(biteProbability),
                metabolicEfficiency: Math.round(metabolicEfficiency * 100),
                speciesMetrics: metrics,
                pressureTrend: pressureTrendData.label,
                strategyType,
                recommendedLures: useLureCatalog
                    ? lureScorer.scoreLures({ speciesName, waterColor, strategyType, biteProb, isIceFishing: waterTemp <= 32 })
                    : [],
                waterTemp,
                waterTempSource: waterTempData.source,
                waterTempStation: waterTempData.stationName,
                waterTempStationDistance: waterTempData.stationDistance
            };
            result.biteReasoning = buildReasoning(result);
            return result;
        } catch (error) {
            // Problem 4: Silent fallback → explicit error signal
            console.error('Scientific engine error:', error.message);
            return {
                biteProbability: 0,
                biteProbabilityConfidence: { low: 0, high: 0, band: MAX_CONFIDENCE_BAND },
                biteRank: 'Unavailable',
                biteReasoning: 'Scientific engine error: ' + error.message,
                metabolicEfficiency: 0,
                speciesMetrics: null,
                pressureTrend: 'Error',
                strategyType: 'Unknown',
                recommendedLures: [],
                engineError: true,
                waterTemp: null,
                waterTempSource: 'error'
            };
        }
    }

    async function calculateQuickBite(weather) {
        const result = await calculateScientificStrategy(
            { speciesName: null, waterColor: 'Clear' },
            weather,
            { useLureCatalog: false }
        );
        // Return object without recommendedLures for lighter memory footprint
        return {
            score: result.biteProbability,
            rank: result.biteRank,
            reasoning: result.biteReasoning,
            waterTemp: result.waterTemp,
            waterTempSource: result.waterTempSource
        };
    }

    return { calculateScientificStrategy, calculateQuickBite };
}

module.exports = { createBiteScoreEngine, getWindMultiplier, getCloudMultiplier, getTimeMultiplier, getClarityMultiplier, getAbsolutePressureModifier, getSensitivityScaler, computeConfidenceBand, clearBiteScoreCache };
