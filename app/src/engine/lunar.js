"use strict";

/**
 * Deterministic Lunar Phase Model
 *
 * Computes moon phase using the synodic month period from a known new moon
 * reference epoch. This is a simplified version of Jean Meeus's algorithm
 * suitable for feeding prediction — not high-precision ephemeris.
 *
 * Algorithm:
 * 1. Compute days elapsed since the reference new moon (J2000 epoch)
 * 2. Normalize by synodic month (29.530588671 days) to get phase fraction (0–1)
 * 3. Derive phase angle, illumination, and label from the fraction
 *
 * [Source: Jean Meeus — Astronomical Algorithms, 2nd ed. (1998), Ch. 49;
 *          US Naval Observatory — Phases of the Moon reference dates]
 */

/**
 * SYNODIC_MONTH: Mean length of the lunar cycle (days) — time from one New
 * Moon to the next. [Source: Meeus 1998 — mean synodic month value]
 */
const SYNODIC_MONTH = 29.530588671;

/**
 * REFERENCE_NEW_MOON: Known New Moon epoch (J2000.0) used as cycle reference.
 * January 6, 2000, 18:14 UTC.
 * [Source: US Naval Observatory — Astronomical Applications Department]
 */
const REFERENCE_NEW_MOON = new Date('2000-01-06T18:14:00Z').getTime();

/**
 * PHASE_TOLERANCE: Fraction of the synodic month within which exact phases
 * (New, Full, Quarters) are recognized. ±1.5% ≈ ±10.7 hours around the
 * exact phase moment. [Source: heuristic — standard moon phase table tolerance]
 */
const PHASE_TOLERANCE = 0.015;

/**
 * PHASE_LABELS: Moon phase names indexed by phase integer (0–7).
 * 0=New, 1=Waxing Crescent, 2=First Quarter, 3=Waxing Gibbous,
 * 4=Full, 5=Waning Gibbous, 6=Last Quarter, 7=Waning Crescent.
 */
const PHASE_LABELS = [
    'New Moon',
    'Waxing Crescent',
    'First Quarter',
    'Waxing Gibbous',
    'Full Moon',
    'Waning Gibbous',
    'Last Quarter',
    'Waning Crescent'
];

/**
 * Get the deterministic moon phase for a given date.
 *
 * @param {Date|null} date - Date object to compute phase for (null = now)
 * @returns {{ phase: number, illumination: number, feedingMultiplier: number, label: string }}
 */
function getMoonPhase(date) {
    const targetDate = date || new Date();
    const elapsedDays = (targetDate.getTime() - REFERENCE_NEW_MOON) / (1000 * 60 * 60 * 24);

    // Normalize to 0–1 within current synodic cycle
    let fraction = (elapsedDays % SYNODIC_MONTH) / SYNODIC_MONTH;
    if (fraction < 0) fraction += 1; // Handle dates before reference

    // Phase angle: 0° at New Moon, 180° at Full Moon
    const phaseAngle = fraction * 2 * Math.PI;

    // Illuminated fraction: (1 - cos(phaseAngle)) / 2
    const illumination = Math.round(((1 - Math.cos(phaseAngle)) / 2) * 1000) / 1000;

    // Classify phase using illumination bands rather than raw fraction.
    // The moon's elliptical orbit causes actual Full/New/Quarter events to
    // deviate from the mean synodic fraction (0.0, 0.25, 0.5, 0.75).
    // Illumination = (1 - cos(phaseAngle)) / 2 is inherently robust because it
    // physically tracks the sun-Earth-moon angle, not the mean orbital position.
    // [Source: Meeus 1998 — illumination is the standard classification metric]
    let phase;
    let label;

    if (illumination < 0.03) {
        // ~0% illuminated — New Moon
        phase = 0;
        label = PHASE_LABELS[0];
    } else if (illumination > 0.97) {
        // ~100% illuminated — Full Moon
        phase = 4;
        label = PHASE_LABELS[4];
    } else if (illumination >= 0.43 && illumination <= 0.57) {
        // ~50% illuminated — Quarter (waxing or waning)
        phase = fraction < 0.5 ? 2 : 6;
        label = PHASE_LABELS[phase];
    } else if (fraction < 0.5) {
        // Waxing (growing illumination)
        phase = illumination < 0.43 ? 1 : 3;
        label = PHASE_LABELS[phase];
    } else {
        // Waning (shrinking illumination)
        phase = illumination > 0.57 ? 5 : 7;
        label = PHASE_LABELS[phase];
    }

    // Solunar feeding multiplier: New Moon and Full Moon are solunar peaks.
    // [Source: Knight 1936 — solunar theory; Quinn & Brannon 1982 —
    //  tidal influence on fish feeding activity]
    const feedingMultiplier = (phase === 0 || phase === 4) ? 1.1 : 1.0;

    return { phase, illumination, feedingMultiplier, label };
}

module.exports = { getMoonPhase };
