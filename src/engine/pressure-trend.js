'use strict';

const pressureCache = new Map();
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours
const MAX_ENTRIES = 20;

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
 * @param {string} location - Location identifier
 * @param {number} pressureHpa - Pressure in hPa
 * @param {number} [timestamp] - Optional timestamp override (for testing)
 */
function recordPressure(location, pressureHpa, timestamp) {
    const ts = timestamp || Date.now();
    if (!pressureCache.has(location)) {
        pressureCache.set(location, []);
    }
    const entries = pressureCache.get(location);
    entries.push({ pressure: pressureHpa, timestamp: ts });

    // Prune entries older than TTL
    const cutoff = ts - CACHE_TTL_MS;
    while (entries.length > 0 && entries[0].timestamp < cutoff) {
        entries.shift();
    }

    // Cap total entries per location
    while (entries.length > MAX_ENTRIES) {
        entries.shift();
    }

    // Remove empty location entries
    if (entries.length === 0) {
        pressureCache.delete(location);
    }
}

/**
 * Get pressure trend for a location based on cached readings.
 * @param {string} location - Location identifier
 * @returns {{ hpaPerHour: number|null, classification: string, label: string }}
 */
function getPressureTrend(location) {
    const entries = pressureCache.get(location);

    if (!entries || entries.length < 2) {
        return {
            hpaPerHour: null,
            classification: 'Unknown',
            label: 'Unknown — insufficient pressure data'
        };
    }

    const now = Date.now();
    const cutoff = now - CACHE_TTL_MS;
    
    // Find first and last valid entries without creating new array
    let firstIdx = -1, lastIdx = -1;
    for (let i = 0; i < entries.length; i++) {
        if (entries[i].timestamp >= cutoff) {
            if (firstIdx === -1) firstIdx = i;
            lastIdx = i;
        }
    }

    if (firstIdx === -1 || lastIdx === -1 || lastIdx <= firstIdx) {
        return {
            hpaPerHour: null,
            classification: 'Unknown',
            label: 'Unknown — insufficient pressure data'
        };
    }

    const oldest = entries[firstIdx];
    const newest = entries[lastIdx];
    const hoursElapsed = (newest.timestamp - oldest.timestamp) / (1000 * 60 * 60);

    if (hoursElapsed < 0.5) {
        return {
            hpaPerHour: null,
            classification: 'Unknown',
            label: 'Unknown — readings too close together'
        };
    }

    const hpaPerHour = (newest.pressure - oldest.pressure) / hoursElapsed;
    return classifyTrend(hpaPerHour);
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
