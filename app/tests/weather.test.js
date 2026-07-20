"use strict";

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { generateSearchVariations } = require('../src/services/weather');

describe('generateSearchVariations', () => {
    it('does not produce bare state names from comma split', () => {
        // Regression: "Spring Valley Wetland, Ohio" produced "Ohio" as a standalone
        // search term, which geocoded to the geographic center of Ohio (near Columbus)
        // and caused Alum Creek at Africa OH to appear as the nearest USGS station.
        const variations = generateSearchVariations('Spring Valley Wetland, Ohio');
        assert.ok(!variations.includes('Ohio'), 'should NOT contain bare state name "Ohio"');
        assert.ok(variations.includes('Spring Valley Wetland, Ohio'), 'should contain full location');
        assert.ok(variations.includes('Spring Valley Wetland'), 'should contain location without state');
    });

    it('preserves multi-word county/region from comma split', () => {
        const variations = generateSearchVariations('Lake Erie, Ottawa County, Ohio');
        assert.ok(!variations.includes('Ohio'), 'should NOT contain bare state name');
        assert.ok(variations.includes('Ottawa County, Ohio'), 'should contain multi-word remainder');
        assert.ok(variations.includes('Ottawa County'), 'should contain multi-word county name');
    });

    it('handles no-comma input unchanged', () => {
        const variations = generateSearchVariations('Lake Michigan');
        assert.ok(variations.includes('Lake Michigan'), 'should contain original');
    });

    it('does not produce bare state for simple city, state', () => {
        const variations = generateSearchVariations('Columbus, Ohio');
        assert.ok(!variations.includes('Ohio'), 'should NOT contain bare state name');
        assert.ok(variations.includes('Columbus'), 'should contain city name');
    });
});

describe('Weather Service Timezone Alignment', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('correctly parses hourly weather hour using the location local timezone offset', async () => {
        // Generate timestamps relative to 'now' so they always fall in the forecast window
        const _now = new Date();
        const _utcOffset = -14400; // EDT (UTC -4h)
        const _h1 = new Date(Date.UTC(_now.getUTCFullYear(), _now.getUTCMonth(), _now.getUTCDate(), _now.getUTCHours() + 1, 0, 0));
        const _h2 = new Date(Date.UTC(_now.getUTCFullYear(), _now.getUTCMonth(), _now.getUTCDate(), _now.getUTCHours() + 2, 0, 0));
        const _fmtLocal = (d) => {
            const local = new Date(d.getTime() + _utcOffset * 1000);
            return local.toISOString().slice(0, 13) + ':00';
        };
        const mockOpenMeteoResponse = {
            current: {
                temperature_2m: 72,
                apparent_temperature: 70,
                relative_humidity_2m: 50,
                pressure_msl: 1013,
                wind_speed_10m: 5,
                wind_direction_10m: 180,
                cloud_cover: 20,
                visibility: 10
            },
            hourly: {
                time: [
                    _fmtLocal(_h1),
                    _fmtLocal(_h2)
                ],
                pressure_msl: [1013, 1014],
                temperature_2m: [72, 73],
                wind_speed_10m: [5, 6],
                cloud_cover: [20, 25]
            },
            utc_offset_seconds: -14400 // EDT (UTC -4h)
        };

        globalThis.fetch = async (url) => {
            const urlStr = String(url);
            if (urlStr.includes('nominatim.openstreetmap.org')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => [{
                        lat: '41.8781',
                        lon: '-87.6298',
                        display_name: 'Chicago, IL',
                        address: { county: 'Cook' }
                    }]
                };
            }
            if (urlStr.includes('api.open-meteo.com')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => mockOpenMeteoResponse
                };
            }
            if (urlStr.includes('waterdata.usgs.gov')) {
                return {
                    ok: false,
                    status: 404,
                    json: async () => ({})
                };
            }
            return { ok: false, status: 404 };
        };

        const { createWeatherService } = require('../src/services/weather');
        const service = createWeatherService({
            ipGeoApiKey: 'mock-key',
            openWeatherApiKey: 'mock-key'
        });

        const data = await service.getWeatherData('Chicago, IL');
        assert.ok(data);
        assert.ok(data.hourly && data.hourly.length > 0);
        
        data.hourly.forEach((entry) => {
            const idx = mockOpenMeteoResponse.hourly.time.findIndex((t) => {
                const ts = Date.parse(t + 'Z') - (-14400 * 1000);
                return ts === entry.timestamp;
            });
            assert.ok(idx !== -1, 'Must find matching raw entry');
            const expectedHour = parseInt(mockOpenMeteoResponse.hourly.time[idx].split('T')[1].split(':')[0]);
            assert.equal(entry.hour, expectedHour, `Hour for timestamp ${entry.timestamp} must match local hour ${expectedHour}`);
        });
    });
});
