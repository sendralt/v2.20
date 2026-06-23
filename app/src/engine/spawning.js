"use strict";

/**
 * Spawning Cycle Model
 *
 * Fish behavior changes dramatically across spawning phases:
 *
 * - Pre-spawn: Aggressive feeding to build energy reserves for reproduction.
 *   Fish are actively foraging and more vulnerable to angling. (1.2x multiplier)
 *
 * - Active spawn: Fish are on nests guarding eggs — minimal feeding.
 *   Largemouth bass, bluegill, and crappie guard nests aggressively but
 *   rarely feed during this period. (0.4x multiplier)
 *
 * - Post-spawn: Recovery period. Fish are exhausted from spawning and guard
 *   fry (bass/sunfish) or recover (walleye/pike). Reduced but resuming feeding.
 *   (0.7x multiplier)
 *
 * - Outside spawn season: Normal feeding behavior. (1.0x multiplier)
 *
 * Phase boundaries are temperature-driven and species-specific. Each species
 * has spawn_temp_start, spawn_temp_peak, and spawn_temp_end values from
 * fisheries literature.
 *
 * [Source: Carlander 1977 — Handbook of Freshwater Fishery Biology;
 *          Scott & Crossman 1973 — Freshwater Fishes of Canada;
 *          EPA 1986 — spawning temperature ranges for freshwater species]
 */

/**
 * PRE_SPAWN_MULTIPLIER: Aggressive feeding phase. Fish build energy reserves
 * before spawning. [Source: Carlander 1977]
 */
const PRE_SPAWN_MULTIPLIER = 1.2;

/**
 * ACTIVE_SPAWN_MULTIPLIER: Fish on nests, minimal feeding. Bass and sunfish
 * guard nests but strike lures from aggression, not hunger.
 * [Source: Heidinger 1976 — reproductive behavior of black bass]
 */
const ACTIVE_SPAWN_MULTIPLIER = 0.4;

/**
 * POST_SPAWN_MULTIPLIER: Recovery period. Fish resume feeding gradually.
 * [Source: Carlander 1977]
 */
const POST_SPAWN_MULTIPLIER = 0.7;

/**
 * OUTSIDE_SPAWN_MULTIPLIER: Normal feeding behavior outside spawn window.
 */
const OUTSIDE_SPAWN_MULTIPLIER = 1.0;

/**
 * POST_SPAWN_WINDOW: Temperature range (°F) above spawn_temp_end during which
 * fish are in post-spawn recovery. [Source: heuristic, calibrated against
 * state DNR spawning reports]
 */
const POST_SPAWN_WINDOW = 5;

/**
 * PRE_SPAWN_WINDOW: Temperature range (°F) below spawn_temp_start during which
 * fish enter aggressive pre-spawn feeding. Below this window, fish are in
 * normal/winter behavior — not yet building spawn reserves.
 * [Source: heuristic, calibrated against state DNR pre-spawn reports]
 */
const PRE_SPAWN_WINDOW = 10;

/**
 * Look up a species's spawn temperature data from fishingData.
 *
 * @param {string} speciesName - Name of the species
 * @param {Object} fishingData - Full fishing data object with species_data array
 * @returns {Object|null} Spawn temp data { spawn_temp_start, spawn_temp_peak, spawn_temp_end }
 */
function getSpeciesSpawnData(speciesName, fishingData) {
    if (!fishingData || !Array.isArray(fishingData.species_data)) return null;
    const species = fishingData.species_data.find(s => s.name === speciesName);
    if (!species || !species.scientific_metrics) return null;
    const m = species.scientific_metrics;
    if (m.spawn_temp_start == null || m.spawn_temp_end == null) return null;
    return {
        spawn_temp_start: m.spawn_temp_start,
        spawn_temp_peak: m.spawn_temp_peak || m.spawn_temp_start,
        spawn_temp_end: m.spawn_temp_end
    };
}

/**
 * Get the spawning-phase feeding multiplier for a species at a given temperature.
 *
 * Phase classification:
 * - temp <= spawn_temp_start → pre-spawn (1.2)
 * - spawn_temp_start < temp <= spawn_temp_end → active spawn (0.4)
 * - spawn_temp_end < temp <= spawn_temp_end + 5 → post-spawn (0.7)
 * - temp > spawn_temp_end + 5 → outside (1.0)
 *
 * @param {number} waterTempF - Current water temperature in °F
 * @param {string} speciesName - Name of the species
 * @param {Object} fishingData - Full fishing data object with species_data array
 * @returns {number} Feeding multiplier (0.4–1.2)
 */
function getSpawningMultiplier(waterTempF, speciesName, fishingData) {
    const spawnData = getSpeciesSpawnData(speciesName, fishingData);
    if (!spawnData) return OUTSIDE_SPAWN_MULTIPLIER;

    const { spawn_temp_start, spawn_temp_end } = spawnData;

    // Check from highest temperature downward to prevent fall-through errors

    // Outside: above post-spawn window
    if (waterTempF > spawn_temp_end + POST_SPAWN_WINDOW) return OUTSIDE_SPAWN_MULTIPLIER;

    // Post-spawn: between end (exclusive) and end + window (inclusive)
    if (waterTempF > spawn_temp_end) return POST_SPAWN_MULTIPLIER;

    // Active spawn: between start (exclusive) and end (inclusive)
    if (waterTempF > spawn_temp_start) return ACTIVE_SPAWN_MULTIPLIER;

    // Pre-spawn: within PRE_SPAWN_WINDOW below start temperature
    if (waterTempF > spawn_temp_start - PRE_SPAWN_WINDOW) return PRE_SPAWN_MULTIPLIER;

    // Outside: below pre-spawn window (winter/dormant)
    return OUTSIDE_SPAWN_MULTIPLIER;
}

module.exports = { getSpawningMultiplier };
