"use strict";

/**
 * Metabolic Efficiency Model — Plateau Curve
 *
 * Replaces the former cubic-decay model with a three-phase thermal performance
 * curve that matches real fish feeding behavior:
 *
 * - Rising phase (T_dorm → T_opt): Smoothstep interpolation — gradual activation
 *   of metabolic enzymes as water warms. Formula: x²(3 - 2x) where x = normalized
 *   position between dormancy and optimal temperature.
 *
 * - Plateau phase (T_opt → T_opt + 8°F): Efficiency holds at ~95-100% across a
 *   broad peak zone. Real fish thermal performance curves show a flat-topped
 *   plateau, not a sharp peak. Fish feed actively across a wide temperature band.
 *   [Source: Fry 1971 — compensatory vs lethal temperature responses;
 *    Brett 1971 — thermal performance curves for salmonids]
 *
 * - Decay phase (T_opt + 8°F → T_cease): Gradual linear decline from ~97% to
 *   feeding cessation (1%). Fish reduce feeding progressively as temperature
 *   approaches the species-specific feeding cessation boundary, not catastrophically.
 *
 * T_cease (feeding_cease_temp) is the upper boundary of active feeding (~85-90°F
 * for LMB), NOT the lethal limit / UILT / CTMax (~99°F). This is a feeding
 * prediction engine, not a survival model.
 * [Source: Carlander 1977 — Handbook of Freshwater Fishery Biology;
 *  state DNR feeding activity tables]
 */

/** PLATEAU_WIDTH: Temperature range above T_opt where efficiency holds near peak. [Source: Fry 1971; Brett 1971 — aerobic scope plateau spans ~8°F above preferred temperature] */
const PLATEAU_WIDTH = 8;

/** PLATEAU_MIN: Minimum efficiency held during plateau phase (at T_opt + PLATEAU_WIDTH). [Source: Brett 1971 — ~95% of peak aerobic scope maintained across plateau] */
const PLATEAU_MIN = 0.97;

/**
 * Calculate metabolic efficiency percentage.
 *
 * @param {number} currentTemp - Current water temperature (°F)
 * @param {{ opt?: number, dorm?: number, feeding_cease_temp?: number }} metrics - Species thermal metrics
 * @returns {number} Efficiency 1-100 (integer)
 */
function calculateMetabolicEfficiency(currentTemp, metrics) {
    const T_opt = metrics.opt || 72;
    const T_dorm = metrics.dorm || 45;

    // T_cease: species-specific feeding cessation temperature (NOT UILT/CTMax).
    // Fallback: opt + (opt - dorm) * 0.5 — backward compatible with old T_max calculation.
    const T_cease = metrics.feeding_cease_temp || (T_opt + (T_opt - T_dorm) * 0.5);

    const range = T_opt - T_dorm;

    if (range <= 0) return 50;

    // Phase 1: At or below dormancy
    if (currentTemp <= T_dorm) return 1;

    // Phase 4: At or above feeding cessation temperature
    if (currentTemp >= T_cease) return 1;

    // Phase 1: At optimal temperature → peak efficiency
    if (currentTemp === T_opt) return 100;

    let efficiency;

    if (currentTemp < T_opt) {
        // Rising phase: Smoothstep — gradual metabolic activation curve
        const x = (currentTemp - T_dorm) / range;
        efficiency = Math.pow(x, 2) * (3 - 2 * x);
    } else if (currentTemp <= T_opt + PLATEAU_WIDTH) {
        // Plateau phase: efficiency holds at PLATEAU_MIN to 1.0 (95-100%)
        // Linear interpolation from 1.0 at T_opt to PLATEAU_MIN at T_opt + PLATEAU_WIDTH
        const x = (currentTemp - T_opt) / PLATEAU_WIDTH;
        efficiency = 1.0 - (1.0 - PLATEAU_MIN) * x;
    } else {
        // Decay phase: gradual linear decline from PLATEAU_MIN to 0
        const plateauEnd = T_opt + PLATEAU_WIDTH;
        const decayRange = T_cease - plateauEnd;
        if (decayRange <= 0) {
            // T_cease is within plateau range — treat as at-cessation
            return 1;
        }
        const x = (currentTemp - plateauEnd) / decayRange;
        efficiency = PLATEAU_MIN * (1 - x);
    }

    return Math.round(Math.max(1, Math.min(100, efficiency * 100)));
}

module.exports = { calculateMetabolicEfficiency };
