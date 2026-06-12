'use strict';

function describeCloudCover(cloudCover) {
    if (typeof cloudCover !== 'number') return 'Unknown';
    if (cloudCover < 20) return 'clear sky';
    if (cloudCover < 50) return 'few clouds';
    if (cloudCover < 80) return 'scattered clouds';
    return 'overcast clouds';
}

function cloudCoverToIconCode(cloudCover) {
    if (typeof cloudCover !== 'number') return '01d';
    if (cloudCover < 20) return '01d';
    if (cloudCover < 50) return '02d';
    if (cloudCover < 80) return '03d';
    return '04d';
}

function transformWeatherData(data, lat, lon) {
    return {
        temp: Math.round(data.main.temp),
        temp_min: Math.round(data.main.temp_min),
        temp_max: Math.round(data.main.temp_max),
        feels_like: Math.round(data.main.feels_like),
        wind: { speed: Math.round(data.wind.speed), direction: data.wind.deg || 0 },
        pressure: data.main.pressure,
        humidity: data.main.humidity,
        desc: data.weather?.[0]?.description || 'Unknown',
        icon: data.weather?.[0]?.icon || '01d',
        visibility: data.visibility ? Math.round(data.visibility / 1609) : null,
        cloudiness: data.clouds?.all || 0,
        hourly: [],
        lat: lat ?? null,
        lon: lon ?? null
    };
}

function generateSearchVariations(location) {
    const variations = new Set();
    const clean = location.trim();
    variations.add(clean);
    if (clean.includes(',')) {
        const parts = clean.split(',').map(p => p.trim());
        variations.add(parts[0]);
        if (parts.length > 1) {
            variations.add(parts.slice(1).join(', '));
            variations.add(parts[1]);
        }
    }
    const skip = ['lake', 'river', 'pond', 'reservoir', 'bay', 'creek', 'stream'];
    const stripped = clean.split(' ').filter(w => !skip.includes(w.toLowerCase().replace(/[^a-z]/g, ''))).join(' ');
    if (stripped && stripped !== clean) variations.add(stripped);
    return Array.from(variations).filter(t => t.length > 0);
}

async function fetchFromOpenWeather(term, apiKey) {
    const currentUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(term)}&appid=${apiKey}&units=imperial`;
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(term)}&appid=${apiKey}&units=imperial`;
    const [currentRes, forecastRes] = await Promise.all([
        fetch(currentUrl, { signal: AbortSignal.timeout(5000) }),
        fetch(forecastUrl, { signal: AbortSignal.timeout(5000) })
    ]);
    if (currentRes.status === 404) return null;
    if (!currentRes.ok) throw new Error(`Weather service returned ${currentRes.status}`);
    const currentData = await currentRes.json();
    const forecastData = forecastRes.ok ? await forecastRes.json() : null;
    return { current: currentData, forecast: forecastData };
}

async function geocodeWithNominatim(term) {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', term);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('countrycodes', 'us');

    const response = await fetch(url, {
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'FishSmart-Pro/2.0'
        },
        signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);
    const data = await response.json();
    const item = Array.isArray(data) ? data[0] : null;
    if (!item?.lat || !item?.lon) return null;
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    // Extract county for disambiguation in grounding prompts
    const county = item.address?.county || item.address?.city || item.address?.town || null;
    return { lat, lon, displayName: item.display_name || term, county, source: 'nominatim' };
}

