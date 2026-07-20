"use strict";

/**
 * Dissolved Oxygen (DO) Model — Wind-Driven Mixing Matrix
 *
 * Estimates oxygen availability using three mechanisms:
 *
 * 1. Temperature-dependent O2 solubility: Cold water dissolves more oxygen
 *    than warm water. At 32°F, water holds ~14.6 mg/L; at 86°F, only ~7.6 mg/L.
 *    [Source: Weiss 1970 — solubility of O2 in water; APHA Standard Methods]
 *
 * 2. Wind-driven re-aeration: Wind creates surface turbulence that replenishes
 *    oxygen from the atmosphere. Calm conditions allow stagnation deficits to
 *    accumulate as respiration and decomposition consume O2 without replenishment.
 *    [Source: O'Connor & Dobbins 1958 — re-aeration in natural streams;
 *             Banks & Herrera 1977 — wind effect on lake re-aeration]
 *
 * 3. Seasonal biological oxygen demand (BOD): Summer decomposition and algal
 *    respiration consume more oxygen than winter months.
 *    [Source: Wetzel 2001 — Limnology: Lake and River Ecosystems]
 *
 * Species-specific tolerance: Coldwater species (trout, salmon) require higher
 * DO (~5-6 mg/L) than warmwater species (catfish ~2-3 mg/L, bass ~4 mg/L).
 * Fish reduce feeding below 4 mg/L and approach lethal levels below 2 mg/L.
 * [Source: EPA 1986 — Ambient Water Quality Criteria for Dissolved Oxygen;
 *         Kramer 1987 — DO requirements for freshwater fish]
 */

/**
 * DEFAULT_DO_TOLERANCE: mg/L threshold below which most freshwater gamefish
 * begin reducing feeding activity. 4.0 mg/L is the EPA feeding cutoff for
 * warmwater species. [Source: EPA 1986 — DO criteria for fish feeding]
 */
const DEFAULT_DO_TOLERANCE = 4.0;

/**
 * OPTIMAL_DO_MARGIN: mg/L above species tolerance where DO is considered optimal.
 * At tolerance + OPTIMAL_DO_MARGIN, the multiplier reaches 1.0.
 */
const OPTIMAL_DO_MARGIN = 2.0;

/**
 * Estimate O2 saturation concentration from water temperature using the
 * Benson & Krause (1984) polynomial, ratified by USGS and APHA Standard
 * Methods for freshwater at 1 atm pressure and 0 salinity.
 *
 *   ln(C*) = A1 + A2/T + A3/T² + A4/T³ + A5/T⁴
 *
 * where T is absolute temperature in Kelvin and C* is the saturation
 * concentration in mg/L.
 *
 * [Source: Benson & Krause 1984 — "The concentration of oxygen dissolved
 *  in freshwater at various temperatures and pressures";
 *  USGS TWRI Book 9, Chapter A6.2 — Dissolved Oxygen]
 *
 * NOTE: Does not yet correct for altitude/barometric pressure. At
 * elevations above ~1,000 ft, apply the multiplicative correction
 * factor (P_local / P_standard) from the same source. Planned enhancement.
 *
 * @param {number} tempF - Water temperature in °F
 * @returns {number} Dissolved oxygen saturation in mg/L
 */
function estimateDOSaturation(tempF) {
    const tempC = (tempF - 32) * 5 / 9;
    const T = tempC + 273.15; // Kelvin

    const A1 = -139.34411;
    const A2 =  1.575701e5;
    const A3 = -6.642308e7;
    const A4 =  1.243800e10;
    const A5 = -8.621949e11;

    const lnC = A1
        + A2 / T
        + A3 / Math.pow(T, 2)
        + A4 / Math.pow(T, 3)
        + A5 / Math.pow(T, 4);

    return Math.exp(lnC);
}

/**
 * Stagnation deficit: how far below saturation DO falls due to lack of
 * wind-driven re-aeration. In calm conditions, respiration and decomposition
 * consume O2 without atmospheric replenishment, creating large deficits.
 * [Source: Banks & Herrera 1977 — effect of wind on lake re-aeration rates]
 *
 * @param {number|null|undefined} windMph - Wind speed in mph
 * @returns {number} O2 deficit in mg/L
 */
function getStagnationDeficit(windMph) {
    if (windMph == null) return 1.0; // Unknown wind — slight assumption
    if (windMph < 3) return 2.5;     // Dead calm — significant deficit
    if (windMph <= 8) return 1.0;   // Light breeze — moderate deficit
    if (windMph <= 15) return 0.3;  // Moderate wind — minimal deficit
    return 0.0;                      // Strong wind — full re-aeration
}

