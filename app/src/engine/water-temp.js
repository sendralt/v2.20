'use strict';

// Approximate weekly rate of air temp change (°F/week) in temperate North America.
// Positive = warming (spring), Negative = cooling (fall).
const SEASONAL_RATES = { 1:-1, 2:+1, 3:+3, 4:+3, 5:+2, 6:+1, 7:+0.5, 8:-0.5, 9:-2, 10:-3, 11:-3, 12:-1 };

/**
 * Seasonal baseline water temperatures (°F) by latitude band.
 * Three climate zones based on US EPA water quality monitoring regions and
 * USGS regional water temperature summaries.
 * [Source: EPA National Water Quality Assessment; USGS Water Data — regional summaries]
 *
 * TEMPERATE (>45N): cold winters, moderate summers — Great Lakes, Northern US, Canada
 * SUBTROPICAL (30-45N): mild winters, warm summers — Southern US, Gulf states
 * TROPICAL (<30N): warm year-round — South Florida, Caribbean, Central America
 */
const LATITUDE_BAND_BASE_TEMPS = {
    // Temperate zone (>45N) — existing calibrated baseline
    temperate: { 1:34, 2:35, 3:40, 4:48, 5:58, 6:68, 7:75, 8:76, 9:68, 10:58, 11:48, 12:38 },
    // Subtropical zone (30-45N) — milder winters, similar peak summers
    subtropical: { 1:48, 2:50, 3:55, 4:62, 5:70, 6:78, 7:82, 8:82, 9:78, 10:70, 11:60, 12:52 },
    // Tropical zone (<30N) — warm winters, slightly higher summer baselines
    tropical: { 1:60, 2:62, 3:66, 4:72, 5:78, 6:82, 7:84, 8:84, 9:82, 10:78, 11:70, 12:64 }
};

// Backward-compatible alias: temperate zone baseline (original SEASONAL_BASE_TEMPS)
const SEASONAL_BASE_TEMPS = LATITUDE_BAND_BASE_TEMPS.temperate;

/**
 * Determine the latitude band name from absolute latitude value.
 * @param {number} lat - Latitude (positive or negative)
 * @returns {'temperate'|'subtropical'|'tropical'} Band name
 */
function getLatitudeBand(lat) {
    const absLat = Math.abs(lat);
    if (absLat > 45) return 'temperate';
    if (absLat >= 30) return 'subtropical';
    return 'tropical';
}

/**
 * Get latitude-adjusted seasonal baseline water temperature.
 * Uses climate-zone-specific baselines to account for subtropical and tropical
 * water bodies that never experience temperate-zone winter cooling.
 * Falls back to temperate baseline for invalid latitude.
 * @param {number} month - Month number (1-12)
 * @param {number} [lat=45] - Latitude (defaults to temperate for backward compat)
 * @returns {number} Baseline water temperature in °F
 */
function getSeasonalBaseTemp(month, lat) {
    const band = lat != null ? getLatitudeBand(lat) : 'temperate';
    const baseTemps = LATITUDE_BAND_BASE_TEMPS[band];
    return baseTemps[month] || 50;
}

// USGS Configuration
const USGS_BASE_URL = 'https://waterservices.usgs.gov/nwis';
const WATER_TEMP_PARAM_C = '00010';  // Temperature, water, degrees Celsius
const WATER_TEMP_PARAM_F = '00011';  // Temperature, water, degrees Fahrenheit (if available)
const MAX_STATION_DISTANCE_MILES = 50;  // Maximum acceptable distance to monitoring station
const USGS_SITE_TYPES = 'LK,ST,SP';
const USGS_BBOX_DECIMAL_PLACES = 6;
const USGS_REQUEST_TIMEOUT_MS = 15000;

/**
 * Estimate water temperature from air temperature using a first-order thermal lag model.
 * Water responds to air temp changes with ~5 day lag, damped to ~70%.
 * Spring: water cooler than air. Fall: water warmer than air.
 * @param {number} airTempF - Air temperature in °F
 * @param {number} month - Month number (1-12)
 * @returns {number} Estimated water temperature in °F (min 32)
 */
function estimateWaterTemp(airTempF, month) {
    const lagDays = 5;
    const ratePerDay = (SEASONAL_RATES[month] || 0) / 7;
    const waterTemp = airTempF - (ratePerDay * lagDays * 0.7);
    return Math.max(32, Math.round(waterTemp));
}

