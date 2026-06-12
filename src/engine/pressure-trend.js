'use strict';

/**
 * Shared classification logic for pressure trend rate.
 * @param {number} hpaPerHour - Rate of pressure change in hPa per hour
 * @returns {{ hpaPerHour: number, classification: string, label: string }}
 */
function classifyTrend(hpaPerHour) {
    let classification, label;
    if (hpaPerHour <= -1.0) {
        classification = 'Rapidly Falling';
        label = 'Rapidly Falling — storm approaching, aggressive feed';
    } else if (hpaPerHour <= -0.3) {
        classification = 'Falling';
        label = 'Falling — active feeding expected';
    } else if (hpaPerHour <= 0.3) {
        classification = 'Stable';
        label = 'Stable — normal patterns';
    } else if (hpaPerHour < 1.0) {
        classification = 'Rising';
        label = 'Rising — feeding may slow';
    } else {
        classification = 'Rapidly Rising';
        label = 'Rapidly Rising — post-frontal, tough conditions';
    }
    return { hpaPerHour: Math.round(hpaPerHour * 100) / 100, classification, label };
}

/**
 * Record a pressure reading for a location.
 * NO-OP: Caching disabled per user request.
 * @param {string} location - Location identifier
 * @param {number} pressureHpa - Pressure in hPa
 * @param {number} [timestamp] - Optional timestamp override (for testing)
 */
function recordPressure(location, pressureHpa, timestamp) {
    // No-op: caching disabled
}

/**
 * Get pressure trend for a location.
 * NO CACHING: Always returns Unknown since we don't store readings.
 * Use computeTrendFromHistory() with API-provided data instead.
 * @param {string} location - Location identifier
 * @returns {{ hpaPerHour: number|null, classification: string, label: string }}
 */
function getPressureTrend(location) {
    return {
        hpaPerHour: null,
        classification: 'Unknown',
        label: 'Unknown — caching disabled, use API history'
    };
}

/**
 * Compute pressure trend from an array of historical readings (from weather API).
 * This provides immediate trend on first request without waiting for user re-queries.
 * @param {Array<{pressure: number, timestamp: number}>} readings
 * @returns {{ hpaPerHour: number|null, classification: string, label: string }}
 */
function computeTrendFromHistory(readings) {
    if (!Array.isArray(readings) || readings.length < 2) {
        return { hpaPerHour: null, classification: 'Unknown', label: 'Unknown — insufficient historical data' };
    }

    // Filter nulls in-place without creating intermediate array
    let validCount = 0;
    const sorted = new Array(readings.length);
    for (let i = 0; i < readings.length; i++) {
        const r = readings[i];
        if (r.pressure != null) {
            sorted[validCount++] = r;
        }
    }
    if (validCount < 2) {
        return { hpaPerHour: null, classification: 'Unknown', label: 'Unknown — insufficient historical data' };
    }
    sorted.length = validCount;
    
    sorted.sort((a, b) => a.timestamp - b.timestamp);
    const oldest = sorted[0];
    const newest = sorted[validCount - 1];
    const hoursElapsed = (newest.timestamp - oldest.timestamp) / (1000 * 60 * 60);

    if (hoursElapsed < 0.5) {
        return { hpaPerHour: null, classification: 'Unknown', label: 'Unknown — historical readings too close together' };
    }

    const hpaPerHour = (newest.pressure - oldest.pressure) / hoursElapsed;
    return classifyTrend(hpaPerHour);
}

/**
 * Clear the pressure cache (for testing).
 */
function clearPressureCache() {
    pressureCache.clear();
}

module.exports = { recordPressure, getPressureTrend, clearPressureCache, computeTrendFromHistory, classifyTrend };
