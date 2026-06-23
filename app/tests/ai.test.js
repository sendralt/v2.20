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

    it('returns deterministic moon phase in offline mode (not Unknown)', async () => {
        const weatherService = {
            async getWeatherData() {
                return {
                    temp: 70, wind: { speed: 7 }, pressure: 1014,
                    cloudiness: 30, lat: 41.8781, lon: -87.6298,
                    pressureForecast: []
                };
            }
        };

        const biteEngine = {
            async calculateScientificStrategy() {
                return {
                    biteProbability: 50, biteRank: 'Good',
                    biteReasoning: 'Test', recommendedLures: [],
                    waterTemp: 68, waterTempSource: 'mock',
                    waterTempStation: null, waterTempStationDistance: null
                };
            }
        };

        const aiService = createAIService({
            genAI: null, weatherService, biteEngine,
            fishPatterns: '', isDev: false
        });

        const result = await aiService.generateFishingStrategy({
            location: 'Chicago, IL', species: 'Largemouth Bass',
            clarity: 'Clear', isBoat: false, currentTime: '7:00 am'
        });

        // Moon phase should be deterministic, not 'Unknown'
        assert.ok(result.solunar, 'Result should have solunar object');
        assert.notEqual(result.solunar.moon_phase, 'Unknown',
            'Moon phase should be computed, not Unknown');
        assert.ok(typeof result.solunar.moon_phase === 'string');
        assert.ok(result.solunar.moon_illumination != null,
            'Should include illumination percentage');
    });
});

describe('AI service deterministic moon phase', () => {
    it('moon_phase is computed from lunar.js, not AI guessed', async () => {
        const { getMoonPhase } = require('../src/engine/lunar');
        const computedPhase = getMoonPhase(new Date());

        const weatherService = {
            async getWeatherData() {
                return {
                    temp: 70, wind: { speed: 7 }, pressure: 1014,
                    cloudiness: 30, lat: 41.8781, lon: -87.6298,
                    pressureForecast: []
                };
            }
        };

        const biteEngine = {
            async calculateScientificStrategy() {
                return {
                    biteProbability: 50, biteRank: 'Good',
                    biteReasoning: 'Test', recommendedLures: [],
                    waterTemp: 68, waterTempSource: 'mock',
                    waterTempStation: null, waterTempStationDistance: null
                };
            }
        };

        const aiService = createAIService({
            genAI: null, weatherService, biteEngine,
            fishPatterns: '', isDev: false
        });

        const result = await aiService.generateFishingStrategy({
            location: 'Chicago, IL', species: 'Largemouth Bass',
            clarity: 'Clear', isBoat: false, currentTime: '7:00 am'
        });

        assert.equal(result.solunar.moon_phase, computedPhase.label,
            `Moon phase should be '${computedPhase.label}' from lunar.js`);
    });
});

describe('mergeLures', () => {
    const { mergeLures } = require('../src/services/ai');

    it('merges engine and AI lures sorted by score descending', () => {
        const engine = [
            { name: 'Crankbait', score: 0.9, rank: 'Excellent', cover: 'Rocks', presentation: 'Steady', reason: 'Engine' }
        ];
        const ai = [
            { name: 'Ned Rig', score: 0.95, rank: 'Excellent', cover: 'Bottom', presentation: 'Drag', reason: 'AI' }
        ];
        const result = mergeLures(engine, ai);
        assert.equal(result.length, 2);
        assert.equal(result[0].name, 'Ned Rig');  // higher score wins
        assert.equal(result[1].name, 'Crankbait');
    });

    it('tags each lure with source', () => {
        const engine = [
            { name: 'Jig', score: 0.8, rank: 'Very Good', cover: 'Rock', presentation: 'Hop', reason: 'E' }
        ];
        const ai = [
            { name: 'Drop Shot', score: 0.7, rank: 'Good', cover: 'Bottom', presentation: 'Slow', reason: 'A' }
        ];
        const result = mergeLures(engine, ai);
        assert.equal(result[0].source, 'engine');
        assert.equal(result[1].source, 'ai');
    });

    it('deduplicates by normalized name keeping higher score', () => {
        const engine = [
            { name: '  Senko  Worm ', score: 0.85, rank: 'Excellent', cover: 'C', presentation: 'P', reason: 'E' }
        ];
        const ai = [
            { name: 'senko worm', score: 0.6, rank: 'Good', cover: 'C2', presentation: 'P2', reason: 'A' }
        ];
        const result = mergeLures(engine, ai);
        assert.equal(result.length, 1);
        assert.equal(result[0].name, '  Senko  Worm ');  // first occurrence (higher score) wins
        assert.equal(result[0].score, 0.85);
    });

    it('caps total lures at 5', () => {
        const engine = [
            { name: 'A', score: 0.9 },
            { name: 'B', score: 0.85 },
            { name: 'C', score: 0.8 }
        ];
        const ai = [
            { name: 'D', score: 0.75 },
            { name: 'E', score: 0.7 },
            { name: 'F', score: 0.65 }
        ];
        const result = mergeLures(engine, ai);
        assert.equal(result.length, 5);
        assert.equal(result[4].name, 'E');  // 5th by score
    });

    it('handles empty engine lures', () => {
        const result = mergeLures([], [{ name: 'AI Lure', score: 0.8 }]);
        assert.equal(result.length, 1);
        assert.equal(result[0].source, 'ai');
    });

    it('handles empty AI lures', () => {
        const result = mergeLures([{ name: 'Engine Lure', score: 0.8 }], []);
        assert.equal(result.length, 1);
        assert.equal(result[0].source, 'engine');
    });

    it('handles null/undefined inputs gracefully', () => {
        const result = mergeLures(null, undefined);
        assert.deepEqual(result, []);
    });

    it('handles lures without score (defaults to 0)', () => {
        const result = mergeLures([{ name: 'No Score Lure' }], []);
        assert.equal(result.length, 1);
        assert.equal(result[0].score, 0);
    });
});

// === Regression: generateSearchVariations must not produce bare state names ===
const weatherModule = require('../src/services/weather');
