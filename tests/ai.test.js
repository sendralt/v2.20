"use strict";

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createAIService } = require('../src/services/ai');

describe('AI service offline fallback', () => {
    it('surfaces live water temperature station metadata at the top level', async () => {
        const weatherService = {
            async getWeatherData() {
                return {
                    temp: 58,
                    feels_like: 56,
                    wind: { speed: 7, direction: 180 },
                    pressure: 1014,
                    humidity: 55,
                    desc: 'partly cloudy',
                    visibility: 10,
                    cloudiness: 40,
                    lat: 41.8781,
                    lon: -87.6298,
                    pressureForecast: []
                };
            }
        };

        const biteEngine = {
            async calculateScientificStrategy() {
                return {
                    biteProbability: 29,
                    biteRank: 'Tough',
                    biteReasoning: 'Scientific engine returned a live station reading.',
                    recommendedLures: [],
                    waterTemp: 54,
                    waterTempSource: 'usgs-live',
                    waterTempStation: 'CHICAGO S & S CANAL AT WESTERN AVE AT CHICAGO, IL',
                    waterTempStationDistance: 8.4
                };
            }
        };

        const aiService = createAIService({
            genAI: null,
            weatherService,
            biteEngine,
            fishPatterns: '',
            isDev: false
        });

        const result = await aiService.generateFishingStrategy({
            location: 'Chicago, IL',
            species: 'Largemouth Bass',
            clarity: 'Clear',
            isBoat: false,
            currentTime: '7:00 am'
        });

        assert.equal(result.offline_mode, true);
        assert.equal(result.water_temp, 54);
        assert.equal(result.water_temp_source, 'usgs-live');
        assert.equal(result.water_temp_station, 'CHICAGO S & S CANAL AT WESTERN AVE AT CHICAGO, IL');
        assert.equal(result.water_temp_station_distance, 8.4);
    });
});