"use strict";

/**
 * Photoperiod Model
 *
 * Computes day length, civil dawn, and civil dusk using standard solar
 * declination formulas. Used to refine time-of-day feeding predictions
 * with true dawn/dusk timing for any latitude and date.
 *
 * [Source: NOAA Solar Calculator — solar declination and hour angle formulas;
 *          Meeus 1998 — Astronomical Algorithms, Ch. 25;
 *          Cooper 1969 — The absorption of radiation in solar stills]
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * OBLIQUITY: Axial tilt of the Earth relative to the orbital plane.
 * [Source: Meeus 1998 — mean obliquity of the ecliptic]
 */
const OBLIQUITY = 23.45;

/**
 * CIVIL_TWILIGHT_ANGLE: Sun altitude angle for civil twilight (sun 6° below
 * horizon). [Source: NOAA — civil twilight definition]
 */
const CIVIL_TWILIGHT_ANGLE = -6;

/**
 * Compute solar declination for a given day of year.
 *
 * δ = 23.45° × sin(360°/365 × (284 + N))
 * where N is the day of year (1-365).
 *
 * [Source: Cooper 1969; NOAA Solar Calculator]
 *
 * @param {number} dayOfYear - Day of year (1-366)
 * @returns {number} Solar declination in degrees
 */
function getSolarDeclination(dayOfYear) {
    return OBLIQUITY * Math.sin(DEG2RAD * (360 / 365) * (284 + dayOfYear));
}

/**
 * Get day of year (1-366) from a Date object.
 *
 * @param {Date} date - JavaScript Date object
 * @returns {number} Day of year (1-366)
 */
function getDayOfYear(date) {
    const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
    const diff = date.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Compute day length (hours of sunlight) for a given latitude and date.
 *
 * Uses the hour angle formula:
 *   cos(H) = -tan(lat) × tan(δ)
 *   day length = 2H / 15°
 *
 * [Source: Meeus 1998 — sunrise/sunset equation]
 *
 * @param {number} lat - Latitude in decimal degrees (positive = north)
 * @param {Date|null} date - JavaScript Date object (null = now)
 * @returns {number} Day length in hours (0-24)
 */
function getDayLength(lat, date) {
    const targetDate = date || new Date();
    const dayOfYear = getDayOfYear(targetDate);
    const declination = getSolarDeclination(dayOfYear);

    const latRad = lat * DEG2RAD;
    const decRad = declination * DEG2RAD;

    const cosH = -Math.tan(latRad) * Math.tan(decRad);

    // Polar day (sun never sets) — clamp to 24h
    if (cosH < -1) return 24;
    // Polar night (sun never rises) — clamp to 0h
    if (cosH > 1) return 0;

    const H = Math.acos(cosH) * RAD2DEG;
    return Math.round((2 * H / 15) * 100) / 100;
}

/**
 * Compute civil dawn time (hours UTC) for a given latitude and date.
 *
 * Civil dawn occurs when the sun is 6° below the horizon in the morning.
 * Uses the civil twilight hour angle formula:
 *   cos(H_civil) = (-sin(6°) - sin(lat)×sin(δ)) / (cos(lat)×cos(δ))
 *
 * [Source: NOAA — civil twilight calculations]
 *
 * @param {number} lat - Latitude in decimal degrees
 * @param {Date|null} date - JavaScript Date object (null = now)
 * @returns {number} Civil dawn time in hours (0-24, relative to solar noon)
 */
function getCivilDawn(lat, date) {
    const targetDate = date || new Date();
    const dayOfYear = getDayOfYear(targetDate);
    const declination = getSolarDeclination(dayOfYear);

    const latRad = lat * DEG2RAD;
    const decRad = declination * DEG2RAD;

    // Civil twilight: sun altitude = -6°
    const altitudeSin = Math.sin(CIVIL_TWILIGHT_ANGLE * DEG2RAD);
    const cosHCivil = (altitudeSin - Math.sin(latRad) * Math.sin(decRad)) /
        (Math.cos(latRad) * Math.cos(decRad));

    // Polar conditions — clamp
    if (cosHCivil < -1) return 0;  // Sun never drops below civil twilight
    if (cosHCivil > 1) return 12;   // Sun never rises

    const H = Math.acos(cosHCivil) * RAD2DEG;
    // Solar noon is at 12:00 local solar time
    return Math.round((12 - H / 15) * 100) / 100;
}

/**
 * Compute civil dusk time (hours UTC) for a given latitude and date.
 *
 * Civil dusk occurs when the sun is 6° below the horizon in the evening.
 *
 * [Source: NOAA — civil twilight calculations]
 *
 * @param {number} lat - Latitude in decimal degrees
 * @param {Date|null} date - JavaScript Date object (null = now)
 * @returns {number} Civil dusk time in hours (0-24, relative to solar noon)
 */
function getCivilDusk(lat, date) {
    const targetDate = date || new Date();
    const dayOfYear = getDayOfYear(targetDate);
    const declination = getSolarDeclination(dayOfYear);

    const latRad = lat * DEG2RAD;
    const decRad = declination * DEG2RAD;

    const altitudeSin = Math.sin(CIVIL_TWILIGHT_ANGLE * DEG2RAD);
    const cosHCivil = (altitudeSin - Math.sin(latRad) * Math.sin(decRad)) /
        (Math.cos(latRad) * Math.cos(decRad));

    if (cosHCivil < -1) return 24;  // Sun never drops below civil twilight
    if (cosHCivil > 1) return 12;    // Sun never rises

    const H = Math.acos(cosHCivil) * RAD2DEG;
    return Math.round((12 + H / 15) * 100) / 100;
}

module.exports = { getDayLength, getCivilDawn, getCivilDusk, getSolarDeclination, getDayOfYear };