/**
 * Hybrid water temperature estimate combining seasonal baseline with air temperature.
 * Uses 70% seasonal baseline + 30% current air temperature.
 * More stable than pure air-temp estimation during weather fluctuations.
 * Latitude adjusts the seasonal baseline for subtropical/tropical zones.
 * @param {number} airTempF - Air temperature in °F
 * @param {number} month - Month number (1-12)
 * @param {number} [lat] - Latitude (adjusts baseline by climate zone; defaults to temperate)
 * @returns {number} Estimated water temperature in °F (min 32)
 */
function estimateWaterTempHybrid(airTempF, month, lat) {
    const seasonalBase = getSeasonalBaseTemp(month, lat);
    const waterTemp = (seasonalBase * 0.7) + (airTempF * 0.3);
    return Math.max(32, Math.round(waterTemp));
}

/**
 * Calculate distance between two coordinates using Haversine formula.
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in miles
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Convert Celsius to Fahrenheit.
 * @param {number} celsius - Temperature in Celsius
 * @returns {number} Temperature in Fahrenheit
 */
function celsiusToFahrenheit(celsius) {
    return (celsius * 9 / 5) + 32;
}

/**
 * Round coordinates to a precision accepted by the USGS site service.
 * @param {number} value
 * @returns {string}
 */
function formatUsgsCoordinate(value) {
    return value.toFixed(USGS_BBOX_DECIMAL_PLACES);
}

/**
 * Execute a single USGS IV query for a given bounding box.
 * Uses PT2H period to minimize response size while still getting recent readings.
 * @param {number} lat - Center latitude
 * @param {number} lon - Center longitude
 * @param {number} delta - Bounding box half-width in degrees
 * @param {number} timeoutMs - Request timeout in milliseconds
 * @returns {Promise<Array>} Parsed stations with latest readings
 */