async function geocodeWithOpenWeather(term, apiKey) {
    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(term)}&limit=1&appid=${apiKey}`;
    const response = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'FishSmart-Pro/2.0' },
        signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`OpenWeather geocoding returned ${response.status}`);
    const data = await response.json();
    const item = Array.isArray(data) ? data[0] : null;
    if (!item?.lat || !item?.lon) return null;
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon, displayName: item.name || term, source: 'openweather' };
}

async function resolveLocationToCoordinates(location, apiKey, openWeatherApiKey = null) {
    const terms = generateSearchVariations(location);
    const geocoders = [
        term => geocodeWithNominatim(term),
        term => (openWeatherApiKey ? geocodeWithOpenWeather(term, openWeatherApiKey) : null)
    ];

    for (const term of terms) {
        for (const geocoder of geocoders) {
            try {
                const coords = await geocoder(term);
                if (coords) return coords;
            } catch (err) {
                console.warn(`Geocode for "${term}" failed:`, err.message);
            }
        }
    }

    // Legacy fallback: some deployments may still rely on the IPGeolocation timezone endpoint.
    if (apiKey) {
        try {
            const url = `https://api.ipgeolocation.io/v3/timezone?apiKey=${apiKey}&location=${encodeURIComponent(location)}`;
            const response = await fetch(url, {
                headers: { 'Accept': 'application/json', 'User-Agent': 'FishSmart-Pro/2.0' },
                signal: AbortSignal.timeout(5000)
            });
            if (response.status !== 404 && response.ok) {
                const data = await response.json();
                const loc = data?.location;
                const lat = parseFloat(loc?.latitude);
                const lon = parseFloat(loc?.longitude);
                if (Number.isFinite(lat) && Number.isFinite(lon)) {
                    return { lat, lon, displayName: location, source: 'ipgeolocation' };
                }
            }
        } catch (err) {
            console.warn('Legacy IPGeolocation geocode failed:', err.message);
        }
    }

    return null;
}

async function fetchFromOpenMeteo(coords) {
    const { lat, lon } = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Invalid coordinates');
    const params = new URLSearchParams({
        latitude: String(lat), longitude: String(lon),
        current: 'temperature_2m,apparent_temperature,relative_humidity_2m,pressure_msl,wind_speed_10m,wind_direction_10m,cloud_cover,visibility',
        hourly: 'pressure_msl,temperature_2m,wind_speed_10m,cloud_cover',
        past_hours: '3',
        forecast_hours: '24',
        temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', timezone: 'auto'
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'FishSmart-Pro/2.0' },
        signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}`);
    const data = await response.json();
    if (!data?.current) throw new Error('Open-Meteo response missing current weather');
    const c = data.current;
    // Use sensible defaults (not 0) when API fields are missing
    const temp = c.temperature_2m ?? 65;
    const pseudo = {
        main: {
            temp: temp,
            temp_min: temp,
            temp_max: temp,
            feels_like: c.apparent_temperature ?? temp,
            pressure: c.pressure_msl ?? 1013,
            humidity: c.relative_humidity_2m ?? 50
        },
        wind: { speed: c.wind_speed_10m ?? 0, deg: c.wind_direction_10m ?? 0 },
        weather: [{ description: describeCloudCover(c.cloud_cover), icon: cloudCoverToIconCode(c.cloud_cover) }],
        visibility: c.visibility ?? null, clouds: { all: c.cloud_cover ?? 0 }
    };
    const wx = transformWeatherData(pseudo, lat, lon);

    // Parse hourly data into history, forecast, and hourly array
    if (data.hourly?.time && data.hourly?.pressure_msl) {
        const now = new Date();
        // Fix timezone: Open-Meteo returns times in the location's local timezone
        // (e.g., '2026-06-02T22:00' in EDT) but new Date() on a UTC server parses
        // them as UTC, creating an offset equal to the location's UTC offset.
        // Use utc_offset_seconds from the API response to correct this.
        const utcOffset = data.utc_offset_seconds || 0;
        const hourlyTime = data.hourly.time.map(t => Date.parse(t + 'Z') - utcOffset * 1000);
        const hourlyPressure = data.hourly.pressure_msl;
        const hourlyTemp = data.hourly.temperature_2m;
        const hourlyWind = data.hourly.wind_speed_10m;
        const hourlyCloud = data.hourly.cloud_cover;
        // Determine current hour boundary: round up if past 30min, down otherwise
        const currentHourMs = now.getMinutes() >= 30
            ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0).getTime() + 3600000
            : new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0).getTime();

        const pressureHistory = [];
        const pressureForecast = [];
        const hourly = [];
        for (let i = 0; i < hourlyTime.length; i++) {
            if (hourlyPressure[i] == null) continue; // skip null values
            const entry = { pressure: hourlyPressure[i], timestamp: hourlyTime[i] };
            if (hourlyTime[i] < currentHourMs) {
                pressureHistory.push(entry);
            } else if (hourlyTime[i] >= currentHourMs) {
                pressureForecast.push(entry);
                // Build hourly weather object for forecasted hours
                hourly.push({
                    temp: hourlyTemp?.[i] ?? wx.temp,
                    pressure: hourlyPressure[i],
                    wind: { speed: hourlyWind?.[i] ?? wx.wind.speed, direction: wx.wind.direction },
                    cloudiness: hourlyCloud?.[i] ?? wx.cloudiness,
                    timestamp: hourlyTime[i],
                    hour: new Date(hourlyTime[i]).getHours()
                });
            }
        }
        wx.pressureHistory = pressureHistory;
        wx.pressureForecast = pressureForecast.slice(0, 12);
        wx.hourly = hourly.slice(0, 12);
    } else {
        wx.pressureHistory = [];
        wx.pressureForecast = [];
        wx.hourly = [];
    }

    return wx;
}

async function fetchUSGSWaterTemp(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const delta = 0.15; // ~10 miles - tight radius for quick weather-service lookup
    const params = new URLSearchParams({
        format: 'json',
        parameterCd: '00010',
        siteType: 'LK,ST,SP',
        period: 'PT2H',
        bbox: `${(lon - delta).toFixed(6)},${(lat - delta).toFixed(6)},${(lon + delta).toFixed(6)},${(lat + delta).toFixed(6)}`
    });
    try {
        const response = await fetch(`https://waterservices.usgs.gov/nwis/iv/?${params}`, {
            signal: AbortSignal.timeout(8000)
        });
        if (!response.ok) return null;
        const data = await response.json();
        const latest = (data.value?.timeSeries || [])
            .map(ts => {
                const values = ts.values?.[0]?.value;
                const lastReading = values?.[values.length - 1];
                if (!lastReading) return null;
                const tempC = Number(lastReading.value);
                return {
                    temp: Number.isFinite(tempC) ? Math.round((tempC * 9 / 5) + 32) : NaN,
                    tempC,
                    time: new Date(lastReading.dateTime).getTime(),
                    siteName: ts.sourceInfo?.siteName
                };
            })
            .filter(entry => entry && Number.isFinite(entry.temp))
            .sort((a, b) => b.time - a.time);
        return latest[0] ?? null;
    } catch (err) {
        console.warn('USGS water temp fetch failed:', err.message);
        return null;
    }
}

