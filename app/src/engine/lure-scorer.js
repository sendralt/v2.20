"use strict";

/**
 * Strategy-to-Category Affinity Map
 *
 * Defines which lure categories receive a scoring bonus for each strategy type.
 * Based on ichthyological research:
 * - Reaction: Aggressive, fast-moving lures that trigger instinctive strikes
 *   from active predators with high metabolic rates.
 * - Finesse: Subtle, slow presentations for lethargic fish in negative
 *   metabolic states (cold water or post-frontal conditions).
 *
 * To add a new category, simply add it to the appropriate array.
 * Categories not listed receive a neutral 1.0x multiplier.
 */
const STRATEGY_CATEGORY_MAP = {
    Reaction: ['Crankbait', 'Spinnerbait', 'Topwater', 'Spoon'],
    Finesse:  ['Jig', 'Soft Plastic']
};

const STRATEGY_BOOST = 1.5; // Multiplier applied to matched categories

/**
 * TEMP_BAND_PENALTY: Score multiplier when water temperature falls outside
 * the lure's recommended temperature band. [Source: heuristic — lures perform
 * poorly outside their designed temp range, but aren't useless]
 */
const TEMP_BAND_PENALTY = 0.5;

/**
 * SEASON_ORDER: Canonical ordering of seasons for range comparison.
 * Winter → Spring → Summer → Fall (circular calendar order).
 */
const SEASON_ORDER = ['Winter', 'Spring', 'Summer', 'Fall'];

/**
 * Convert month number (1-12) to season name.
 * Winter: Dec-Feb (12,1,2), Spring: Mar-May (3,4,5),
 * Summer: Jun-Aug (6,7,8), Fall: Sep-Nov (9,10,11).
 *
 * @param {number} month - Month (1-12)
 * @returns {string} Season name
 */
function monthToSeason(month) {
    if (month == null) return null;
    if ([12, 1, 2].includes(month)) return 'Winter';
    if ([3, 4, 5].includes(month)) return 'Spring';
    if ([6, 7, 8].includes(month)) return 'Summer';
    if ([9, 10, 11].includes(month)) return 'Fall';
    return null;
}

/**
 * Classify water temperature into a band name.
 * Cold: <50°F, Cool: 50-60°F, Ideal: 60-75°F, Warm: >75°F.
 *
 * @param {number} tempF - Water temperature in °F
 * @returns {string} Band name
 */
function tempToBand(tempF) {
    if (tempF == null) return null;
    if (tempF < 50) return 'Cold';
    if (tempF <= 60) return 'Cool';
    if (tempF <= 75) return 'Ideal';
    return 'Warm';
}

/**
 * Parse a temperature band string (e.g., 'Cool to Warm', 'Cold') into a set
 * of acceptable band names.
 *
 * @param {string} bandStr - Temperature band string from lure data
 * @returns {string[]} Array of acceptable band names
 */
function parseTempBand(bandStr) {
    if (!bandStr) return null;
    const parts = bandStr.split(/\s+to\s+/i).map(s => s.trim());
    if (parts.length === 1) return [parts[0]];

    // Expand range: e.g., ['Cool', 'Warm'] → ['Cool', 'Ideal', 'Warm']
    const startIdx = SEASON_ORDER.indexOf(parts[0]);
    const endIdx = SEASON_ORDER.indexOf(parts[1]);
    if (startIdx === -1 || endIdx === -1) return [parts[0], parts[1]];
    return SEASON_ORDER.slice(startIdx, endIdx + 1);
}

/**
 * Check if a temperature band falls within a lure's acceptable range.
 * Uses the TEMP_BAND_ORDER array for range comparison.
 *
 * @param {string} currentBand - Current water temp band
 * @param {string} lureBandStr - Lure's temperature_band string
 * @returns {boolean} True if current band is within lure's range
 */
const TEMP_BAND_ORDER = ['Cold', 'Cool', 'Ideal', 'Warm'];