/**
 * Seasonal biological oxygen demand (BOD) by month.
 * Summer months (Jun-Aug) have peak decomposition and algal respiration.
 * Winter months have minimal biological activity.
 * [Source: Wetzel 2001 — Limnology; seasonal BOD variation in temperate lakes]
 *
 * @param {number} month - Month (1-12)
 * @returns {number} BOD deduction in mg/L
 */
function getSeasonalBOD(month) {
    const BOD_BY_MONTH = {
        1: 0.2,  2: 0.2,  3: 0.4,   // Winter
        4: 0.6,  5: 0.8,  6: 1.2,   // Spring → Summer
        7: 1.5,  8: 1.5,  9: 1.0,   // Peak summer → Fall
        10: 0.6, 11: 0.4, 12: 0.2   // Fall → Winter
    };
    return BOD_BY_MONTH[month] || 0.6;
}

/**
 * Convert estimated DO level to a feeding multiplier based on species tolerance.
 *
 * Multiplier mapping (linear interpolation between thresholds):
 * - DO >= tolerance + 2.0 mg/L → 1.0 (optimal)
 * - DO >= tolerance → 0.7 to 1.0 (reduced but adequate)
 * - DO >= tolerance - 1.0 → 0.5 to 0.7 (stressed)
 * - DO < tolerance - 1.0 → 0.5 (critical floor)
 *
 * Fish cease feeding below ~4 mg/L and approach lethal levels below 2 mg/L.
 * [Source: EPA 1986 — DO criteria; Kramer 1987 — feeding cessation at low DO]
 *
 * @param {number} doLevel - Estimated dissolved oxygen in mg/L
 * @param {number} tolerance - Species DO tolerance threshold in mg/L
 * @returns {number} Feeding multiplier (0.5–1.0)
 */
function doLevelToMultiplier(doLevel, tolerance) {
    const threshold = tolerance;
    const optimal = tolerance + OPTIMAL_DO_MARGIN;
    const critical = tolerance - 1.0;

    if (doLevel >= optimal) return 1.0;
    if (doLevel >= threshold) {
        // Linear: 0.7 at threshold → 1.0 at optimal
        return 0.7 + 0.3 * (doLevel - threshold) / OPTIMAL_DO_MARGIN;
    }
    if (doLevel >= critical) {
        // Linear: 0.5 at critical → 0.7 at threshold
        return 0.5 + 0.2 * (doLevel - critical);
    }
    return 0.5; // Critical floor
}

/**
 * Get the dissolved oxygen feeding multiplier.
 *
 * Combines temperature-based O2 solubility, wind-driven re-aeration,
 * and seasonal BOD to estimate actual DO, then maps to a species-specific
 * feeding multiplier.
 *
 * @param {number} waterTempF - Water temperature in °F
 * @param {number} month - Month (1-12)
 * @param {number|null|undefined} windMph - Wind speed in mph
 * @param {{ do_tolerance?: number }|null} speciesMetrics - Species DO tolerance data
 * @returns {number} Feeding multiplier (0.5–1.0)
 */
function getDOMultiplier(waterTempF, month, windMph, speciesMetrics) {
    const rawTolerance = (speciesMetrics && speciesMetrics.do_tolerance) || DEFAULT_DO_TOLERANCE;
    // Map string tolerance levels to mg/L thresholds.
    // High = coldwater species (trout, walleye) need >=5 mg/L;
    // Moderate = coolwater/warmwater gamefish (bass, crappie) need >=4 mg/L;
    // Low = tolerant species (catfish, bullhead) can handle >=3 mg/L.
    // [Source: EPA 1986 — DO criteria by species class]
    const TOLERANCE_MAP = { 'High': 5.0, 'Moderate': 4.0, 'Low': 3.0 };
    const tolerance = typeof rawTolerance === 'string'
        ? (TOLERANCE_MAP[rawTolerance] || DEFAULT_DO_TOLERANCE)
        : (typeof rawTolerance === 'number' ? rawTolerance : DEFAULT_DO_TOLERANCE);

    const doSaturation = estimateDOSaturation(waterTempF);
    const stagnationDeficit = getStagnationDeficit(windMph);
    const bod = getSeasonalBOD(month);

    const estimatedDO = doSaturation - stagnationDeficit - bod;

    const multiplier = doLevelToMultiplier(estimatedDO, tolerance);

    return Math.max(0.5, Math.min(1.0, multiplier));
}

module.exports = { getDOMultiplier };
