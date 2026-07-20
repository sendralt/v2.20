"use strict";

/**
 * Thermocline Depth Estimation Model
 *
 * Estimates thermocline depth in stratified lakes based on latitude, month,
 * surface temperature, and wind-driven mixing. Used to adjust effective water
 * temperature for deep-dwelling species (walleye, trout, striped bass) during
 * summer stratification.
 *
 * Lake Stratification Physics:
 * - Epilimnion: Warm, mixed surface layer above the thermocline
 * - Thermocline (Metalimnion): Rapid temperature transition zone
 * - Hypolimnion: Cold, dense bottom layer (~50-59°F / 10-15°C)
 *
 * Thermocline forms when surface temperature exceeds ~68°F (20°C) and breaks
 * down during fall turnover. Depth varies with latitude, wind exposure, and
 * lake morphology.
 *
 * [Source: Wetzel 2001 — Limnology: Lake and River Ecosystems;
 *          Hutchinson 1957 — A Treatise on Limnology, Vol. 1;
 *          Imberger & Patterson 1990 — physical limnology]
 */

/**
 * STRATIFICATION_THRESHOLD: Surface temperature (°F) above which thermal
 * stratification develops. Below this, the water column is isothermal.
 * [Source: Wetzel 2001 — stratification begins at ~20°C / 68°F]
 */
const STRATIFICATION_THRESHOLD = 68;

/**
 * STRATIFIED_MONTHS: Months (1-12) when stratification is possible in the
 * northern hemisphere temperate zone. June through October.
 * [Source: Wetzel 2001 — seasonal stratification cycle]
 */
const STRATIFIED_MONTHS = [6, 7, 8, 9, 10];

/**
 * REFERENCE_LATITUDE: Mid-latitude reference point for depth calculation.
 */
const REFERENCE_LATITUDE = 45;

/**
 * BASE_THERMOCLINE_DEPTH: Default thermocline depth at reference latitude
 * with moderate wind. [Source: typical summer thermocline in temperate lakes
 * is 15-25 ft; Wetzel 2001]
 */
const BASE_THERMOCLINE_DEPTH = 18;

/**
 * LATITUDE_DEPTH_FACTOR: Feet of depth change per degree of latitude.
 * Higher latitudes (shorter warming season) → shallower thermocline.
 */
const LATITUDE_DEPTH_FACTOR = 0.4;

/**
 * HYPOLIMNION_BASE_TEMP: Typical hypolimnion (bottom layer) temperature
 * during summer stratification. Cold, dense water at 50-59°F.
 * [Source: Wetzel 2001 — hypolimnion temperatures in temperate lakes]
 */
const HYPOLIMNION_BASE_TEMP = 55;

/**
 * Estimate thermocline depth based on latitude, month, surface temperature,
 * and wind-driven mixing.
 *
 * Returns null during winter/spring (no stratification) or when surface temp
 * is below the stratification threshold. Returns depth in feet during
 * summer/fall when the lake is stratified.
 *
 * @param {number} lat - Latitude in decimal degrees
 * @param {number} month - Month (1-12)
 * @param {number} surfaceTempF - Surface water temperature in °F
 * @param {number|null|undefined} windMph - Sustained wind speed in mph
 * @returns {number|null} Thermocline depth in feet, or null if unstratified
 */
function getThermoclineDepth(lat, month, surfaceTempF, windMph) {
    // No stratification outside summer/fall months
    if (!STRATIFIED_MONTHS.includes(month)) return null;

    // No stratification if surface temp is too cool
    if (surfaceTempF < STRATIFICATION_THRESHOLD) return null;

    // Base depth adjusted by latitude
    let depth = BASE_THERMOCLINE_DEPTH + (REFERENCE_LATITUDE - lat) * LATITUDE_DEPTH_FACTOR;

    // Wind-driven mixing: sustained wind deepens the epilimnion and pushes
    // the thermocline deeper. [Source: Imberger & Patterson 1990]
    if (windMph != null) {
        if (windMph > 15) depth += 4;       // Strong wind — significant deepening
        else if (windMph > 8) depth += 2;   // Moderate wind — slight deepening
        // Light wind (<8 mph) — no adjustment
    }

    // Clamp to physically reasonable range
    return Math.round(Math.max(10, Math.min(35, depth)));
}

/**
 * Get the effective water temperature at a species's preferred depth,
 * accounting for thermal stratification.
 *
 * - No thermocline (null): Returns surface temp (isothermal water column)
 * - Species in epilimnion (above thermocline): Returns surface temp
 * - Species at thermocline boundary: Blended temperature
 * - Species in hypolimnion (below thermocline): Returns cooler bottom temp
 *
 * The hypolimnion temperature is estimated based on thermocline depth —
 * deeper thermoclines indicate a more gradual thermal gradient and warmer
 * bottom water.
 *
 * @param {number} surfaceTempF - Surface water temperature in °F
 * @param {number|null} thermoclineDepth - Thermocline depth in feet (from getThermoclineDepth)
 * @param {number} speciesPreferredDepth - Species's typical dwelling depth in feet
 * @returns {number} Effective water temperature at the species's depth in °F
 */
function getEffectiveTemp(surfaceTempF, thermoclineDepth, speciesPreferredDepth) {
    // No stratification — entire water column is mixed at surface temp
    if (thermoclineDepth == null) return surfaceTempF;

    // Estimate hypolimnion temperature. Deeper thermoclines correlate with
    // warmer bottom water (more gradual thermal gradient).
    const hypoTemp = HYPOLIMNION_BASE_TEMP +
        (thermoclineDepth - BASE_THERMOCLINE_DEPTH) * 0.3;

    // Transition zone spans from 2ft above thermocline to 5ft below.
    // The thermocline itself IS the transition — species at the boundary
    // already experience partial cooling.
    const transitionStart = thermoclineDepth - 2;
    const transitionWidth = 7; // 2ft before + 5ft after thermocline

    // Species is in the epilimnion (warm surface layer, above transition)
    if (speciesPreferredDepth < transitionStart) {
        return surfaceTempF;
    }

    // Species is well below the transition zone — use hypolimnion temperature
    if (speciesPreferredDepth >= thermoclineDepth + 5) {
        return Math.round(hypoTemp);
    }

    // Species is in the thermocline transition zone — blend surface to hypolimnion
    const blendRatio = (speciesPreferredDepth - transitionStart) / transitionWidth;
    const effectiveTemp = surfaceTempF + (hypoTemp - surfaceTempF) * blendRatio;
    return Math.round(effectiveTemp);
}

module.exports = { getThermoclineDepth, getEffectiveTemp };