async function queryUSGSStations(lat, lon, delta, timeoutMs) {
    const minLat = Math.max(-90, lat - delta);
    const maxLat = Math.min(90, lat + delta);
    const minLon = lon - delta;
    const maxLon = lon + delta;
    const bBox = [minLon, minLat, maxLon, maxLat].map(formatUsgsCoordinate).join(',');

    const url = `${USGS_BASE_URL}/iv/?format=json&bBox=${bBox}&parameterCd=${WATER_TEMP_PARAM_C}&period=PT2H&siteType=${USGS_SITE_TYPES}`;
    const response = await fetch(url, {
        headers: { 'Accept': 'application/json', 'Accept-Encoding': 'identity' },
        signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
        throw new Error(`USGS IV station search returned ${response.status}`);
    }

    const data = await response.json();
    const timeSeries = data.value?.timeSeries || [];

    return timeSeries.map(ts => {
        const siteInfo = ts.sourceInfo;
        const siteCode = siteInfo?.siteCode?.[0]?.value || 'unknown';
        const siteName = siteInfo?.siteName || 'Unknown Station';
        const siteLat = parseFloat(siteInfo?.geoLocation?.geogLocation?.latitude);
        const siteLon = parseFloat(siteInfo?.geoLocation?.geogLocation?.longitude);
        const values = ts.values?.[0]?.value;
        const latest = values?.[values.length - 1];
        const tempCelsius = parseFloat(latest?.value);

        if (isNaN(siteLat) || isNaN(siteLon) || isNaN(tempCelsius)) {
            return null;
        }

        return {
            siteCode,
            siteName,
            latitude: siteLat,
            longitude: siteLon,
            distance: calculateDistance(lat, lon, siteLat, siteLon),
            variableName: ts.variable?.variableName || 'Water temperature',
            celsius: tempCelsius,
            fahrenheit: celsiusToFahrenheit(tempCelsius),
            timestamp: latest?.dateTime || new Date().toISOString()
        };
    }).filter(Boolean).sort((a, b) => a.distance - b.distance);
}

// FCC Area API for reverse-geocoding lat/lon to county FIPS codes
const FCC_AREA_API = 'https://geo.fcc.gov/api/census/area';
const FCC_TIMEOUT_MS = 5000;
const COUNTY_SEARCH_OFFSET = 0.4; // ~28 miles — covers adjacent counties

/**
 * Look up nearby county FIPS codes using the FCC Census Area API.
 * Queries the target point plus 8 surrounding offset points to discover adjacent counties.
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<string[]>} Array of unique 5-digit county FIPS codes
 */
async function findNearbyCounties(lat, lon) {
    const offsets = [
        [0, 0],
        [COUNTY_SEARCH_OFFSET, 0], [-COUNTY_SEARCH_OFFSET, 0],
        [0, COUNTY_SEARCH_OFFSET], [0, -COUNTY_SEARCH_OFFSET],
        [COUNTY_SEARCH_OFFSET, COUNTY_SEARCH_OFFSET], [-COUNTY_SEARCH_OFFSET, -COUNTY_SEARCH_OFFSET],
        [COUNTY_SEARCH_OFFSET, -COUNTY_SEARCH_OFFSET], [-COUNTY_SEARCH_OFFSET, COUNTY_SEARCH_OFFSET]
    ];

    const counties = new Set();
    const promises = offsets.map(([dlat, dlon]) =>
        fetch(`${FCC_AREA_API}?lat=${lat + dlat}&lon=${lon + dlon}&format=json`, {
            headers: { 'Accept': 'application/json', 'Accept-Encoding': 'identity' },
            signal: AbortSignal.timeout(FCC_TIMEOUT_MS)
        })
            .then(r => r.json())
            .then(d => { const fips = d.results?.[0]?.county_fips; if (fips) counties.add(fips); })
            .catch(() => { /* ignore individual failures — offshore/border points */ })
    );

    await Promise.all(promises);
    return [...counties];
}

/**
 * Query USGS IV service by county FIPS codes instead of bounding box.
 * County-indexed queries are consistently fast (~300ms) even in regions where
 * bbox queries time out (e.g. Great Lakes).
 * @param {number} lat - Center latitude (for distance calculation)
 * @param {number} lon - Center longitude (for distance calculation)
 * @param {string[]} countyCodes - Array of 5-digit county FIPS codes
 * @returns {Promise<Array>} Parsed stations sorted by distance
 */
async function queryUSGSByCounty(lat, lon, countyCodes) {
    if (!countyCodes.length) return [];

    const url = `${USGS_BASE_URL}/iv/?format=json&parameterCd=${WATER_TEMP_PARAM_C}&period=PT2H&siteType=${USGS_SITE_TYPES}&countyCd=${countyCodes.join(',')}`;
    const response = await fetch(url, {
        headers: { 'Accept': 'application/json', 'Accept-Encoding': 'identity' },
        signal: AbortSignal.timeout(USGS_REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
        throw new Error(`USGS county search returned ${response.status}`);
    }

    const data = await response.json();
    const timeSeries = data.value?.timeSeries || [];

    return timeSeries.map(ts => {
        const siteInfo = ts.sourceInfo;
        const siteCode = siteInfo?.siteCode?.[0]?.value || 'unknown';
        const siteName = siteInfo?.siteName || 'Unknown Station';
        const siteLat = parseFloat(siteInfo?.geoLocation?.geogLocation?.latitude);
        const siteLon = parseFloat(siteInfo?.geoLocation?.geogLocation?.longitude);
        const values = ts.values?.[0]?.value;
        const latest = values?.[values.length - 1];
        const tempCelsius = parseFloat(latest?.value);

        if (isNaN(siteLat) || isNaN(siteLon) || isNaN(tempCelsius)) return null;

        return {
            siteCode, siteName,
            latitude: siteLat, longitude: siteLon,
            distance: calculateDistance(lat, lon, siteLat, siteLon),
            variableName: ts.variable?.variableName || 'Water temperature',
            celsius: tempCelsius,
            fahrenheit: celsiusToFahrenheit(tempCelsius),
            timestamp: latest?.dateTime || new Date().toISOString()
        };
    }).filter(Boolean).sort((a, b) => a.distance - b.distance);
}

// Small bbox for the fast first attempt (~50 miles)
const SMALL_BBOX_DELTA = 0.72;

/**
 * Find nearby USGS stations with current water temperature readings.
 * Two-step strategy:
 *   Step 1 — Small bbox IV query (~300ms, works for most populated areas)
 *   Step 2 — County-based fallback via FCC API + USGS countyCd (~1.1s total,
 *            reliable even for Great Lakes / remote areas where bbox queries time out)
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} radiusMiles - Maximum acceptable distance (default: 50 miles)
 * @returns {Promise<Array>} Nearby stations with latest readings sorted by distance
 */
async function findNearbyStations(lat, lon, radiusMiles = MAX_STATION_DISTANCE_MILES) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        console.warn('USGS station search skipped: invalid coordinates', { lat, lon });
        return [];
    }

    // Step 1: Fast small-bbox search
    try {
        const stations = await queryUSGSStations(lat, lon, SMALL_BBOX_DELTA, USGS_REQUEST_TIMEOUT_MS);
        if (stations.length > 0) {
            return stations.filter(s => s.distance <= radiusMiles);
        }
    } catch (error) {
        console.warn('USGS small-bbox search failed:', error.message);
    }

    // Step 2: County-based fallback — find nearby counties via FCC, then query USGS by countyCd
    try {
        const counties = await findNearbyCounties(lat, lon);
        if (counties.length > 0) {
            const stations = await queryUSGSByCounty(lat, lon, counties);
            return stations.filter(s => s.distance <= radiusMiles);
        }
    } catch (error) {
        console.warn('USGS county-based search failed:', error.message);
    }

    return [];
}

// In-memory cache for water temp results (same pattern as pressure-trend cache)
const _waterTempCache = new Map();
const WATER_TEMP_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Get live water temperature from USGS or fall back to estimation.
 * Primary method: USGS monitoring stations within 50 miles
 * Fallback: Hybrid estimation using seasonal baseline + air temperature
 * 
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} airTempF - Current air temperature (°F) for fallback
 * @param {number} month - Current month (1-12) for fallback
 * @param {number} maxDistanceMiles - Maximum acceptable station distance (default: 50)
 * @returns {Promise<Object>} Water temperature result with source info
 */