function isTempInBand(currentBand, lureBandStr) {
    if (!currentBand || !lureBandStr) return true; // No data → no filtering
    const parts = lureBandStr.split(/\s+to\s+/i).map(s => s.trim());
    if (parts.length === 1) {
        return currentBand === parts[0];
    }
    const startIdx = TEMP_BAND_ORDER.indexOf(parts[0]);
    const endIdx = TEMP_BAND_ORDER.indexOf(parts[1]);
    const currentIdx = TEMP_BAND_ORDER.indexOf(currentBand);
    if (startIdx === -1 || endIdx === -1 || currentIdx === -1) return true;
    return currentIdx >= startIdx && currentIdx <= endIdx;
}

function createLureScorer(lureData) {
    function getLureCatalog() {
        if (Array.isArray(lureData?.lure_catalog)) return lureData.lure_catalog;
        if (Array.isArray(lureData)) return lureData;
        return [];
    }

    function getLureSpecies(lure) {
        if (Array.isArray(lure?.primary_species)) return lure.primary_species;
        if (Array.isArray(lure?.species)) return lure.species;
        return [];
    }

    function getLureCategory(lure) {
        return lure?.category || lure?.type || 'Unknown';
    }

    function getWaterClarityScore(lure, waterColor) {
        return lure?.best_conditions?.water_clarity?.[waterColor] ?? 0.5;
    }

    function getStrategyMultiplier(category, strategyType) {
        const categories = STRATEGY_CATEGORY_MAP[strategyType];
        if (!categories) return 1.0;
        return categories.includes(category) ? STRATEGY_BOOST : 1.0;
    }

    function scoreLures(params) {
        const { speciesName, waterColor, strategyType, biteProb, isIceFishing,
                currentMonth, waterTemp } = params;

        // Pre-compute season and temp band if params provided
        const currentSeason = currentMonth != null ? monthToSeason(currentMonth) : null;
        const currentTempBand = tempToBand(waterTemp);

        return getLureCatalog()
            .map(lure => {
                const speciesMatch = !speciesName || getLureSpecies(lure).includes(speciesName);
                if (!speciesMatch || (isIceFishing && !lure.ice_only) || (!isIceFishing && lure.ice_only)) {
                    return { ...lure, finalScore: 0 };
                }

                // Season filter: wrong season → score 0 (hard cutoff)
                const lureSeasons = lure?.best_conditions?.seasons;
                if (currentSeason && Array.isArray(lureSeasons) && lureSeasons.length > 0) {
                    if (!lureSeasons.includes(currentSeason)) {
                        return { ...lure, finalScore: 0 };
                    }
                }

                const category = getLureCategory(lure);
                const typeMatch = getStrategyMultiplier(category, strategyType);
                const clarityScore = getWaterClarityScore(lure, waterColor || 'Clear');

                // Temperature band penalty: mismatch → 0.5x multiplier
                let tempBandMult = 1.0;
                const lureTempBand = lure?.best_conditions?.temperature_band;
                if (currentTempBand && lureTempBand) {
                    if (!isTempInBand(currentTempBand, lureTempBand)) {
                        tempBandMult = TEMP_BAND_PENALTY;
                    }
                }

                return { ...lure, finalScore: clarityScore * typeMatch * tempBandMult * biteProb };
            })
            .filter(lure => lure.finalScore > 0)
            .sort((a, b) => b.finalScore - a.finalScore)
            .slice(0, 3)
            .map(lure => ({
                name: lure.name,
                score: lure.finalScore,
                rank: lure.finalScore * 100 > 85 ? 'Excellent' : lure.finalScore * 100 > 65 ? 'Very Good' : 'Good',
                cover: Array.isArray(lure.target_cover) && lure.target_cover.length ? lure.target_cover[0] : 'Key structure',
                presentation: lure.presentation?.retrieve || lure.presentation?.notes || 'Match local forage and structure.',
                reason: lure.offline_match_reason || 'Offline lure catalog match.'
            }));
    }

    return { scoreLures, STRATEGY_CATEGORY_MAP };
}

module.exports = { createLureScorer };
