"use strict";
const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { estimateWaterTemp, estimateWaterTempHybrid, getSeasonalBaseTemp, findNearbyStations, getLiveWaterTemp, SEASONAL_RATES } = require('../src/engine/water-temp');

const originalFetch = global.fetch;

afterEach(() => {
    global.fetch = originalFetch;
});

describe('Water Temperature Estimation', () => {
    // === Task 16: Latitude-adjusted seasonal water temp baselines ===
    // The hybrid estimation fallback path adjusts seasonal baselines by latitude band.
    // USGS live data remains primary — latitude model only affects estimation path.
    // [Source: EPA water quality monitoring regional data; USGS regional summaries]

    describe('Latitude-adjusted seasonal baselines', () => {
        it('temperate latitude (>45N) Jan baseline stays cold (~34F)', () => {
            // Minnesota latitude ~47N — water near freezing
            const temp = estimateWaterTempHybrid(20, 1, 47);
            assert.ok(temp >= 32 && temp <= 38,
                `Minnesota Jan water temp ${temp} should be ~32-38F`);
        });

        it('subtropical latitude (30-45N) Jan baseline is milder (~48F)', () => {
            // Georgia latitude ~34N
            const temp = estimateWaterTempHybrid(50, 1, 34);
            assert.ok(temp >= 42 && temp <= 54,
                `Subtropical Jan water temp ${temp} should be ~42-54F`);
        });

        it('tropical latitude (<30N) Jan baseline is warm (~60F)', () => {
            // Florida latitude ~28N — water stays warm in winter
            const temp = estimateWaterTempHybrid(75, 1, 28);
            assert.ok(temp >= 60 && temp <= 70,
                `Florida Jan water temp ${temp} should be ~60-70F, not near 34F`);
        });

        it('Florida Jan 75F air -> water temp 60-70F (not 46F)', () => {
            const temp = estimateWaterTempHybrid(75, 1, 28);
            assert.ok(temp >= 60,
                `Florida Jan with 75F air should be >=60F, got ${temp}`);
        });

        it('Minnesota Jan stays ~34F', () => {
            const temp = estimateWaterTempHybrid(20, 1, 47);
            assert.ok(temp <= 38,
                `Minnesota Jan should stay cold (<=38F), got ${temp}`);
        });

        it('without latitude param, defaults to temperate (backward compat)', () => {
            // No latitude arg should behave same as temperate zone
            const tempNoLat = estimateWaterTempHybrid(65, 7);
            const tempTemperate = estimateWaterTempHybrid(65, 7, 47);
            assert.equal(tempNoLat, tempTemperate,
                'Default (no lat) should equal temperate zone');
        });

        it('getSeasonalBaseTemp returns different values for different lat bands', () => {
            const temperateJan = getSeasonalBaseTemp(1, 47);
            const tropicalJan = getSeasonalBaseTemp(1, 25);
            assert.ok(tropicalJan > temperateJan + 15,
                `Tropical Jan (${tropicalJan}) should be much warmer than temperate (${temperateJan})`);
        });

        it('summer baselines converge across latitudes', () => {
            // Summer water temps are more similar across latitudes than winter
            const temperateJul = getSeasonalBaseTemp(7, 47);
            const tropicalJul = getSeasonalBaseTemp(7, 25);
            const diff = Math.abs(temperateJul - tropicalJul);
            assert.ok(diff <= 15,
                `Summer temp difference ${diff}F should be moderate (<=15F) across latitudes`);
        });

        it('water temp never below 32F even in extreme cold', () => {
            const temp = estimateWaterTempHybrid(-10, 1, 47);
            assert.ok(temp >= 32, `Water temp ${temp} should be >=32F`);
        });

        it('negative latitude (Southern Hemisphere) uses tropical band', () => {
            // Negative latitude should map by absolute value for band selection
            const temp = estimateWaterTempHybrid(75, 1, -10);
            assert.ok(temp >= 60,
                `Tropical (negative lat) Jan should be warm, got ${temp}`);
        });
    });

    it('spring returns water temp BELOW air temp', () => {
        const waterTemp = estimateWaterTemp(70, 4);
        assert.ok(waterTemp < 70, `Water ${waterTemp} should be below air 70 in spring`);
    });

    it('fall returns water temp ABOVE air temp', () => {
        const waterTemp = estimateWaterTemp(70, 10);
        assert.ok(waterTemp > 70, `Water ${waterTemp} should be above air 70 in fall`);
    });

    it('summer returns water temp NEAR air temp', () => {
        const waterTemp = estimateWaterTemp(80, 7);
        const diff = Math.abs(waterTemp - 80);
        assert.ok(diff <= 1, `Diff ${diff} should be <=1 in summer`);
    });

    it('water temp never goes below 32F', () => {
        assert.ok(estimateWaterTemp(20, 1) >= 32);
    });

    it('specific: 60F air April -> 59F water', () => {
        assert.equal(estimateWaterTemp(60, 4), 59);
    });

    it('specific: 60F air October -> ~62F water', () => {
        assert.equal(estimateWaterTemp(60, 10), 62);
    });

    it('exports SEASONAL_RATES for all 12 months', () => {
        for (let m = 1; m <= 12; m++) {
            assert.ok(m in SEASONAL_RATES, `Missing month ${m}`);
            assert.equal(typeof SEASONAL_RATES[m], 'number');
        }
    });

    it('winter returns water above air (cooling lag)', () => {
        assert.ok(estimateWaterTemp(35, 1) >= 35);
    });

    it('findNearbyStations uses one IV bbox request and returns sorted live stations', async () => {
        let requestedUrl = null;
        global.fetch = async (url) => {
            requestedUrl = url;
            return {
                ok: true,
                json: async () => ({
                    value: {
                        timeSeries: [
                            {
                                sourceInfo: {
                                    siteName: 'Farther Site',
                                    siteCode: [{ value: '222' }],
                                    geoLocation: { geogLocation: { latitude: 41.95, longitude: -87.75 } }
                                },
                                variable: { variableName: 'Water temperature, degrees Celsius' },
                                values: [{ value: [{ value: '12.0', dateTime: '2026-04-13T00:00:00.000Z' }] }]
                            },
                            {
                                sourceInfo: {
                                    siteName: 'Closer Site',
                                    siteCode: [{ value: '111' }],
                                    geoLocation: { geogLocation: { latitude: 41.89, longitude: -87.64 } }
                                },
                                variable: { variableName: 'Water temperature, degrees Celsius' },
                                values: [{ value: [{ value: '10.0', dateTime: '2026-04-13T01:00:00.000Z' }] }]
                            }
                        ]
                    }
                })
            };
        };

        const stations = await findNearbyStations(41.8781, -87.6298, 50);

        assert.equal(stations[0].siteCode, '111');
        assert.equal(stations[1].siteCode, '222');
        assert.equal(stations[0].fahrenheit, 50);
        assert.equal(stations[0].celsius, 10);
        assert.match(requestedUrl, /\/iv\/\?format=json/);
        assert.match(requestedUrl, /bBox=/);
        assert.match(requestedUrl, /parameterCd=00010/);
        assert.match(requestedUrl, /period=PT2H/);
        assert.match(requestedUrl, /siteType=LK,ST,SP/);
    });

    it('getLiveWaterTemp uses one IV bbox request and returns the nearest live station', async () => {
        let fetchCount = 0;
        let requestedUrl = null;
        global.fetch = async (url) => {
            fetchCount += 1;
            requestedUrl = url;
            return {
                ok: true,
                json: async () => ({
                    value: {
                        timeSeries: [
                            {
                                sourceInfo: {
                                    siteName: 'Farther Site',
                                    siteCode: [{ value: '222' }],
                                    geoLocation: { geogLocation: { latitude: 41.95, longitude: -87.75 } }
                                },
                                variable: { variableName: 'Water temperature, degrees Celsius' },
                                values: [{ value: [{ value: '12.0', dateTime: '2026-04-13T00:00:00.000Z' }] }]
                            },
                            {
                                sourceInfo: {
                                    siteName: 'Closer Site',
                                    siteCode: [{ value: '111' }],
                                    geoLocation: { geogLocation: { latitude: 41.89, longitude: -87.64 } }
                                },
                                variable: { variableName: 'Water temperature, degrees Celsius' },
                                values: [{ value: [{ value: '10.0', dateTime: '2026-04-13T01:00:00.000Z' }] }]
                            }
                        ]
                    }
                })
            };
        };

        const result = await getLiveWaterTemp(41.8781, -87.6298, 58, 4, 50);

        assert.equal(fetchCount, 1);
        assert.match(requestedUrl, /\/iv\/\?format=json/);
        assert.equal(result.source, 'usgs-live');
        assert.equal(result.stationCode, '111');
        assert.equal(result.stationName, 'Closer Site');
        assert.equal(result.waterTempF, 50);
        assert.equal(result.waterTempC, 10);
    });
});
