"use strict";

/**
 * Metabolic Efficiency Model
 *
 * Uses a composite curve to model fish metabolic activity vs water temperature:
 * - Rising phase (T_dorm → T_opt): Smoothstep interpolation — gradual activation
 *   of metabolic enzymes as water warms. Formula: x²(3 - 2x) where x = normalized
 *   position between dormancy and optimal temperature.
 * - Crash phase (T_opt → T_max): Cubic decay — rapid collapse of aerobic scope
 *   once temperature exceeds the biological optimum. Formula: (1-x)³ where x =
 *   normalized position between optimal and lethal limit.
 *
 * This produces a left-skewed thermal performance curve consistent with
 * ichthyological research on Q10 temperature coefficients and aerobic scope.
 */

/**
 * Calculate metabolic efficiency percentage.
 * @param {number} currentTemp - Current water temperature (°F)
 * @param {{ opt: number, dorm: number }} metrics - Species thermal metrics
 * @returns {number} Efficiency 1-100 (integer)
 */
function calculateMetabolicEfficiency(currentTemp, metrics) {
    const T_opt = metrics.opt || 72;
    const T_dorm = metrics.dorm || 45;
    const range = T_opt - T_dorm;

    if (range <= 0) return 50;

    // Lethal limit: 50% of range above optimal — beyond this, aerobic collapse
    const T_max = T_opt + range * 0.5;

    if (currentTemp <= T_dorm) return 1;
    if (currentTemp >= T_max) return 1;
    if (currentTemp === T_opt) return 100;

    let efficiency;
    if (currentTemp < T_opt) {
        // Smoothstep: gradual metabolic activation curve
        const x = (currentTemp - T_dorm) / range;
        efficiency = Math.pow(x, 2) * (3 - 2 * x);
    } else {
        // Cubic decay: rapid aerobic collapse after T_opt
        const x = (currentTemp - T_opt) / (T_max - T_opt);
        efficiency = Math.pow(1 - x, 3);
    }

    return Math.round(Math.max(1, Math.min(100, efficiency * 100)));
}

module.exports = { calculateMetabolicEfficiency };