function createWeatherService(config) {
    async function getWeatherData(location) {
        try {
            const coords = await resolveLocationToCoordinates(location, config.ipGeoApiKey, config.openWeatherApiKey);
            if (coords) {
                const wx = await fetchFromOpenMeteo(coords);
                if (wx) {
                    wx.locationSource = coords.source || 'geocoder';
                    wx.locationLabel = coords.displayName || location;
                    wx.county = coords.county || null;
                    const waterTempReading = await fetchUSGSWaterTemp(coords.lat, coords.lon);
                    if (waterTempReading) {
                        wx.waterTemp = waterTempReading.temp;
                        wx.waterTempSource = waterTempReading.siteName;
                    }
                    return wx;
                }
            }
        } catch (err) {
            console.warn('Weather (Open-Meteo/geocode):', err.message);
        }
        if (!config.openWeatherApiKey) {
            console.warn('Weather: OPENWEATHER_API_KEY not set.');
            return null;
        }
        const terms = generateSearchVariations(location);
        for (const term of terms) {
            try {
                const raw = await fetchFromOpenWeather(term, config.openWeatherApiKey);
                if (raw) {
                    const wx = transformWeatherData(raw.current, raw.current?.coord?.lat, raw.current?.coord?.lon);
                    wx.waterTemp = raw.current?.waterTemp ?? null;
                    // Extract pressure history from OpenWeather 5-day/3-hour forecast
                    if (raw.forecast?.list) {
                        const now = Date.now();
                        const pressureHistory = [];
                        const pressureForecast = [];
                        for (const item of raw.forecast.list) {
                            const ts = item.dt * 1000;
                            const pressure = item.main?.pressure;
                            if (pressure == null) continue;
                            const entry = { pressure, timestamp: ts };
                            if (ts < now) {
                                pressureHistory.push(entry);
                            } else {
                                pressureForecast.push(entry);
                            }
                        }
                        wx.pressureHistory = pressureHistory;
                        wx.pressureForecast = pressureForecast.slice(0, 12);
                    }
                    return wx;
                }
            } catch (err) {
                console.warn(`Weather for "${term}":`, err.message);
            }
        }
        console.error('Weather: All location variations failed.');
        return null;
    }
    return { getWeatherData };
}

module.exports = { createWeatherService };