async function getLiveWaterTemp(lat, lon, airTempF, month, maxDistanceMiles = MAX_STATION_DISTANCE_MILES) {
    const cacheKey = `${Math.round(lat * 100)},${Math.round(lon * 100)}`;
    const cached = _waterTempCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < WATER_TEMP_CACHE_TTL_MS) return cached.data;
    const cache = (data) => { _waterTempCache.set(cacheKey, { data, ts: Date.now() }); return data };

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        const estimated = estimateWaterTempHybrid(airTempF, month, lat);
        return cache({
            waterTempF: estimated,
            waterTempC: (estimated - 32) * 5 / 9,
            source: 'estimated',
            method: 'hybrid-thermal-lag',
            stationName: null,
            stationDistance: null,
            timestamp: new Date().toISOString(),
            note: 'Invalid coordinates - using estimation'
        });
    }

    try {
        const stations = await findNearbyStations(lat, lon, maxDistanceMiles);
        const nearestStation = stations.find(station => station.distance <= maxDistanceMiles) || null;

        if (!nearestStation) {
            const estimated = estimateWaterTempHybrid(airTempF, month, lat);
            return cache({
                waterTempF: estimated,
                waterTempC: (estimated - 32) * 5 / 9,
                source: 'estimated',
                method: 'hybrid-thermal-lag',
                stationName: null,
                stationDistance: null,
                timestamp: new Date().toISOString(),
                note: `No current USGS water temperature readings within ${maxDistanceMiles} miles`
            });
        }

        return cache({
            waterTempF: Math.round(nearestStation.fahrenheit),
            waterTempC: Math.round(nearestStation.celsius * 10) / 10,
            source: 'usgs-live',
            method: 'monitoring-station',
            stationName: nearestStation.siteName,
            stationDistance: Math.round(nearestStation.distance * 10) / 10,
            stationCode: nearestStation.siteCode,
            timestamp: nearestStation.timestamp
        });

    } catch (error) {
        console.error('Water temperature service error:', error.message);
        const estimated = estimateWaterTempHybrid(airTempF, month, lat);
        return cache({
            waterTempF: estimated,
            waterTempC: (estimated - 32) * 5 / 9,
            source: 'estimated',
            method: 'hybrid-thermal-lag',
            stationName: null,
            stationDistance: null,
            timestamp: new Date().toISOString(),
            note: `USGS service error: ${error.message}`
        });
    }
}

module.exports = { 
    estimateWaterTemp, 
    estimateWaterTempHybrid,
    getSeasonalBaseTemp,
    getLatitudeBand,
    getLiveWaterTemp,
    findNearbyStations,
    SEASONAL_RATES,
    SEASONAL_BASE_TEMPS,
    LATITUDE_BAND_BASE_TEMPS,
    MAX_STATION_DISTANCE_MILES
};
