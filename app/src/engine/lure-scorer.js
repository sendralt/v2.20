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
        const { speciesName, waterColor, strategyType, biteProb, isIceFishing } = params;
        return getLureCatalog()
            .map(lure => {
                const speciesMatch = !speciesName || getLureSpecies(lure).includes(speciesName);
                if (!speciesMatch || (isIceFishing && !lure.ice_only) || (!isIceFishing && lure.ice_only)) {
                    return { ...lure, finalScore: 0 };
                }
                const category = getLureCategory(lure);
                const typeMatch = getStrategyMultiplier(category, strategyType);
                const clarityScore = getWaterClarityScore(lure, waterColor || 'Clear');
                return { ...lure, finalScore: clarityScore * typeMatch * biteProb };
            })
            .filter(lure => lure.finalScore > 0)
            .sort((a, b) => b.finalScore - a.finalScore)
            .slice(0, 3)
            .map(lure => ({
                name: lure.name,
                rank: lure.finalScore * 100 > 85 ? 'Excellent' : lure.finalScore * 100 > 65 ? 'Very Good' : 'Good',
                cover: Array.isArray(lure.target_cover) && lure.target_cover.length ? lure.target_cover[0] : 'Key structure',
                presentation: lure.presentation?.retrieve || lure.presentation?.notes || 'Match local forage and structure.',
                reason: lure.offline_match_reason || 'Offline lure catalog match.'
            }));
    }

    return { scoreLures, STRATEGY_CATEGORY_MAP };
}

module.exports = { createLureScorer };
