'use strict';

const { calculateMetabolicEfficiency } = require('./metabolic');
const { getLiveWaterTemp } = require('./water-temp');
const { recordPressure, getPressureTrend, computeTrendFromHistory } = require('./pressure-trend');

// --- Named Constants ---
const BITE_DIVISOR = 1.2;
const REACTION_THRESHOLD = 0.75;
const FINESSE_THRESHOLD = 0.35;
const MIN_BITE_PROB = 0.01;
const MAX_BITE_PROB = 1.0;
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

// --- Multiplier Functions ---

function getWindMultiplier(windMph) {
    if (windMph == null) return 1.0;
    if (windMph <= 1) return 0.85;
    if (windMph <= 8) return 1.15;
    if (windMph <= 15) return 1.05;
    if (windMph <= 20) return 0.90;
    return 0.75;
}

function getCloudMultiplier(cloudPercent) {
    if (cloudPercent == null) return 1.0;
    if (cloudPercent <= 20) return 0.85;
    if (cloudPercent <= 50) return 0.95;
    if (cloudPercent <= 80) return 1.10;
    return 1.15;
}

function getTimeMultiplier(hour) {
    if (hour == null) return 1.0;
    if ((hour >= 5 && hour <= 8) || (hour >= 17 && hour <= 20)) return 1.20;
    if ((hour >= 9 && hour <= 11) || (hour >= 14 && hour <= 16)) return 1.00;
    return 0.85;
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

    // Cache species lookup for O(1) access
    const speciesCache = new Map();
    if (fishingData?.species_data) {
        for (const entry of fishingData.species_data) {
            speciesCache.set(entry.name, entry.scientific_metrics || null);
        }
    }

    function getSpeciesMetrics(speciesName) {
        return speciesCache.get(speciesName) || { opt: 65, dorm: 45, sensitivity: 'Medium' };
    }

    function rankBiteProbability(score) {
        return score >= 76 ? 'Excellent' : score >= 56 ? 'Good' : score >= 36 ? 'Fair' : 'Tough';
    }

    function buildReasoning(result) {
        return 'Metabolic efficiency is ' + result.metabolicEfficiency + '% with a ' + result.pressureTrend.toLowerCase() + ' pressure profile, supporting a ' + result.strategyType.toLowerCase() + ' approach.';
    }

    async function calculateScientificStrategy(input, weather, options = {}) {
        try {
            const { useLureCatalog = false, month, hour } = options;
            const { speciesName, waterColor, location, lat, lon } = input;
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

            // Fetch live water temperature from USGS or fall back to estimation
            const waterTempData = await waterTempProvider(
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

            // New pressure model: trend multiplier × absolute modifier
            const trendMult = TREND_MULTIPLIERS[pressureTrendData.classification] || 1.0;
            const absMult = getAbsolutePressureModifier(currentPressureHpa);
            const pressureFactor = trendMult * absMult;

            // Metabolic efficiency uses WATER temperature
            const metabolicEfficiency = calculateMetabolicEfficiency(waterTemp, metrics) / 100;

            // Multi-factor adjustment (wind, light, time, clarity)
            const windMult = getWindMultiplier(windMph);
            const lightMult = getCloudMultiplier(cloudPercent);
            const timeMult = getTimeMultiplier(currentHour);
            const clarityMult = getClarityMultiplier(waterColor || 'Clear');

            const baseScore = (metabolicEfficiency * pressureFactor) / BITE_DIVISOR;
            // Optimized: Math.pow(x, 0.25) → Math.sqrt(Math.sqrt(x))
            const adjustmentFactor = Math.sqrt(Math.sqrt(windMult * lightMult * timeMult * clarityMult));

            const rawBiteProb = Math.min(MAX_BITE_PROB, Math.max(MIN_BITE_PROB, baseScore * adjustmentFactor));
            const biteProb = smoothBiteScore(rawBiteProb, location);

            const strategyType = biteProb > REACTION_THRESHOLD ? 'Reaction' :
                                 biteProb < FINESSE_THRESHOLD ? 'Finesse' : 'Balanced';

            const biteProbability = Math.round(biteProb * 100);
            const result = {
                biteProbability,
                biteRank: rankBiteProbability(biteProbability),
                metabolicEfficiency: Math.round(metabolicEfficiency * 100),
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
                biteRank: 'Unavailable',
                biteReasoning: 'Scientific engine error: ' + error.message,
                metabolicEfficiency: 0,
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

module.exports = { createBiteScoreEngine, getWindMultiplier, getCloudMultiplier, getTimeMultiplier, getClarityMultiplier, getAbsolutePressureModifier, clearBiteScoreCache };
